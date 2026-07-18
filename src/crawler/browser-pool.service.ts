import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { chromium, Browser, BrowserContext, Page } from 'playwright-core';

/**
 * Mesmo padrão do apps/api/src/jarvis/browser-pool.service.ts: em produção
 * conecta a um browser real via Browserbase (CDP) — necessário porque o
 * CJSG do TJSP exige reCAPTCHA v3, que só passa com execução de JS de
 * browser real, não com axios/cheerio puro. Em dev local, sem
 * BROWSERBASE_API_KEY, cai para um Chrome instalado localmente
 * (PLAYWRIGHT_CHROMIUM_PATH) — nunca para o chromium bundled do
 * playwright, que é detectado como automação com mais facilidade.
 */
@Injectable()
export class BrowserPoolService implements OnModuleDestroy {
  private readonly logger = new Logger(BrowserPoolService.name);
  private browser: Browser | null = null;

  constructor(private config: ConfigService) {}

  async getBrowser(): Promise<Browser> {
    if (this.browser?.isConnected()) return this.browser;

    const browserbaseKey = this.config.get<string>('BROWSERBASE_API_KEY');
    if (browserbaseKey) {
      this.logger.log('Conectando ao Browserbase...');
      this.browser = await chromium.connectOverCDP(`wss://connect.browserbase.com?apiKey=${browserbaseKey}`);
      this.logger.log('Browserbase conectado');
      return this.browser;
    }

    const localChromePath = this.config.get<string>('PLAYWRIGHT_CHROMIUM_PATH');
    if (localChromePath) {
      this.logger.warn('BROWSERBASE_API_KEY ausente — usando Chrome local (apenas para dev)');
      this.browser = await chromium.launch({
        headless: false,
        executablePath: localChromePath,
        args: ['--disable-blink-features=AutomationControlled'],
      });
      return this.browser;
    }

    throw new Error(
      'Nenhum browser configurado: defina BROWSERBASE_API_KEY (produção) ou PLAYWRIGHT_CHROMIUM_PATH (dev local)',
    );
  }

  async newContext(): Promise<BrowserContext> {
    const browser = await this.getBrowser();
    return browser.newContext({ locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  }

  async newPage(): Promise<Page> {
    const ctx = await this.newContext();
    return ctx.newPage();
  }

  async onModuleDestroy() {
    if (this.browser?.isConnected()) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
