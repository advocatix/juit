import { Logger } from '@nestjs/common';
import axios from 'axios';
import { CrawlerAdapter } from '../crawler.service';
import { parseResultadosTjsc } from '../parsers/tjsc-busca.parser';

const AJAX_URL = 'https://busca.tjsc.jus.br/jurisprudencia/buscaajax.do';

export interface TjscTermo {
  termo: string;
  area?: string;
}

export interface TjscBuscaConfig {
  termos: TjscTermo[];
  maxPaginasPorTermo?: number;
}

export const TERMOS_PADRAO_TJSC: TjscTermo[] = [
  { termo: 'benefício previdenciário', area: 'PREVIDENCIARIO' },
  { termo: 'relação de emprego', area: 'TRABALHISTA' },
  { termo: 'responsabilidade civil', area: 'CIVIL' },
  { termo: 'direito de família', area: 'FAMILIA' },
  { termo: 'habeas corpus', area: 'CRIMINAL' },
  { termo: 'execução fiscal', area: 'TRIBUTARIO' },
  { termo: 'ato administrativo', area: 'OUTRO' },
];

/**
 * Coleta acórdãos do TJSC via `buscaajax.do`. Único tribunal até agora
 * sem CAPTCHA nem exigência de sessão de browser — confirmado ao vivo
 * que uma requisição HTTP pura (axios) já retorna resultados reais, sem
 * precisar de BrowserPoolService/Browserbase. Muito mais barato que
 * TJSP/STJ/TJRJ.
 */
export class TjscBuscaAdapter implements CrawlerAdapter {
  tribunalSigla = 'TJSC';
  private readonly logger = new Logger(TjscBuscaAdapter.name);

  constructor(private readonly config: TjscBuscaConfig) {}

  async *coletar() {
    const termos = this.config.termos.length ? this.config.termos : TERMOS_PADRAO_TJSC;
    const maxPaginas = this.config.maxPaginasPorTermo ?? 5;

    for (const { termo, area } of termos) {
      let pagina = 1;

      while (pagina <= maxPaginas) {
        let html: string;
        try {
          const resp = await axios.get<ArrayBuffer>(AJAX_URL, {
            params: {
              q: termo,
              sort: 'dtJulgamento desc',
              ps: 20,
              busca: 'avancada',
              pg: pagina,
              categoria: 'acordaos',
              radio_campo: 'ementa',
            },
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JuitBot/1.0)' },
            responseType: 'arraybuffer',
            timeout: 20000,
          });
          // O endpoint responde em ISO-8859-1 apesar do content-type não
          // declarar charset — decodificar como UTF-8 (default do axios)
          // corrompe acentos em caracteres de substituição (confirmado
          // ao vivo: "APELA​ÇÃO" virava "APELA​��O").
          html = Buffer.from(resp.data).toString('latin1');
        } catch (err: any) {
          this.logger.warn(`TJSC: falha na requisicao (termo "${termo}", pagina ${pagina}): ${err.message}`);
          break;
        }

        // Sem CAPTCHA, mas o portal tem um WAF que bloqueia por IP quando
        // detecta padrão de bot (confirmado ao vivo: título "Bloqueio
        // temporário do portal institucional"). Sem sessão de browser pra
        // "provar" que passamos por verificação nenhuma, a única defesa é
        // não martelar o endpoint — daí o intervalo entre páginas abaixo.
        if (html.includes('Bloqueio temporário do portal institucional')) {
          this.logger.error(`TJSC: bloqueado pelo WAF (termo "${termo}", pagina ${pagina}), abortando termo`);
          break;
        }

        const itens = parseResultadosTjsc(html);
        if (!itens.length) {
          this.logger.log(`TJSC: termo "${termo}", pagina ${pagina} sem resultados, encerrando termo`);
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
        await esperar(1500);
      }

      await esperar(1500);
    }
  }
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
