import { Logger } from '@nestjs/common';
import axios from 'axios';
import { CrawlerAdapter } from '../crawler.service';
import { parseResultadosTjba, TjbaGraphqlResponse } from '../parsers/tjba-graphql.parser';

const GRAPHQL_URL = 'https://jurisprudenciaws.tjba.jus.br/graphql';
const ITENS_POR_PAGINA = 10;

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
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
