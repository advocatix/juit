import { Logger } from '@nestjs/common';
import axios from 'axios';
import { CrawlerAdapter } from '../crawler.service';
import { parseResultadosTjce, TjceApiResponse } from '../parsers/tjce-sjuris.parser';

const API_URL = 'https://gateway.tjce.jus.br/sjuris/api/v1/jurisprudencia/';
const ITENS_POR_PAGINA = 10;

export interface TjceTermo {
  termo: string;
  area?: string;
}

export interface TjceSjurisConfig {
  termos: TjceTermo[];
  maxPaginasPorTermo?: number;
}

export const TERMOS_PADRAO_TJCE: TjceTermo[] = [
  { termo: 'benefício previdenciário', area: 'PREVIDENCIARIO' },
  { termo: 'relação de emprego', area: 'TRABALHISTA' },
  { termo: 'responsabilidade civil', area: 'CIVIL' },
  { termo: 'direito de família', area: 'FAMILIA' },
  { termo: 'habeas corpus', area: 'CRIMINAL' },
  { termo: 'execução fiscal', area: 'TRIBUTARIO' },
  { termo: 'ato administrativo', area: 'OUTRO' },
];

/**
 * Coleta acórdãos do TJCE via SJURIS (API REST JSON, sistema novo
 * lançado out/2023). Sem CAPTCHA, sem exigência de browser.
 */
export class TjceSjurisAdapter implements CrawlerAdapter {
  tribunalSigla = 'TJCE';
  private readonly logger = new Logger(TjceSjurisAdapter.name);

  constructor(private readonly config: TjceSjurisConfig) {}

  async *coletar() {
    const termos = this.config.termos.length ? this.config.termos : TERMOS_PADRAO_TJCE;
    const maxPaginas = this.config.maxPaginasPorTermo ?? 5;

    for (const { termo, area } of termos) {
      let pagina = 0;

      while (pagina < maxPaginas) {
        let json: TjceApiResponse;
        try {
          const resp = await axios.post<TjceApiResponse>(
            `${API_URL}?page=${pagina}&size=${ITENS_POR_PAGINA}`,
            {
              dataJulgamento: [],
              busca: termo,
              ordenacao: 'order1',
              nomeDocumento: ['ACÓRDÃO'],
              baseDocumento: ['2º GRAU'],
              origem: ['PJE'],
            },
            {
              headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; JuitBot/1.0)' },
              timeout: 20000,
            },
          );
          json = resp.data;
        } catch (err: any) {
          this.logger.warn(`TJCE: falha na requisicao (termo "${termo}", pagina ${pagina}): ${err.message}`);
          break;
        }

        const itens = parseResultadosTjce(json);
        if (!itens.length) {
          this.logger.log(`TJCE: termo "${termo}", pagina ${pagina} sem resultados, encerrando termo`);
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
