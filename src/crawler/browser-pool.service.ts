import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { chromium, Page } from 'playwright-core';

/** Timeout de sessão do Browserbase — o default do projeto é 300s (5
 *  min), curto demais pra crawls profundos de backfill (centenas de
 *  páginas). Criamos a sessão explicitamente via API com um timeout
 *  maior em vez de usar o endpoint generico de connect (que sempre
 *  usa o default do projeto). Descoberto ao vivo: um crawl do TJSP
 *  foi encerrado no meio (`Target page... has been closed`) depois
 *  de ~5min processando um dia de volume real. */
const SESSION_TIMEOUT_SEGUNDOS = 1800;

/**
 * Alguns tribunais (STJ/SCON) usam Cloudflare Turnstile em vez de
 * reCAPTCHA v3 — a página fica em "Verificação automática em andamento"
 * por alguns segundos antes de liberar. Não é instantâneo mesmo com
 * browser real (confirmado ao vivo via Browserbase: ~10-15s numa sessão
 * nova). Numa sessão Browserbase REAPROVEITADA entre buscas, o Turnstile
 * passou a nunca liberar (~60s+, testado 3x seguidas) — a reputação da
 * sessão/IP parece degradar com uso repetido. Por isso BrowserPoolService
 * abre uma sessão nova a cada `newPage()`, nunca reaproveita.
 */
export async function aguardarDesafioCloudflare(
  page: Page,
  textoDesafio = 'Verificação automática',
  tentativas = 12,
  intervaloMs = 5000,
): Promise<boolean> {
  for (let i = 0; i < tentativas; i++) {
    await page.waitForTimeout(intervaloMs);
    const html = await page.content().catch(() => '');
    if (!html.includes(textoDesafio)) return true;
  }
  return false;
}

@Injectable()
export class BrowserPoolService {
  private readonly logger = new Logger(BrowserPoolService.name);

  constructor(private config: ConfigService) {}

  /** Sempre conecta uma sessão nova — ver comentário acima sobre reuso. */
  async newPage(): Promise<Page> {
    const browserbaseKey = this.config.get<string>('BROWSERBASE_API_KEY');
    const localChromePath = this.config.get<string>('PLAYWRIGHT_CHROMIUM_PATH');

    const browser = browserbaseKey
      ? await this.conectarBrowserbase(browserbaseKey)
      : localChromePath
        ? await this.lancarChromeLocal(localChromePath)
        : (() => {
            throw new Error(
              'Nenhum browser configurado: defina BROWSERBASE_API_KEY (produção) ou PLAYWRIGHT_CHROMIUM_PATH (dev local)',
            );
          })();

    const context = await browser.newContext({ locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
    const page = await context.newPage();
    page.once('close', () => {
      browser.close().catch(() => {});
    });
    return page;
  }

  private async conectarBrowserbase(apiKey: string) {
    this.logger.log('Conectando ao Browserbase (sessão nova)...');

    const projectId = this.config.get<string>('BROWSERBASE_PROJECT_ID');
    let connectUrl = `wss://connect.browserbase.com?apiKey=${apiKey}`;

    if (projectId) {
      try {
        const resp = await axios.post(
          'https://api.browserbase.com/v1/sessions',
          { projectId, timeout: SESSION_TIMEOUT_SEGUNDOS },
          { headers: { 'X-BB-API-Key': apiKey, 'Content-Type': 'application/json' } },
        );
        connectUrl = resp.data.connectUrl;
      } catch (err: any) {
        this.logger.warn(
          `Falha ao criar sessão com timeout customizado (${err.message}), usando connect genérico (timeout default do projeto)`,
        );
      }
    } else {
      this.logger.warn('BROWSERBASE_PROJECT_ID não configurada — sessão usará o timeout default do projeto (5min)');
    }

    const browser = await chromium.connectOverCDP(connectUrl);
    this.logger.log('Browserbase conectado');
    return browser;
  }

  private async lancarChromeLocal(executablePath: string) {
    this.logger.warn('BROWSERBASE_API_KEY ausente — usando Chrome local (apenas para dev)');
    return chromium.launch({
      headless: false,
      executablePath,
      args: ['--disable-blink-features=AutomationControlled'],
    });
  }
}
