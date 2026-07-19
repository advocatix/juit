import { Logger } from '@nestjs/common';
import axios from 'axios';
import { CrawlerAdapter } from '../crawler.service';
import { parseResultadosTjpb, TjpbApiResponse } from '../parsers/tjpb-jurispb.parser';

const API_URL = 'https://app.tjpb.jus.br/juris-pb-backend/public/search';
const ITENS_POR_PAGINA = 10;

export interface TjpbTermo {
  termo: string;
  area?: string;
}

export interface TjpbJurispbConfig {
  termos: TjpbTermo[];
  maxPaginasPorTermo?: number;
}

export const TERMOS_PADRAO_TJPB: TjpbTermo[] = [
  { termo: 'benefício previdenciário', area: 'PREVIDENCIARIO' },
  { termo: 'relação de emprego', area: 'TRABALHISTA' },
  { termo: 'responsabilidade civil', area: 'CIVIL' },
  { termo: 'direito de família', area: 'FAMILIA' },
  { termo: 'habeas corpus', area: 'CRIMINAL' },
  { termo: 'execução fiscal', area: 'TRIBUTARIO' },
  { termo: 'ato administrativo', area: 'OUTRO' },
];

/**
 * Coleta acórdãos do TJPB via JurisPB (API REST JSON, sistema novo).
 * Sem CAPTCHA, sem exigência de browser. Filtra por
 * `instancia=SEGUNDO_GRAU` — resultados de primeiro grau (sentenças)
 * vêm com `ementa: null`, não servem como jurisprudência citável.
 */
export class TjpbJurispbAdapter implements CrawlerAdapter {
  tribunalSigla = 'TJPB';
  private readonly logger = new Logger(TjpbJurispbAdapter.name);

  constructor(private readonly config: TjpbJurispbConfig) {}

  async *coletar() {
    const termos = this.config.termos.length ? this.config.termos : TERMOS_PADRAO_TJPB;
    const maxPaginas = this.config.maxPaginasPorTermo ?? 5;

    for (const { termo, area } of termos) {
      let pagina = 0;

      while (pagina < maxPaginas) {
        let json: TjpbApiResponse;
        try {
          const resp = await axios.get<TjpbApiResponse>(API_URL, {
            params: {
              advanced: true,
              page: pagina,
              size: ITENS_POR_PAGINA,
              sort: 'DATA_JULGAMENTO',
              order: 'DESC',
              searchTerm: termo,
              instancia: 'SEGUNDO_GRAU',
            },
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JuitBot/1.0)' },
            timeout: 20000,
          });
          json = resp.data;
        } catch (err: any) {
          this.logger.warn(`TJPB: falha na requisicao (termo "${termo}", pagina ${pagina}): ${err.message}`);
          break;
        }

        const itens = parseResultadosTjpb(json);
        if (!itens.length) {
          this.logger.log(`TJPB: termo "${termo}", pagina ${pagina} sem resultados, encerrando termo`);
          break;
        }

        for (const item of itens) {
          if (!item.ementa) continue;
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
