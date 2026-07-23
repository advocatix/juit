import { Logger } from '@nestjs/common';
import axios from 'axios';
import { CrawlerAdapter } from '../crawler.service';
import { parseResultadosTjmt, TjmtApiResponse } from '../parsers/tjmt-hellsgate.parser';

const API_URL = 'https://hellsgate-preview.tjmt.jus.br/jurisprudencia/api/Consulta';
// Token fixo do frontend público (não é segredo por-usuário — qualquer
// browser que carrega jurisprudencia.tjmt.jus.br envia o mesmo valor).
const TOKEN = '3u35s547H0twxVuT';
const ITENS_POR_PAGINA = 10;
// Modo "varrer tudo": confirmado ao vivo que `termoDeBusca: ""` devolve
// o acervo inteiro (1.081.143 acordaos em 2026-07-22, campo
// CountAcordaoDocumento). Tamanho maximo aceito pela API e 100 (200
// retorna erro "QuantidadePagina invalido").
const ITENS_POR_PAGINA_VARRER_TUDO = 100;
const PAGINAS_MAX_SEGURANCA = 20000;

export interface TjmtTermo {
  termo: string;
  area?: string;
}

export interface TjmtHellsgateConfig {
  termos: TjmtTermo[];
  maxPaginasPorTermo?: number;
  /** Ignora `termos` e varre o acervo inteiro (termoDeBusca vazio). */
  varrerTudo?: boolean;
}

export const TERMOS_PADRAO_TJMT: TjmtTermo[] = [
  { termo: 'benefício previdenciário', area: 'PREVIDENCIARIO' },
  { termo: 'relação de emprego', area: 'TRABALHISTA' },
  { termo: 'responsabilidade civil', area: 'CIVIL' },
  { termo: 'direito de família', area: 'FAMILIA' },
  { termo: 'habeas corpus', area: 'CRIMINAL' },
  { termo: 'execução fiscal', area: 'TRIBUTARIO' },
  { termo: 'ato administrativo', area: 'OUTRO' },
];

/**
 * Coleta acórdãos do TJMT via o Portal Jurisprudência (API REST JSON).
 * Sem CAPTCHA, sem exigência de browser — só o header `token` fixo.
 */
export class TjmtHellsgateAdapter implements CrawlerAdapter {
  tribunalSigla = 'TJMT';
  private readonly logger = new Logger(TjmtHellsgateAdapter.name);

  constructor(private readonly config: TjmtHellsgateConfig) {}

  async *coletar() {
    if (this.config.varrerTudo) {
      yield* this.varrerAcervoCompleto();
      return;
    }

    const termos = this.config.termos.length ? this.config.termos : TERMOS_PADRAO_TJMT;
    const maxPaginas = this.config.maxPaginasPorTermo ?? 5;

    for (const { termo, area } of termos) {
      let pagina = 1;

      while (pagina <= maxPaginas) {
        let json: TjmtApiResponse;
        try {
          const resp = await axios.get<TjmtApiResponse>(API_URL, {
            params: {
              'filtro.isBasica': true,
              'filtro.indicePagina': pagina,
              'filtro.quantidadePagina': ITENS_POR_PAGINA,
              'filtro.tipoConsulta': 'Acordao',
              'filtro.termoDeBusca': termo,
              'filtro.tipoBusca': 1,
              'filtro.ordenacao.ordenarPor': 'DataDecrescente',
              'filtro.ordenacao.ordenarDataPor': 'Julgamento',
              'filtro.thesaurus': false,
            },
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; JuitBot/1.0)',
              Accept: 'application/json',
              token: TOKEN,
            },
            timeout: 20000,
          });
          json = resp.data;
        } catch (err: any) {
          this.logger.warn(`TJMT: falha na requisicao (termo "${termo}", pagina ${pagina}): ${err.message}`);
          break;
        }

        const itens = parseResultadosTjmt(json);
        if (!itens.length) {
          this.logger.log(`TJMT: termo "${termo}", pagina ${pagina} sem resultados, encerrando termo`);
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
    let pagina = 1;
    let falhasSeguidas = 0;

    while (pagina <= PAGINAS_MAX_SEGURANCA) {
      let json: TjmtApiResponse;
      try {
        const resp = await axios.get<TjmtApiResponse>(API_URL, {
          params: {
            'filtro.isBasica': true,
            'filtro.indicePagina': pagina,
            'filtro.quantidadePagina': ITENS_POR_PAGINA_VARRER_TUDO,
            'filtro.tipoConsulta': 'Acordao',
            'filtro.termoDeBusca': '',
            'filtro.tipoBusca': 1,
            'filtro.ordenacao.ordenarPor': 'DataDecrescente',
            'filtro.ordenacao.ordenarDataPor': 'Julgamento',
            'filtro.thesaurus': false,
          },
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; JuitBot/1.0)',
            Accept: 'application/json',
            token: TOKEN,
          },
          timeout: 30000,
        });
        json = resp.data;
        falhasSeguidas = 0;
      } catch (err: any) {
        falhasSeguidas++;
        this.logger.warn(`TJMT: falha na requisicao (varrer tudo, pagina ${pagina}): ${err.message}`);
        if (falhasSeguidas >= 5) {
          throw new Error(`TJMT: 5 falhas seguidas na pagina ${pagina} durante varredura completa (parcial: nao esgotou o acervo) — ${err.message}`);
        }
        await esperar(5000);
        continue;
      }

      const itens = parseResultadosTjmt(json);
      if (!itens.length) {
        this.logger.log(`TJMT: varredura completa encerrada na pagina ${pagina} (sem mais resultados)`);
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

      if (pagina % 20 === 0) {
        this.logger.log(`TJMT: varredura completa, pagina ${pagina} (total esperado: ${json.CountAcordaoDocumento ?? '?'})`);
      }

      pagina++;
      await esperar(800);
    }
  }
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
