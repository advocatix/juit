import { Logger } from '@nestjs/common';
import axios from 'axios';
import { CrawlerAdapter } from '../crawler.service';
import { parseResultadosTjdf, TjdfApiResponse } from '../parsers/tjdf-jurisdf.parser';

const API_URL = 'https://jurisdf.tjdft.jus.br/api/v1/pesquisa';
const ITENS_POR_PAGINA = 20;

export interface TjdfTermo {
  termo: string;
  area?: string;
}

export interface TjdfJurisdfConfig {
  termos: TjdfTermo[];
  maxPaginasPorTermo?: number;
}

export const TERMOS_PADRAO_TJDF: TjdfTermo[] = [
  { termo: 'benefício previdenciário', area: 'PREVIDENCIARIO' },
  { termo: 'relação de emprego', area: 'TRABALHISTA' },
  { termo: 'responsabilidade civil', area: 'CIVIL' },
  { termo: 'direito de família', area: 'FAMILIA' },
  { termo: 'habeas corpus', area: 'CRIMINAL' },
  { termo: 'execução fiscal', area: 'TRIBUTARIO' },
  { termo: 'ato administrativo', area: 'OUTRO' },
];

/**
 * Coleta acórdãos do TJDFT via JurisDF (API REST JSON nativa, sistema
 * novo lançado out/2024). Sem CAPTCHA, sem exigência de browser.
 */
export class TjdfJurisdfAdapter implements CrawlerAdapter {
  tribunalSigla = 'TJDFT';
  private readonly logger = new Logger(TjdfJurisdfAdapter.name);

  constructor(private readonly config: TjdfJurisdfConfig) {}

  async *coletar() {
    const termos = this.config.termos.length ? this.config.termos : TERMOS_PADRAO_TJDF;
    const maxPaginas = this.config.maxPaginasPorTermo ?? 5;

    for (const { termo, area } of termos) {
      let pagina = 0;

      while (pagina < maxPaginas) {
        let json: TjdfApiResponse;
        try {
          const resp = await axios.post<TjdfApiResponse>(
            API_URL,
            {
              query: termo,
              termosAcessorios: [],
              pagina,
              tamanho: ITENS_POR_PAGINA,
              sinonimos: true,
              espelho: true,
              inteiroTeor: false,
              retornaInteiroTeor: false,
              retornaTotalizacao: true,
            },
            {
              headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; JuitBot/1.0)' },
              timeout: 20000,
            },
          );
          json = resp.data;
        } catch (err: any) {
          this.logger.warn(`TJDFT: falha na requisicao (termo "${termo}", pagina ${pagina}): ${err.message}`);
          break;
        }

        const itens = parseResultadosTjdf(json);
        if (!itens.length) {
          this.logger.log(`TJDFT: termo "${termo}", pagina ${pagina} sem resultados, encerrando termo`);
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
