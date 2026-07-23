import { Logger } from '@nestjs/common';
import axios from 'axios';
import { CrawlerAdapter } from '../crawler.service';
import { parseResultadosTjba, TjbaGraphqlResponse } from '../parsers/tjba-graphql.parser';

const GRAPHQL_URL = 'https://jurisprudenciaws.tjba.jus.br/graphql';
const ITENS_POR_PAGINA = 10;
// Modo "varrer tudo": confirmado ao vivo que `assunto: ""` (vazio)
// devolve o acervo inteiro (3.289.223 itens em 2026-07-22), sem
// precisar de termo. itemsPerPage testado ate 1000 sem erro; usamos
// 500 por seguranca. Mas o backend (Elasticsearch por tras do
// GraphQL) rejeita offset acima de 10.000 ("Internal Server Error(s)"
// na pagina 20 com itemsPerPage=500) — o classico limite padrao
// `max_result_window` do ES. Como um ano inteiro já passa de 250-300
// mil itens (bem acima do teto), particionamos por DIA — confirmado
// ao vivo que o pico observado num dia de alto volume foi ~285 itens,
// bem abaixo de 10.000, mesmo em dezembro/2024 (mes de pico).
const ITENS_POR_PAGINA_VARRER_TUDO = 500;
const ANO_INICIAL = 2008; // confirmado ao vivo: 2007 = 0 itens, 2008 = primeiros registros
const OFFSET_MAX_SEGURO = 9500;
const PAGINAS_MAX_POR_DIA = Math.floor(OFFSET_MAX_SEGURO / ITENS_POR_PAGINA_VARRER_TUDO);

const QUERY = `query filter($decisaoFilter: DecisaoFilter!,$pageNumber: Int!,$itemsPerPage: Int!) {
  filter(decisaoFilter: $decisaoFilter,pageNumber: $pageNumber,itemsPerPage: $itemsPerPage) {
    decisoes {
      dataPublicacao
      dataJulgamento
      relator { nome }
      orgaoJulgador { nome }
      ementa
      numeroProcesso
    }
    pageCount
    itemCount
  }
}`;

export interface TjbaTermo {
  termo: string;
  area?: string;
}

export interface TjbaGraphqlConfig {
  termos: TjbaTermo[];
  maxPaginasPorTermo?: number;
  /** Ignora `termos` e varre o acervo inteiro (assunto vazio). */
  varrerTudo?: boolean;
}

export const TERMOS_PADRAO_TJBA: TjbaTermo[] = [
  { termo: 'benefício previdenciário', area: 'PREVIDENCIARIO' },
  { termo: 'relação de emprego', area: 'TRABALHISTA' },
  { termo: 'responsabilidade civil', area: 'CIVIL' },
  { termo: 'direito de família', area: 'FAMILIA' },
  { termo: 'habeas corpus', area: 'CRIMINAL' },
  { termo: 'execução fiscal', area: 'TRIBUTARIO' },
  { termo: 'ato administrativo', area: 'OUTRO' },
];

/**
 * Coleta acórdãos do TJBA via GraphQL nativo — sem CAPTCHA, sem
 * exigência de browser, JSON estruturado direto. Endpoint não
 * documentado publicamente, descoberto ao vivo (ver
 * tjba-graphql.parser.ts).
 */
export class TjbaGraphqlAdapter implements CrawlerAdapter {
  tribunalSigla = 'TJBA';
  private readonly logger = new Logger(TjbaGraphqlAdapter.name);

  constructor(private readonly config: TjbaGraphqlConfig) {}

