import { Logger } from '@nestjs/common';
import { CrawlerAdapter } from '../crawler.service';
import { BrowserPoolService, aguardarDesafioCloudflare } from '../browser-pool.service';
import { parseResultadosScon } from '../parsers/stj-scon.parser';

const SCON_URL = 'https://scon.stj.jus.br/SCON/';

export interface StjSconTermo {
  termo: string;
  /** Área do direito associada a este termo — o SCON não classifica por
   *  área, então inferimos a partir do termo de busca usado. */
  area?: string;
}

export interface StjSconConfig {
  termos: StjSconTermo[];
  /** Trava de segurança de páginas por termo (10 documentos/página). */
  maxPaginasPorTermo?: number;
}

/** Termos amplos por área — usados como default quando nenhum é passado.
 *  O SCON exige algum critério de busca (não aceita filtro só por data,
 *  confirmado ao vivo: "Critério de pesquisa não informado!"), então a
 *  cobertura depende de termos amplos o bastante para pegar a maioria
 *  dos acórdãos de cada área. */
export const TERMOS_PADRAO_STJ: StjSconTermo[] = [
  { termo: 'benefício previdenciário', area: 'PREVIDENCIARIO' },
  { termo: 'relação de emprego', area: 'TRABALHISTA' },
  { termo: 'responsabilidade civil', area: 'CIVIL' },
  { termo: 'direito de família', area: 'FAMILIA' },
  { termo: 'habeas corpus', area: 'CRIMINAL' },
  { termo: 'execução fiscal', area: 'TRIBUTARIO' },
  { termo: 'ato administrativo', area: 'OUTRO' },
];

/**
 * Coleta acórdãos do STJ via SCON, um termo de busca amplo por vez.
 *
 * O SCON exige reCAPTCHA/Cloudflare Turnstile (mais agressivo que o
 * reCAPTCHA v3 do TJSP) — usa o mesmo BrowserPoolService via CDP.
 */
export class StjSconAdapter implements CrawlerAdapter {
  tribunalSigla = 'STJ';
  private readonly logger = new Logger(StjSconAdapter.name);

  constructor(
    private readonly browserPool: BrowserPoolService,
    private readonly config: StjSconConfig,
  ) {}

  async *coletar() {
    const termos = this.config.termos.length ? this.config.termos : TERMOS_PADRAO_STJ;
    const maxPaginas = this.config.maxPaginasPorTermo ?? 5;

    for (const { termo, area } of termos) {
      const page = await this.browserPool.newPage();

      try {
        await page.goto(SCON_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

        const passou = await aguardarDesafioCloudflare(page);
        if (!passou) {
          const html = await page.content().catch(() => '');
          this.logger.warn(
            `SCON: desafio Cloudflare nao liberou para o termo "${termo}" (html length=${html.length}), pulando`,
          );
          continue;
        }

        await page.fill('#pesquisaLivre', termo);
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
          page.press('#pesquisaLivre', 'Enter'),
        ]);

        let pagina = 1;
        while (pagina <= maxPaginas) {
          const html = await page.content();
          const itens = parseResultadosScon(html);

          if (!itens.length) {
            this.logger.log(`SCON: termo "${termo}", pagina ${pagina} sem resultados, encerrando termo`);
            break;
          }

          for (const item of itens) {
            yield {
              numeroProcesso: item.numeroProcesso,
              orgaoJulgador: item.orgaoJulgador,
              relator: item.relator,
              dataJulgamento: item.dataJulgamento,
              area,
              tese: item.tese,
              ementa: item.ementa,
            };
          }

          const proxima = page.locator('a.iconeProximaPagina');
          if ((await proxima.count()) === 0) break;

          await Promise.all([page.waitForLoadState('domcontentloaded'), proxima.first().click()]);
          await page.waitForTimeout(1500);
          pagina++;
        }
      } finally {
        await page.close();
      }
    }
  }
}
