import { Logger } from '@nestjs/common';
import { CrawlerAdapter } from '../crawler.service';
import { BrowserPoolService } from '../browser-pool.service';
import { parseResultadosTjrj } from '../parsers/tjrj-ejuris.parser';

const FORM_URL = 'https://www3.tjrj.jus.br/ejuris/ConsultarJurisprudencia.aspx';

export interface TjrjEjurisConfig {
  termo: string;
  /** Trava de segurança — cada página tem ~10 resultados. */
  maxPaginas?: number;
}

/**
 * Coleta acórdãos do TJRJ via e-JURIS. Tem reCAPTCHA v3 embutido no
 * formulário (mesma família do TJSP), mas na prática não bloqueou nem
 * com Chrome local — mais simples que TJSP e STJ. Diferente dos dois,
 * a busca é por termo livre (não achamos filtro só por data ainda), e
 * a paginação é via um <select id="seletorPaginasTopo"> com uma opção
 * por página (confirmado ao vivo: trocar a opção troca os resultados).
 */
export class TjrjEjurisAdapter implements CrawlerAdapter {
  tribunalSigla = 'TJRJ';
  private readonly logger = new Logger(TjrjEjurisAdapter.name);

  constructor(
    private readonly browserPool: BrowserPoolService,
    private readonly config: TjrjEjurisConfig,
  ) {}

  async *coletar() {
    const page = await this.browserPool.newPage();

    try {
      await page.goto(FORM_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.fill('#ContentPlaceHolder1_txtTextoPesq', this.config.termo);

      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
        page.click('#ContentPlaceHolder1_btnPesquisar'),
      ]);
      await page.waitForTimeout(4000);

      const maxPaginas = this.config.maxPaginas ?? 20;
      let pagina = 1;

      while (pagina <= maxPaginas) {
        const html = await page.content();
        const itens = parseResultadosTjrj(html);

        if (!itens.length) {
          this.logger.log(
            `e-JURIS: pagina ${pagina} sem resultados (html length=${html.length}, url=${page.url()}), encerrando`,
          );
          break;
        }

        for (const item of itens) {
          yield {
            numeroProcesso: item.numeroProcesso,
            orgaoJulgador: item.orgaoJulgador,
            relator: item.relator,
            dataJulgamento: item.dataJulgamento,
            ementa: item.ementa,
            urlOrigem: item.urlOrigem,
          };
        }

        const seletor = page.locator('#seletorPaginasTopo');
        const totalOpcoes = await seletor.locator('option').count();
        if (pagina >= totalOpcoes) break;

        await seletor.selectOption(String(pagina + 1));
        await page.waitForTimeout(2500);
        pagina++;
      }
    } finally {
      await page.close();
    }
  }
}
