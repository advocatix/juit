import { Logger } from '@nestjs/common';
import axios from 'axios';
import { CrawlerAdapter } from '../crawler.service';
import { parseResultadosTjto } from '../parsers/tjto-consulta.parser';

const API_URL = 'https://jurisprudencia.tjto.jus.br/consulta.php';
const TAMANHO_PAGINA = 20;

export interface TjtoTermo {
  termo: string;
  area?: string;
}

export interface TjtoConsultaConfig {
  termos: TjtoTermo[];
  maxPaginasPorTermo?: number;
}

export const TERMOS_PADRAO_TJTO: TjtoTermo[] = [
  { termo: 'benefício previdenciário', area: 'PREVIDENCIARIO' },
  { termo: 'relação de emprego', area: 'TRABALHISTA' },
  { termo: 'responsabilidade civil', area: 'CIVIL' },
  { termo: 'direito de família', area: 'FAMILIA' },
  { termo: 'habeas corpus', area: 'CRIMINAL' },
  { termo: 'execução fiscal', area: 'TRIBUTARIO' },
  { termo: 'ato administrativo', area: 'OUTRO' },
];

/**
 * Coleta acórdãos do TJTO via o portal "Jurisprudência 4.0"
 * (`consulta.php`), que responde HTML renderizado server-side. Sem
 * CAPTCHA, sem exigência de browser — o 403 inicial era só falta de
 * User-Agent (bloqueio genérico de requisições sem navegador, não
 * anti-bot de verdade). Paginação e filtros só funcionam via POST
 * (o form da página usa `method="POST"`; os mesmos parâmetros via GET
 * são ignorados e sempre devolvem a primeira página). Filtra
 * `tipo_decisao_acordao=1` pra restringir a acórdãos de 2º grau.
 */
export class TjtoConsultaAdapter implements CrawlerAdapter {
  tribunalSigla = 'TJTO';
  private readonly logger = new Logger(TjtoConsultaAdapter.name);

  constructor(private readonly config: TjtoConsultaConfig) {}

  async *coletar() {
    const termos = this.config.termos.length ? this.config.termos : TERMOS_PADRAO_TJTO;
    const maxPaginas = this.config.maxPaginasPorTermo ?? 3;

    for (const { termo, area } of termos) {
      let pagina = 0;

      while (pagina < maxPaginas) {
        let html: string;
        try {
          const resp = await axios.post<string>(
            API_URL,
            new URLSearchParams({
              q: termo,
              start: String(pagina * TAMANHO_PAGINA),
              rows: String(TAMANHO_PAGINA),
              tipo_decisao_acordao: '1',
            }).toString(),
            {
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent':
                  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                Referer: 'https://jurisprudencia.tjto.jus.br/',
              },
              timeout: 20000,
            },
          );
          html = resp.data;
        } catch (err: any) {
          this.logger.warn(`TJTO: falha na requisicao (termo "${termo}", pagina ${pagina}): ${err.message}`);
          break;
        }

        const itens = parseResultadosTjto(html);
        if (!itens.length) {
          this.logger.log(`TJTO: termo "${termo}", pagina ${pagina} sem resultados, encerrando termo`);
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
