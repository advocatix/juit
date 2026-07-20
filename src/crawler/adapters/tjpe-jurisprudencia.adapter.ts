import { Logger } from '@nestjs/common';
import { CrawlerAdapter } from '../crawler.service';
import { BrowserPoolService } from '../browser-pool.service';
import { parseResultadosTjpe } from '../parsers/tjpe-jurisprudencia.parser';

const FORM_URL = 'https://www.tjpe.jus.br/consultajurisprudenciaweb/xhtml/consulta/consulta.xhtml';
const CAMPO_BUSCA = '#formPesquisaJurisprudencia\\:inputBuscaSimples';

export interface TjpeTermo {
  termo: string;
  area?: string;
}

export interface TjpeJurisprudenciaConfig {
  termos: TjpeTermo[];
  maxPaginas?: number;
}

export const TERMOS_PADRAO_TJPE: TjpeTermo[] = [
  { termo: 'responsabilidade civil', area: 'CIVIL' },
  { termo: 'relação de emprego', area: 'TRABALHISTA' },
  { termo: 'direito de família', area: 'FAMILIA' },
  { termo: 'benefício previdenciário', area: 'PREVIDENCIARIO' },
  { termo: 'habeas corpus', area: 'CRIMINAL' },
  { termo: 'execução fiscal', area: 'TRIBUTARIO' },
  { termo: 'ato administrativo', area: 'OUTRO' },
];

/**
 * Coleta acórdãos do TJPE via "Consulta Jurisprudência Web"
 * (JSF/RichFaces antigo, stateful). Sem CAPTCHA — o problema anterior
 * ("Nenhum documento encontrado" mesmo pra termos comuns) era um bug
 * de automação, não do site: o clique em "Pesquisar" precisa mirar o
 * link `<a>` de verdade dentro de `formPesquisaJurisprudencia`
 * (confirmado ao vivo: 953 acórdãos + 47 decisões monocráticas pra
 * "dano moral"). Depois da busca, o site mostra uma tela intermediária
 * "Escolha do Resultado" (Acórdãos vs Decisões Monocráticas, cada um
 * com contagem) — precisa clicar no link "N documentos encontrados"
 * de Acórdãos pra chegar na lista de verdade. Ementa e "Acórdão"
 * (inteiro teor) vêm muito ricos — usamos só a ementa por ora.
 */
export class TjpeJurisprudenciaAdapter implements CrawlerAdapter {
  tribunalSigla = 'TJPE';
  private readonly logger = new Logger(TjpeJurisprudenciaAdapter.name);

  constructor(
    private readonly browserPool: BrowserPoolService,
    private readonly config: TjpeJurisprudenciaConfig,
  ) {}

  async *coletar() {
    const termos = this.config.termos.length ? this.config.termos : TERMOS_PADRAO_TJPE;
    const maxPaginas = this.config.maxPaginas ?? 10;

    for (const { termo, area } of termos) {
      const page = await this.browserPool.newPage();

      try {
        await page.goto(FORM_URL, { waitUntil: 'load', timeout: 30000 });
        await page.waitForTimeout(1000);
        await page.fill(CAMPO_BUSCA, termo);

        await Promise.all([
          page.waitForResponse((r) => r.request().method() === 'POST', { timeout: 20000 }).catch(() => null),
          page.locator('text=Pesquisar').first().click(),
        ]);
        await page.waitForTimeout(1500);

        const linkAcordaos = page.locator('a:has-text("documentos encontrados")').first();
        if ((await linkAcordaos.count()) === 0) {
          this.logger.log(`TJPE: termo "${termo}" sem resultados, encerrando termo`);
          continue;
        }

        await Promise.all([
          page.waitForResponse((r) => r.request().method() === 'POST', { timeout: 20000 }).catch(() => null),
          linkAcordaos.click(),
        ]);
        await page.waitForTimeout(1500);

        let pagina = 1;
        while (pagina <= maxPaginas) {
          const html = await page.content();
          const itens = parseResultadosTjpe(html);

          if (!itens.length) {
            this.logger.log(`TJPE: termo "${termo}", pagina ${pagina} sem resultados, encerrando termo`);
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

          const proxima = page.locator('.rich-datascr-button:has-text("Próxima")').first();
          if ((await proxima.count()) === 0) break;

          await Promise.all([
            page.waitForResponse((r) => r.request().method() === 'POST', { timeout: 20000 }).catch(() => null),
            proxima.click(),
          ]);
          await page.waitForTimeout(1500);
          pagina++;
        }
      } finally {
        await page.close();
      }
    }
  }
}
