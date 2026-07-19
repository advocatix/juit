import { Logger } from '@nestjs/common';
import axios from 'axios';
import { CrawlerAdapter } from '../crawler.service';
import { parseResultadosTjes, TjesApiResponse } from '../parsers/tjes-solr.parser';

const API_URL = 'https://sistemas.tjes.jus.br/consulta-jurisprudencia/api/search';
const CORE = 'pje2g';
const ITENS_POR_PAGINA = 20;

export interface TjesTermo {
  termo: string;
  area?: string;
}

export interface TjesSolrConfig {
  termos: TjesTermo[];
  maxPaginasPorTermo?: number;
}

export const TERMOS_PADRAO_TJES: TjesTermo[] = [
  { termo: 'benefício previdenciário', area: 'PREVIDENCIARIO' },
  { termo: 'relação de emprego', area: 'TRABALHISTA' },
  { termo: 'responsabilidade civil', area: 'CIVIL' },
  { termo: 'direito de família', area: 'FAMILIA' },
  { termo: 'habeas corpus', area: 'CRIMINAL' },
  { termo: 'execução fiscal', area: 'TRIBUTARIO' },
  { termo: 'ato administrativo', area: 'OUTRO' },
];

/**
 * Coleta acórdãos do TJES via a API de consulta de jurisprudência
 * (proxy próprio sobre Solr). Sem CAPTCHA, sem exigência de browser.
 */
export class TjesSolrAdapter implements CrawlerAdapter {
  tribunalSigla = 'TJES';
  private readonly logger = new Logger(TjesSolrAdapter.name);

  constructor(private readonly config: TjesSolrConfig) {}

  async *coletar() {
    const termos = this.config.termos.length ? this.config.termos : TERMOS_PADRAO_TJES;
    const maxPaginas = this.config.maxPaginasPorTermo ?? 5;

    for (const { termo, area } of termos) {
      let pagina = 1;

      while (pagina <= maxPaginas) {
        let json: TjesApiResponse;
        try {
          const resp = await axios.get<TjesApiResponse>(API_URL, {
            params: { core: CORE, q: termo, page: pagina, per_page: ITENS_POR_PAGINA },
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JuitBot/1.0)' },
            timeout: 20000,
          });
          json = resp.data;
        } catch (err: any) {
          this.logger.warn(`TJES: falha na requisicao (termo "${termo}", pagina ${pagina}): ${err.message}`);
          break;
        }

        const itens = parseResultadosTjes(json);
        if (!itens.length) {
          this.logger.log(`TJES: termo "${termo}", pagina ${pagina} sem resultados, encerrando termo`);
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
