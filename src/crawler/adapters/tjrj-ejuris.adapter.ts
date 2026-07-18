import { Logger } from '@nestjs/common';
import { CrawlerAdapter } from '../crawler.service';
import { BrowserPoolService } from '../browser-pool.service';
import { parseResultadosTjrj } from '../parsers/tjrj-ejuris.parser';

const FORM_URL = 'https://www3.tjrj.jus.br/ejuris/ConsultarJurisprudencia.aspx';

export interface TjrjTermo {
  termo: string;
  /** e-JURIS não classifica por área — inferimos a partir do termo. */
  area?: string;
}

export interface TjrjEjurisConfig {
  termos: TjrjTermo[];
  /** Trava de segurança por termo — cada página tem ~10 resultados. */
  maxPaginasPorTermo?: number;
}

/** Mesma lista de áreas usada no STJ (TERMOS_PADRAO_STJ) — termos amplos
 *  o bastante pra cobrir a maior parte dos acórdãos de cada área, já que
 *  o e-JURIS não tem filtro só por data. */
export const TERMOS_PADRAO_TJRJ: TjrjTermo[] = [
  { termo: 'benefício previdenciário', area: 'PREVIDENCIARIO' },
  { termo: 'relação de emprego', area: 'TRABALHISTA' },
  { termo: 'responsabilidade civil', area: 'CIVIL' },
  { termo: 'direito de família', area: 'FAMILIA' },
  { termo: 'habeas corpus', area: 'CRIMINAL' },
  { termo: 'execução fiscal', area: 'TRIBUTARIO' },
  { termo: 'ato administrativo', area: 'OUTRO' },
];

/**
 * Coleta acórdãos do TJRJ via e-JURIS. Tem reCAPTCHA v3 embutido no
 * formulário (mesma família do TJSP), mas na prática não bloqueou nem
 * com Chrome local — mais simples que TJSP e STJ. Diferente do TJSP, a
 * busca é por termo livre (não achamos filtro só por data ainda), e a
 * paginação é via um <select id="seletorPaginasTopo"> com uma opção por
 * página (confirmado ao vivo: trocar a opção troca os resultados).
 */
export class TjrjEjurisAdapter implements CrawlerAdapter {
  tribunalSigla = 'TJRJ';
  private readonly logger = new Logger(TjrjEjurisAdapter.name);

  constructor(
    private readonly browserPool: BrowserPoolService,
    private readonly config: TjrjEjurisConfig,
  ) {}

  async *coletar() {
    const termos = this.config.termos.length ? this.config.termos : TERMOS_PADRAO_TJRJ;
    const maxPaginas = this.config.maxPaginasPorTermo ?? 5;

    for (const { termo, area } of termos) {
      const page = await this.browserPool.newPage();

      try {
        await page.goto(FORM_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.fill('#ContentPlaceHolder1_txtTextoPesq', termo);

        await Promise.all([
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
          page.click('#ContentPlaceHolder1_btnPesquisar'),
        ]);
        await page.waitForTimeout(4000);

        let pagina = 1;
        while (pagina <= maxPaginas) {
          const html = await page.content();
          const itens = parseResultadosTjrj(html);

          if (!itens.length) {
            this.logger.log(`e-JURIS: termo "${termo}", pagina ${pagina} sem resultados, encerrando termo`);
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
}
