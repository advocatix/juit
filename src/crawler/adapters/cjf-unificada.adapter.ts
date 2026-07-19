import { Logger } from '@nestjs/common';
import { Page } from 'playwright-core';
import { BrowserPoolService } from '../browser-pool.service';
import { parseResultadosCjf } from '../parsers/cjf-unificada.parser';

const HOME_URL = 'https://jurisprudencia.cjf.jus.br/unificada/index.xhtml';
const TEXTO_LIVRE = '#formulario\\:textoLivre';
// Índices dos checkboxes de tribunal (grupo `formulario:j_idt70`), na
// ordem em que aparecem no formulário: STF, STJ, TNU, TRF1..TRF5.
// TNU (índice 2) já vem marcado por padrão — só precisamos marcar os
// outros 7. Turmas Recursais/Regionais de Uniformização (checkboxes
// separados `trMarcado`/`truMarcado`) ficam de fora por enquanto
// (baixo valor, identidade de tribunal confusa).
const INDICES_PARA_MARCAR = [0, 1, 3, 4, 5, 6, 7];

export interface CjfTermo {
  termo: string;
  area?: string;
}

export interface CjfUnificadaConfig {
  termos: CjfTermo[];
  maxPaginasPorTermo?: number;
}

export const TERMOS_PADRAO_CJF: CjfTermo[] = [
  { termo: 'benefício previdenciário', area: 'PREVIDENCIARIO' },
  { termo: 'relação de emprego', area: 'TRABALHISTA' },
  { termo: 'responsabilidade civil', area: 'CIVIL' },
  { termo: 'direito de família', area: 'FAMILIA' },
  { termo: 'habeas corpus', area: 'CRIMINAL' },
  { termo: 'execução fiscal', area: 'TRIBUTARIO' },
  { termo: 'ato administrativo', area: 'OUTRO' },
];

export interface CjfItemColetado {
  numeroProcesso?: string;
  tribunalSigla?: string;
  orgaoJulgador?: string;
  relator?: string;
  dataJulgamento?: Date;
  area?: string;
  ementa?: string;
}

/**
 * Coleta acórdãos da Jurisprudência Unificada do CJF — repositório que
 * cruza STF + STJ + TNU + TRF1..TRF5 numa API só (JSF/PrimeFaces). Sem
 * CAPTCHA. Achado importante: o STJ aqui responde normalmente (24 mil+
 * resultados pra um termo de teste), diferente do SCON
 * (`scon.stj.jus.br`) direto, que está bloqueado por Cloudflare
 * Turnstile — este portal do CJF contorna esse bloqueio.
 *
 * Os checkboxes de tribunal são um widget PrimeFaces cujo `<input>`
 * fica num `div.ui-helper-hidden-accessible` — clicar direto no input
 * (mesmo com `force`) não atualiza o estado do widget; precisa clicar
 * na `div.ui-chkbox-box` irmã (ver função `marcarCheckbox`).
 *
 * Igual ao FALCÃO, cada documento retornado já vem com o tribunal de
 * origem (campo "Origem" no HTML, parseado pro `tribunalSigla` real
 * pelo cjf-unificada.parser.ts) — quem grava no banco resolve/upserta
 * o Tribunal por item, sem passar pelo `CrawlerService.executarCrawl()`
 * genérico (ver rota /cjf/executar no controller, mesmo padrão do
 * falcao-runner.ts).
 */
export class CjfUnificadaAdapter {
  private readonly logger = new Logger(CjfUnificadaAdapter.name);

  constructor(
    private readonly browserPool: BrowserPoolService,
    private readonly config: CjfUnificadaConfig,
  ) {}

  async *coletar(): AsyncGenerator<CjfItemColetado> {
    const termos = this.config.termos.length ? this.config.termos : TERMOS_PADRAO_CJF;
    const maxPaginas = this.config.maxPaginasPorTermo ?? 3;

    for (const { termo, area } of termos) {
      const page = await this.browserPool.newPage();

      try {
        await page.goto(HOME_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(2000);
        await page.fill(TEXTO_LIVRE, termo);

        for (const indice of INDICES_PARA_MARCAR) {
          await marcarCheckbox(page, `formulario\\:j_idt70\\:${indice}`);
        }
        await page.waitForTimeout(500);

        await Promise.all([page.waitForLoadState('networkidle'), page.click('text=Pesquisar')]);
        await page.waitForTimeout(1500);

        let pagina = 1;
        while (pagina <= maxPaginas) {
          const html = await page.content();
          const itens = parseResultadosCjf(html);

          if (!itens.length) {
            this.logger.log(`CJF: termo "${termo}", pagina ${pagina} sem resultados, encerrando termo`);
            break;
          }

          for (const item of itens) {
            if (!item.ementa || !item.tribunalSigla) continue;
            yield {
              numeroProcesso: item.numeroProcesso,
              tribunalSigla: item.tribunalSigla,
              orgaoJulgador: item.orgaoJulgador,
              relator: item.relator,
              dataJulgamento: item.dataJulgamento,
              area,
              ementa: item.ementa,
            };
          }

          const proxima = page.locator('.ui-paginator-next:not(.ui-state-disabled)').first();
          if ((await proxima.count()) === 0) break;

          await Promise.all([page.waitForLoadState('networkidle'), proxima.click()]);
          await page.waitForTimeout(1500);
          pagina++;
        }
      } finally {
        await page.close();
      }
    }
  }
}

async function marcarCheckbox(page: Page, inputId: string): Promise<void> {
  const box = page.locator(`#${inputId}`).locator('xpath=../following-sibling::div[contains(@class,"ui-chkbox-box")]');
  await box.click();
}
