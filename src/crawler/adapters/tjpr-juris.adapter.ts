import { Logger } from '@nestjs/common';
import { CrawlerAdapter } from '../crawler.service';
import { BrowserPoolService } from '../browser-pool.service';
import { parseResultadosTjpr } from '../parsers/tjpr-juris.parser';

const FORM_URL = 'https://portal.tjpr.jus.br/jurisprudencia/publico/pesquisa.do?actionType=pesquisar';

export interface TjprTermo {
  termo: string;
  area?: string;
}

export interface TjprJurisConfig {
  termos: TjprTermo[];
  /** Trava de segurança por termo — cada página tem ~70 resultados. */
  maxPaginasPorTermo?: number;
}

export const TERMOS_PADRAO_TJPR: TjprTermo[] = [
  { termo: 'benefício previdenciário', area: 'PREVIDENCIARIO' },
  { termo: 'relação de emprego', area: 'TRABALHISTA' },
  { termo: 'responsabilidade civil', area: 'CIVIL' },
  { termo: 'direito de família', area: 'FAMILIA' },
  { termo: 'habeas corpus', area: 'CRIMINAL' },
  { termo: 'execução fiscal', area: 'TRIBUTARIO' },
  { termo: 'ato administrativo', area: 'OUTRO' },
];

/**
 * Coleta acórdãos do TJPR. Sem CAPTCHA de nenhum tipo (nem reCAPTCHA,
 * nem Turnstile, nem imagem) — o mais simples dos quatro tribunais
 * testados até agora. Busca por termo livre (não achamos filtro só por
 * data que funcionasse sem critério de texto). Paginação via campo
 * hidden `pageNumber` do form, reenviado por JS — reproduzimos isso
 * direto via `page.evaluate` em vez de clicar no link (mais robusto).
 */
export class TjprJurisAdapter implements CrawlerAdapter {
  tribunalSigla = 'TJPR';
  private readonly logger = new Logger(TjprJurisAdapter.name);

  constructor(
    private readonly browserPool: BrowserPoolService,
    private readonly config: TjprJurisConfig,
  ) {}

  async *coletar() {
    const termos = this.config.termos.length ? this.config.termos : TERMOS_PADRAO_TJPR;
    const maxPaginas = this.config.maxPaginasPorTermo ?? 2;

    for (const { termo, area } of termos) {
      const page = await this.browserPool.newPage();

      try {
        await page.goto(FORM_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(2000);
        await page.fill('#criterioPesquisa', termo);
        await page.waitForTimeout(500);

        await Promise.all([
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
          page.press('#criterioPesquisa', 'Enter'),
        ]);
        await page.waitForTimeout(4500);

        let pagina = 1;
        while (pagina <= maxPaginas) {
          const html = await page.content();
          const itens = parseResultadosTjpr(html);

          if (!itens.length) {
            this.logger.log(
              `TJPR: termo "${termo}", pagina ${pagina} sem resultados (html length=${html.length}, url=${page.url()}), encerrando termo`,
            );
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
              urlOrigem: item.urlOrigem,
            };
          }

          const proximaPagina = pagina + 1;
          const temProxima = await page.evaluate(() => !!document.querySelector('a.arrowNextOn'));
          if (!temProxima) break;

          await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
            page.evaluate((p) => {
              const form = document.forms['pesquisaForm' as any] as any;
              form['pageNumber'].value = String(p);
              form['sortColumn'].value = 'processo_sDataJulgamento';
              form['sortOrder'].value = 'DESC';
              form.submit();
            }, proximaPagina),
          ]);
          await page.waitForTimeout(2000);
          pagina++;
        }
      } finally {
        await page.close();
      }
    }
  }
}