  async *coletar() {
    if (this.config.varrerTudo) {
      yield* this.varrerAcervoCompleto();
      return;
    }

    const termos = this.config.termos.length ? this.config.termos : TERMOS_PADRAO_TJBA;
    const maxPaginas = this.config.maxPaginasPorTermo ?? 5;

    for (const { termo, area } of termos) {
      // O front-end oficial junta palavras com "AND" pra formar a busca
      // booleana — reproduzimos o mesmo formato.
      const assunto = termo.trim().split(/\s+/).join(' AND ');

      let pagina = 0;
      while (pagina < maxPaginas) {
        let json: TjbaGraphqlResponse;
        try {
          const resp = await axios.post<TjbaGraphqlResponse>(
            GRAPHQL_URL,
            {
              operationName: 'filter',
              variables: {
                decisaoFilter: {
                  assunto,
                  orgaos: [],
                  relatores: [],
                  classes: [],
                  dataInicial: '1980-02-01T03:00:00.000Z',
                  segundoGrau: true,
                  turmasRecursais: true,
                  tipoAcordaos: true,
                  tipoDecisoesMonocraticas: true,
                  ordenadoPor: 'dataPublicacao',
                },
                pageNumber: pagina,
                itemsPerPage: ITENS_POR_PAGINA,
              },
              query: QUERY,
            },
            {
              headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; JuitBot/1.0)' },
              timeout: 20000,
            },
          );
          json = resp.data;
        } catch (err: any) {
          this.logger.warn(`TJBA: falha na requisicao (termo "${termo}", pagina ${pagina}): ${err.message}`);
          break;
        }

        const itens = parseResultadosTjba(json);
        if (!itens.length) {
          this.logger.log(`TJBA: termo "${termo}", pagina ${pagina} sem resultados, encerrando termo`);
          break;
        }

        for (const item of itens) {
          yield {
            numeroProcesso: item.numeroProcesso,
            orgaoJulgador: item.orgaoJulgador,
            relator: item.relator,
            dataJulgamento: item.dataJulgamento,
            area,
            ementa: item.ementa,
          };
        }

        pagina++;
        await esperar(1000);
      }

      await esperar(1000);
    }
  }

  private async *varrerAcervoCompleto() {
    const hoje = new Date();

    for (let dia = new Date(hoje); dia >= new Date(`${ANO_INICIAL}-01-01`); dia.setDate(dia.getDate() - 1)) {
      const dataIso = dia.toISOString().slice(0, 10);
      let pagina = 0;
      let falhasSeguidas = 0;

      while (pagina < PAGINAS_MAX_POR_DIA) {
        let json: TjbaGraphqlResponse;
        try {
          const resp = await axios.post<TjbaGraphqlResponse>(
            GRAPHQL_URL,
            {
              operationName: 'filter',
              variables: {
                decisaoFilter: {
                  assunto: '',
                  orgaos: [],
                  relatores: [],
                  classes: [],
                  dataInicial: `${dataIso}T03:00:00.000Z`,
                  dataFinal: `${dataIso}T23:59:59.000Z`,
                  segundoGrau: true,
                  turmasRecursais: true,
                  tipoAcordaos: true,
                  tipoDecisoesMonocraticas: true,
                  ordenadoPor: 'dataPublicacao',
                },
                pageNumber: pagina,
                itemsPerPage: ITENS_POR_PAGINA_VARRER_TUDO,
              },
              query: QUERY,
            },
            {
              headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; JuitBot/1.0)' },
              timeout: 30000,
            },
          );
          json = resp.data;
          // O GraphQL retorna 200 OK mesmo em erro interno (data: null,
          // errors: [...]) — sem isso, o optional chaining no parser
          // silenciosamente devolve array vazio, e o loop confunde erro
          // com "acabaram os resultados".
          if (json.errors?.length) {
            throw new Error(`GraphQL error: ${json.errors[0]?.message ?? 'erro desconhecido'}`);
          }
          falhasSeguidas = 0;
        } catch (err: any) {
          falhasSeguidas++;
          this.logger.warn(`TJBA: falha na requisicao (varrer tudo, dia ${dataIso}, pagina ${pagina}): ${err.message}`);
          if (falhasSeguidas >= 5) {
            this.logger.error(`TJBA: 5 falhas seguidas no dia ${dataIso}, pulando para o proximo dia`);
            break;
          }
          await esperar(5000);
          continue;
        }

        const itens = parseResultadosTjba(json);
        if (!itens.length) {
          break;
        }

        for (const item of itens) {
          yield {
            numeroProcesso: item.numeroProcesso,
            orgaoJulgador: item.orgaoJulgador,
            relator: item.relator,
            dataJulgamento: item.dataJulgamento,
            ementa: item.ementa,
          };
        }

        pagina++;
        await esperar(500);
      }

      if (pagina >= PAGINAS_MAX_POR_DIA) {
        this.logger.warn(`TJBA: dia ${dataIso} atingiu o teto de seguranca de offset (${OFFSET_MAX_SEGURO}) sem esgotar — pode haver registros nao coletados nesse dia`);
      }
    }
  }
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
