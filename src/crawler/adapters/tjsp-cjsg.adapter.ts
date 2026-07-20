import { Logger } from '@nestjs/common';
import { CrawlerAdapter } from '../crawler.service';
import { BrowserPoolService } from '../browser-pool.service';
import { parseResultadosCjsg } from '../parsers/tjsp-cjsg.parser';

const FORM_URL = 'https://esaj.tjsp.jus.br/cjsg/consultaCompleta.do';

export interface TjspCjsgConfig {
  dataJulgamentoInicio: Date;
  dataJulgamentoFim: Date;
  /** Trava de segurança para não paginar indefinidamente num escopo amplo. */
  maxPaginas?: number;
}

/**
 * Coleta decisões de 2º grau do TJSP via CJSG, filtrando por período de
 * julgamento (crawl incremental: "o que foi julgado entre X e Y").
 *
 * O CJSG exige reCAPTCHA v3 — por isso usamos um browser real via
 * BrowserPoolService em vez de HTTP puro (ver browser-pool.service.ts).
 */
export class TjspCjsgAdapter implements CrawlerAdapter {
  tribunalSigla = 'TJSP';
  private readonly logger = new Logger(TjspCjsgAdapter.name);

  constructor(
    private readonly browserPool: BrowserPoolService,
    private readonly config: TjspCjsgConfig,
  ) {}

  async *coletar() {
    const page = await this.browserPool.newPage();

    try {
      await page.goto(FORM_URL, { waitUntil: 'networkidle', timeout: 60000 });

      await page.fill('input[name="dados.dtJulgamentoInicio"]', formatarDataBr(this.config.dataJulgamentoInicio));
      await page.fill('input[name="dados.dtJulgamentoFim"]', formatarDataBr(this.config.dataJulgamentoFim));

      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle', timeout: 60000 }),
        page.click('#pbSubmit'),
      ]);

      const maxPaginas = this.config.maxPaginas ?? 50;
      let pagina = 1;

      while (pagina <= maxPaginas) {
        const html = await page.content();
        const itens = parseResultadosCjsg(html);

        if (!itens.length) {
          this.logger.log(`CJSG: pagina ${pagina} sem resultados, encerrando`);
          break;
        }

        for (const item of itens) {
          yield {
            numeroProcesso: item.numeroProcesso,
            orgaoJulgador: item.orgaoJulgador,
            relator: item.relator,
            dataJulgamento: item.dataJulgamento,
            ementa: item.ementa,
            urlOrigem: item.cdAcordao
              ? `https://esaj.tjsp.jus.br/cjsg/getArquivo.do?cdAcordao=${item.cdAcordao}&cdForo=0`
              : undefined,
          };
        }

        const proxima = page.locator('a[title="Próxima página"]');
        if ((await proxima.count()) === 0) break;

        // page.click() ficou instavel em paginas de resultado pesadas
        // (mesmo problema real encontrado no TJMG: a checagem de
        // "estavel" do Playwright nunca fecha) - clique via JS direto
        // e mais confiavel, com espera explicita depois.
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

function formatarDataBr(data: Date): string {
  const dd = String(data.getDate()).padStart(2, '0');
  const mm = String(data.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${data.getFullYear()}`;
}
