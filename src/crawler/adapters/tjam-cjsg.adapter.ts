import { Logger } from '@nestjs/common';
import { CrawlerAdapter } from '../crawler.service';
import { BrowserPoolService } from '../browser-pool.service';
// TJAM roda o mesmo e-SAJ do TJSP — mesma estrutura de HTML, mesmo
// parser (verificado ao vivo em 2026-07-19: campos, classes CSS e
// paginação idênticos).
import { parseResultadosCjsg } from '../parsers/tjsp-cjsg.parser';

const FORM_URL = 'https://consultasaj.tjam.jus.br/cjsg/consultaCompleta.do';

export interface TjamCjsgConfig {
  dataJulgamentoInicio: Date;
  dataJulgamentoFim: Date;
  maxPaginas?: number;
}

/**
 * Coleta decisões de 2º grau do TJAM via CJSG (mesmo e-SAJ do TJSP).
 * reCAPTCHA v3, mesma estratégia: browser real via BrowserPoolService.
 */
export class TjamCjsgAdapter implements CrawlerAdapter {
  tribunalSigla = 'TJAM';
  private readonly logger = new Logger(TjamCjsgAdapter.name);

  constructor(
    private readonly browserPool: BrowserPoolService,
    private readonly config: TjamCjsgConfig,
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
          this.logger.log(`CJSG: pagina ${pagina} sem resultados (html length=${html.length}, url=${page.url()}), encerrando`);
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
              ? `https://consultasaj.tjam.jus.br/cjsg/getArquivo.do?cdAcordao=${item.cdAcordao}&cdForo=0`
              : undefined,
          };
        }

        const proxima = page.locator('a[title="Próxima página"]');
        if ((await proxima.count()) === 0) break;

        await Promise.all([page.waitForLoadState('networkidle'), proxima.first().click()]);
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
