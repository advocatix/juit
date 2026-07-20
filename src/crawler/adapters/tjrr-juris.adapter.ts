import { Logger } from '@nestjs/common';
import { CrawlerAdapter } from '../crawler.service';
import { BrowserPoolService } from '../browser-pool.service';
import { parseResultadosTjrr } from '../parsers/tjrr-juris.parser';

const HOME_URL = 'https://jurisprudencia.tjrr.jus.br/juris/';
const CAMPO_BUSCA = 'input[placeholder="Digite o termo que deseja procurar"]';

export interface TjrrTermo {
  termo: string;
  area?: string;
}

export interface TjrrJurisConfig {
  termos: TjrrTermo[];
  maxPaginasPorTermo?: number;
}

export const TERMOS_PADRAO_TJRR: TjrrTermo[] = [
  { termo: 'benefício previdenciário', area: 'PREVIDENCIARIO' },
  { termo: 'relação de emprego', area: 'TRABALHISTA' },
  { termo: 'responsabilidade civil', area: 'CIVIL' },
  { termo: 'direito de família', area: 'FAMILIA' },
  { termo: 'habeas corpus', area: 'CRIMINAL' },
  { termo: 'execução fiscal', area: 'TRIBUTARIO' },
  { termo: 'ato administrativo', area: 'OUTRO' },
];

/**
 * Coleta acórdãos do TJRR via o "Juris" (JSF/PrimeFaces), sem CAPTCHA.
 * Diferente do TJPE (mesma categoria JSF, mas descartado por
 * inconsistência), aqui a busca funciona de forma confiável com
 * browser real — usamos BrowserPoolService em vez de tentar replicar
 * o ViewState via HTTP puro (mais frágil nesse tipo de app stateful).
 * A tabela de resultados tem 2 abas pré-renderizadas no mesmo DOM
 * (Acórdãos / Decisão Monocrática) — o parser já escopa só a aba
 * ativa (Acórdãos).
 */
export class TjrrJurisAdapter implements CrawlerAdapter {
  tribunalSigla = 'TJRR';
  private readonly logger = new Logger(TjrrJurisAdapter.name);

  constructor(
    private readonly browserPool: BrowserPoolService,
    private readonly config: TjrrJurisConfig,
  ) {}

  async *coletar() {
    const termos = this.config.termos.length ? this.config.termos : TERMOS_PADRAO_TJRR;
    const maxPaginas = this.config.maxPaginasPorTermo ?? 3;

    for (const { termo, area } of termos) {
      const page = await this.browserPool.newPage();

      try {
        await page.goto(HOME_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(2000);
        await page.click('text=PESQUISA');
        await page.waitForTimeout(3000);

        await page.fill(CAMPO_BUSCA, termo);
        await Promise.all([
          page.waitForLoadState('networkidle'),
          page.press(CAMPO_BUSCA, 'Enter'),
        ]);
        await page.waitForTimeout(2000);

        let pagina = 1;
        while (pagina <= maxPaginas) {
          const html = await page.content();
          const itens = parseResultadosTjrr(html);

          if (!itens.length) {
            this.logger.log(`TJRR: termo "${termo}", pagina ${pagina} sem resultados, encerrando termo`);
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

          const proxima = page.locator('.ui-tabs-panel:not(.ui-helper-hidden) .ui-paginator-next:not(.ui-state-disabled)');
          if ((await proxima.count()) === 0) break;

          // clique via JS direto - page.click() ficou instavel em
          // paginas de resultado pesadas (mesmo problema real
          // encontrado no TJMG e no TJSP: a checagem de "estavel" do
          // Playwright nunca fecha)
          await proxima.first().evaluate((el: HTMLElement) => el.click());
          await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
          await page.waitForTimeout(1500);
          pagina++;
        }
      } finally {
        await page.close();
      }
    }
  }
}
