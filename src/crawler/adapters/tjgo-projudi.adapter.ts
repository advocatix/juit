import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { CrawlerAdapter } from '../crawler.service';
import { BrowserPoolService } from '../browser-pool.service';
import { parseResultadosTjgo } from '../parsers/tjgo-projudi.parser';

const PAGE_URL = 'https://projudi.tjgo.jus.br/ConsultaJurisprudencia';
const SITEKEY = '0x4AAAAAABeYdOewv6AT0dzB';

export interface TjgoTermo {
  termo: string;
  area?: string;
}

export interface TjgoProjudiConfig {
  termos: TjgoTermo[];
  maxPaginas?: number;
}

export const TERMOS_PADRAO_TJGO: TjgoTermo[] = [
  { termo: 'responsabilidade civil', area: 'CIVIL' },
  { termo: 'relação de emprego', area: 'TRABALHISTA' },
  { termo: 'direito de família', area: 'FAMILIA' },
  { termo: 'benefício previdenciário', area: 'PREVIDENCIARIO' },
  { termo: 'habeas corpus', area: 'CRIMINAL' },
  { termo: 'execução fiscal', area: 'TRIBUTARIO' },
  { termo: 'ato administrativo', area: 'OUTRO' },
];

/**
 * Coleta acórdãos/decisões do TJGO via o "Novo Módulo de Pesquisa de
 * Jurisprudência" do PROJUDI (`ConsultaJurisprudencia`) — diferente do
 * sistema antigo (`juris.php`, descartado por ser 1 registro por vez),
 * este mostra uma lista de 10 resultados por página. Protegido por
 * Cloudflare Turnstile (widget visível, não invisible) — resolvido via
 * CapSolver. Diferente do TJSE/TJAP (frameworks reativos), aqui o
 * callback do Turnstile é jQuery puro (`$("#g-recaptcha-response")
 * .attr("value", token)`), sem problema de reatividade — o token
 * injetado é lido normalmente no submit.
 *
 * Paginação usa uma função JS global `submitForm(indice)` (índice
 * baseado em 0, não em "página"); chamamos direto via `page.evaluate`
 * em vez de tentar clicar em links de paginação, mais robusto.
 */
export class TjgoProjudiAdapter implements CrawlerAdapter {
  tribunalSigla = 'TJGO';
  private readonly logger = new Logger(TjgoProjudiAdapter.name);

  constructor(
    private readonly browserPool: BrowserPoolService,
    private readonly configService: ConfigService,
    private readonly config: TjgoProjudiConfig,
  ) {}

  async *coletar() {
    const termos = this.config.termos.length ? this.config.termos : TERMOS_PADRAO_TJGO;
    const maxPaginas = this.config.maxPaginas ?? 5;

    for (const { termo, area } of termos) {
      let page = await this.browserPool.newPage();
      let buscaOk = false;

      try {
        // O token do CapSolver (proxyless) às vezes é rejeitado pela
        // Cloudflare nesse site especificamente (falha intermitente,
        // não confirmada no TJSE) — cada tentativa usa uma sessão
        // (page) nova, já que reaproveitar a mesma após uma rejeição
        // não ajuda (ver browser-pool.service.ts sobre não reaproveitar
        // sessões Browserbase).
        for (let tentativa = 1; tentativa <= 3 && !buscaOk; tentativa++) {
          if (tentativa > 1) {
            await page.close();
            page = await this.browserPool.newPage();
          }

          const token = await this.resolverTurnstile();

          await page.goto(PAGE_URL, { waitUntil: 'load', timeout: 30000 });
          await page.waitForTimeout(1500);

          await page.fill('#Texto', termo);
          await page.evaluate((tok) => {
            const el = document.getElementById('g-recaptcha-response');
            if (el) el.setAttribute('value', tok);
          }, token);

          await Promise.all([
            page.waitForResponse((r) => r.request().method() === 'POST', { timeout: 20000 }).catch(() => null),
            page.click('#formLocalizarBotao', { force: true }),
          ]);
          await page.waitForTimeout(2000);

          const totalInicial = await page.locator('div.search-result').count();
          if (totalInicial > 0) {
            buscaOk = true;
          } else {
            this.logger.warn(`TJGO: tentativa ${tentativa} sem resultados pro termo "${termo}" (provável token rejeitado), tentando de novo`);
          }
        }

        if (!buscaOk) {
          this.logger.warn(`TJGO: desistindo do termo "${termo}" depois de 3 tentativas`);
          continue;
        }

        let pagina = 0;
        while (pagina < maxPaginas) {
          const html = await page.content();
          const totalBruto = await page.locator('div.search-result').count();

          if (!totalBruto) {
            this.logger.log(`TJGO: termo "${termo}", pagina ${pagina} sem resultados, encerrando termo`);
            break;
          }

          // A ordenação padrão é "mais recente primeiro", e sentenças de
          // 1o grau costumam ser publicadas com muito mais frequência
          // que acórdãos/decisões de 2o grau — uma página inteira pode
          // ter 0 itens úteis (todos sem "Ementa:") sem que isso
          // signifique fim dos resultados, por isso continuamos
          // paginando mesmo com `itens` vazio aqui.
          const itens = parseResultadosTjgo(html);

          for (const item of itens) {
            yield {
              numeroProcesso: item.numeroProcesso,
              orgaoJulgador: item.orgaoJulgador,
              relator: item.relator,
              area,
              ementa: item.ementa,
            };
          }

          pagina++;
          if (pagina >= maxPaginas) break;

          const avancou = await page
            .evaluate((idx) => {
              // @ts-ignore - funcao global da propria pagina
              if (typeof submitForm === 'function') {
                // @ts-ignore
                submitForm(idx);
                return true;
              }
              return false;
            }, pagina)
            .catch(() => false);
          if (!avancou) break;

          await page.waitForTimeout(2000);
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
