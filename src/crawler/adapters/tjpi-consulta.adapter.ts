import { Logger } from '@nestjs/common';
import axios from 'axios';
import { CrawlerAdapter } from '../crawler.service';
import { parseResultadosTjpi } from '../parsers/tjpi-consulta.parser';

const API_URL = 'https://jurisprudencia.tjpi.jus.br/jurisprudences/search';

export interface TjpiTermo {
  termo: string;
  area?: string;
}

export interface TjpiConsultaConfig {
  termos: TjpiTermo[];
  maxPaginasPorTermo?: number;
}

export const TERMOS_PADRAO_TJPI: TjpiTermo[] = [
  { termo: 'benefício previdenciário', area: 'PREVIDENCIARIO' },
  { termo: 'relação de emprego', area: 'TRABALHISTA' },
  { termo: 'responsabilidade civil', area: 'CIVIL' },
  { termo: 'direito de família', area: 'FAMILIA' },
  { termo: 'habeas corpus', area: 'CRIMINAL' },
  { termo: 'execução fiscal', area: 'TRIBUTARIO' },
  { termo: 'ato administrativo', area: 'OUTRO' },
];

/**
 * Coleta acórdãos do TJPI via o JusPI (`jurisprudences/search`), que
 * responde HTML renderizado server-side. Sem CAPTCHA, sem exigência de
 * browser. Filtra `tipo=Acórdão` pra excluir Decisões Terminativas
 * monocráticas e Súmulas (só acórdãos colegiados têm o formato de
 * citação completo com relator/câmara, ver tjpi-consulta.parser.ts).
 */
export class TjpiConsultaAdapter implements CrawlerAdapter {
  tribunalSigla = 'TJPI';
  private readonly logger = new Logger(TjpiConsultaAdapter.name);

  constructor(private readonly config: TjpiConsultaConfig) {}

  async *coletar() {
    const termos = this.config.termos.length ? this.config.termos : TERMOS_PADRAO_TJPI;
    const maxPaginas = this.config.maxPaginasPorTermo ?? 3;

    for (const { termo, area } of termos) {
      let pagina = 1;

      while (pagina <= maxPaginas) {
        let html: string;
        try {
          const resp = await axios.get<string>(API_URL, {
            params: { q: termo, tipo: 'Acórdão', page: pagina },
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
              Referer: 'https://jurisprudencia.tjpi.jus.br/',
            },
            timeout: 20000,
          });
          html = resp.data;
        } catch (err: any) {
          this.logger.warn(`TJPI: falha na requisicao (termo "${termo}", pagina ${pagina}): ${err.message}`);
          break;
        }

        const itens = parseResultadosTjpi(html);
        if (!itens.length) {
          this.logger.log(`TJPI: termo "${termo}", pagina ${pagina} sem resultados, encerrando termo`);
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
