import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Page } from 'playwright-core';
import { CrawlerAdapter } from '../crawler.service';
import { BrowserPoolService } from '../browser-pool.service';
import { parseResultadosTjmg } from '../parsers/tjmg-espelho.parser';

const FORM_URL = 'https://www5.tjmg.jus.br/jurisprudencia/formEspelhoAcordao.do';

export interface TjmgTermo {
  termo: string;
  area?: string;
}

export interface TjmgEspelhoConfig {
  termos: TjmgTermo[];
  dataJulgamentoInicio: Date;
  dataJulgamentoFim: Date;
  maxPaginas?: number;
}

export const TERMOS_PADRAO_TJMG: TjmgTermo[] = [
  { termo: 'responsabilidade civil', area: 'CIVIL' },
  { termo: 'relação de emprego', area: 'TRABALHISTA' },
  { termo: 'direito de família', area: 'FAMILIA' },
  { termo: 'benefício previdenciário', area: 'PREVIDENCIARIO' },
  { termo: 'habeas corpus', area: 'CRIMINAL' },
  { termo: 'execução fiscal', area: 'TRIBUTARIO' },
  { termo: 'ato administrativo', area: 'OUTRO' },
];

/**
 * Coleta acórdãos do TJMG via o "Espelho de Acórdão"
 * (`formEspelhoAcordao.do`). Diferente dos outros tribunais estaduais,
 * exige resolver um CAPTCHA de imagem clássico (5 dígitos,
 * `captcha.svl`) logo depois de submeter a busca — resolvido via
 * CapSolver (`ImageToTextTask`, ~US$0,40/1000, validado ao vivo com
 * 99%+ de confiança em captchas legíveis). O captcha erra às vezes em
 * imagens mais distorcidas; o próprio TJMG gera um novo automaticamente
 * em caso de erro, então resolvemos com retry.
 *
 * Buscar só por período (sem termo) não é aceito — "pelo menos um dos
 * campos é obrigatório" — e um termo amplo sem filtro de data estoura
 * o limite de exibição ("Sua pesquisa encontrou muitos resultados").
 * Por isso a busca é sempre termo + período (1 dia, no uso via cron).
 */
export class TjmgEspelhoAdapter implements CrawlerAdapter {
  tribunalSigla = 'TJMG';
  private readonly logger = new Logger(TjmgEspelhoAdapter.name);

  constructor(
    private readonly browserPool: BrowserPoolService,
    private readonly configService: ConfigService,
    private readonly crawlConfig: TjmgEspelhoConfig,
  ) {}

  async *coletar() {
    const termos = this.crawlConfig.termos.length ? this.crawlConfig.termos : TERMOS_PADRAO_TJMG;
    const maxPaginas = this.crawlConfig.maxPaginas ?? 20;

    for (const { termo, area } of termos) {
      const page = await this.browserPool.newPage();

      try {
        await page.goto(FORM_URL, { waitUntil: 'networkidle', timeout: 30000 });
        await page.fill('#palavras', termo);
        await page.fill('#dataJulgamentoInicial', formatarDataBr(this.crawlConfig.dataJulgamentoInicio));
        await page.fill('#dataJulgamentoFinal', formatarDataBr(this.crawlConfig.dataJulgamentoFim));
        await page.click('#pesquisaLivre');
        await page.waitForLoadState('networkidle');

        const resolvido = await this.resolverCaptchaSeNecessario(page);
        if (!resolvido) {
          this.logger.warn(`TJMG: não passou do captcha para o termo "${termo}", pulando`);
          continue;
        }

        // Quando o captcha resolve, a página navega para os resultados —
        // sem esperar essa navegação terminar, page.content() pode pegar
        // um DOM intermediário (nem form antigo, nem resultado novo),
        // fazendo o parser achar 0 itens mesmo com resultado de verdade.
        await page.waitForLoadState('networkidle').catch(() => {});
        await page.waitForTimeout(1000);

        let pagina = 1;
        while (pagina <= maxPaginas) {
          const html = await page.content();

          if (html.includes('não pode ser exibida')) {
            this.logger.warn(`TJMG: termo "${termo}" com resultados demais pro período, pulando restante`);
            break;
          }

          const itens = parseResultadosTjmg(html);
          if (!itens.length) {
            this.logger.log(`TJMG: termo "${termo}", pagina ${pagina} sem resultados, encerrando termo`);
            break;
          }

          for (const item of itens) {
            yield {
              numeroProcesso: item.numeroProcesso,
              relator: item.relator,
              dataJulgamento: item.dataJulgamento,
              area,
              ementa: item.ementa,
            };
          }

          const proxima = page.locator('a.logtext:text-is(">")');
          if ((await proxima.count()) === 0) break;

          await Promise.all([page.waitForLoadState('networkidle'), proxima.first().click()]);
          await page.waitForTimeout(1000);
          await this.resolverCaptchaSeNecessario(page);

          pagina++;
        }
      } finally {
        await page.close();
      }
    }
  }

  private async resolverCaptchaSeNecessario(page: Page, maxTentativas = 5): Promise<boolean> {
    for (let i = 1; i <= maxTentativas; i++) {
      try {
        const imgEl = await page.$('#captcha_image');
        if (!imgEl) return true;

        const imgBuffer = await imgEl.screenshot();
        const resposta = await this.resolverImagemCaptcha(imgBuffer.toString('base64'));

        await page.fill('#captcha_text', resposta);
        await page.dispatchEvent('#captcha_text', 'keyup');
        await page.waitForTimeout(2500);

        const aindaTem = await page.$('#captcha_image');
        if (!aindaTem) return true;

        this.logger.warn(`TJMG: captcha errado na tentativa ${i}, tentando de novo`);
        await page.waitForTimeout(1000);
      } catch (err: any) {
        if (err.message?.includes('Execution context was destroyed') || err.message?.includes('Target closed')) {
          return true;
        }
        throw err;
      }
    }
    return false;
  }

  private async resolverImagemCaptcha(base64Imagem: string): Promise<string> {
    const apiKey = this.configService.get<string>('CAPSOLVER_API_KEY');
    if (!apiKey) throw new Error('CAPSOLVER_API_KEY não configurada');

    const resp = await axios.post('https://api.capsolver.com/createTask', {
      clientKey: apiKey,
      task: { type: 'ImageToTextTask', body: base64Imagem, module: 'common' },
    });

    if (resp.data.solution?.text) return resp.data.solution.text;
    throw new Error(`CapSolver não retornou solução: ${JSON.stringify(resp.data)}`);
  }
}

function formatarDataBr(data: Date): string {
  const dd = String(data.getDate()).padStart(2, '0');
  const mm = String(data.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${data.getFullYear()}`;
}
