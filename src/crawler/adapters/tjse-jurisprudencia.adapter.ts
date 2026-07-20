import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { CrawlerAdapter } from '../crawler.service';
import { BrowserPoolService } from '../browser-pool.service';
import { parseResultadosTjse } from '../parsers/tjse-jurisprudencia.parser';

const PAGE_URL = 'https://www.tjse.jus.br/Dgorg/paginas/jurisprudencia/consultarJurisprudencia.tjse';
const SITEKEY = '0x4AAAAAABm4wVSbc9uzC01E';

export interface TjseTermo {
  termo: string;
  area?: string;
}

export interface TjseJurisprudenciaConfig {
  termos: TjseTermo[];
  maxPaginas?: number;
}

export const TERMOS_PADRAO_TJSE: TjseTermo[] = [
  { termo: 'responsabilidade civil', area: 'CIVIL' },
  { termo: 'relação de emprego', area: 'TRABALHISTA' },
  { termo: 'direito de família', area: 'FAMILIA' },
  { termo: 'benefício previdenciário', area: 'PREVIDENCIARIO' },
  { termo: 'habeas corpus', area: 'CRIMINAL' },
  { termo: 'execução fiscal', area: 'TRIBUTARIO' },
  { termo: 'ato administrativo', area: 'OUTRO' },
];

/**
 * Coleta acórdãos do TJSE via `consultarJurisprudencia.tjse`
 * (JSF/PrimeFaces). Protegido por Cloudflare Turnstile de verdade —
 * resolvido via CapSolver (`AntiTurnstileTaskProxyLess`, ~US$1,20-2/1000
 * dependendo do provedor). Achado crítico de integração: o formulário
 * NÃO valida o campo interno do próprio widget (`cf-turnstile-response`)
 * — ele valida um campo separado (`#turnstile-hidden`), preenchido pelo
 * `callback` JS customizado que a página registra em `turnstile.render`.
 * Setar só o campo interno resulta em "Captcha inválido" mesmo com um
 * token válido. Cada termo abre uma sessão nova (BrowserPoolService não
 * reaproveita), então o Turnstile é resolvido de novo a cada termo.
 */
export class TjseJurisprudenciaAdapter implements CrawlerAdapter {
  tribunalSigla = 'TJSE';
  private readonly logger = new Logger(TjseJurisprudenciaAdapter.name);

  constructor(
    private readonly browserPool: BrowserPoolService,
    private readonly configService: ConfigService,
    private readonly crawlConfig: TjseJurisprudenciaConfig,
  ) {}

  async *coletar() {
    const termos = this.crawlConfig.termos.length ? this.crawlConfig.termos : TERMOS_PADRAO_TJSE;
    const maxPaginas = this.crawlConfig.maxPaginas ?? 10;

    for (const { termo, area } of termos) {
      const page = await this.browserPool.newPage();

      try {
        const token = await this.resolverTurnstile();

        await page.goto(PAGE_URL, { waitUntil: 'load', timeout: 30000 });
        await page.waitForTimeout(1500);

        await page.evaluate((tok) => {
          const cfEl = document.querySelector('[name="cf-turnstile-response"]') as HTMLInputElement | null;
          if (cfEl) cfEl.value = tok;
          const hiddenEl = document.getElementById('turnstile-hidden') as HTMLInputElement | null;
          if (hiddenEl) hiddenEl.value = tok;
        }, token);

        await page.fill('#itTermos', termo);
        await Promise.all([page.waitForLoadState('networkidle'), page.click('#btPesquisar')]);
        await page.waitForTimeout(1000);

        const htmlErro = await page.content();
        if (htmlErro.includes('Captcha inválido')) {
          this.logger.warn(`TJSE: captcha inválido para o termo "${termo}", pulando`);
          continue;
        }

        let pagina = 1;
        while (pagina <= maxPaginas) {
          const html = await page.content();
          const itens = parseResultadosTjse(html);

          if (!itens.length) {
            this.logger.log(`TJSE: termo "${termo}", pagina ${pagina} sem resultados, encerrando termo`);
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

          const proxima = page.locator('.ui-paginator-next:not(.ui-state-disabled)');
          if ((await proxima.count()) === 0) break;

          await Promise.all([page.waitForLoadState('networkidle'), proxima.first().click()]);
          await page.waitForTimeout(1000);
          pagina++;
        }
      } finally {
        await page.close();
      }
    }
  }

  private async resolverTurnstile(): Promise<string> {
    const apiKey = this.configService.get<string>('CAPSOLVER_API_KEY');
    if (!apiKey) throw new Error('CAPSOLVER_API_KEY não configurada');

    const createResp = await axios.post('https://api.capsolver.com/createTask', {
      clientKey: apiKey,
      task: { type: 'AntiTurnstileTaskProxyLess', websiteURL: PAGE_URL, websiteKey: SITEKEY },
    });
    const taskId = createResp.data.taskId;
    if (!taskId) throw new Error(`CapSolver não retornou taskId: ${JSON.stringify(createResp.data)}`);

    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const resultResp = await axios.post('https://api.capsolver.com/getTaskResult', {
        clientKey: apiKey,
        taskId,
      });
      if (resultResp.data.status === 'ready') return resultResp.data.solution.token;
      if (resultResp.data.status === 'failed' || resultResp.data.errorId) {
        throw new Error(`CapSolver falhou: ${JSON.stringify(resultResp.data)}`);
      }
    }
    throw new Error('CapSolver: timeout esperando resolução do Turnstile');
  }
}

