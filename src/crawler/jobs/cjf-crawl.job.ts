import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { BrowserPoolService } from '../browser-pool.service';
import { TERMOS_PADRAO_CJF } from '../adapters/cjf-unificada.adapter';
import { executarCjfCrawl } from '../adapters/cjf-runner';

@Injectable()
export class CjfCrawlJob {
  private readonly logger = new Logger(CjfCrawlJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly browserPool: BrowserPoolService,
  ) {}

  /**
   * Roda toda madrugada (3h20 BRT). Este job só existe na branch
   * `worker-residencial` — a Jurisprudência Unificada do CJF (STF +
   * STJ + TNU + TRF1..5) funciona local mas dá ERR_TIMED_OUT via
   * Browserbase, e é bloqueada por política em provedores de proxy
   * residencial tipo Bright Data (classificada como "Government").
   * Não usa CrawlerService.executarCrawl genérico (ver cjf-runner.ts).
   */
  @Cron('20 3 * * *')
  async executarCrawlDiario(): Promise<void> {
    this.logger.log('Iniciando crawl diario do CJF (worker residencial)');

    try {
      const resultado = await executarCjfCrawl(this.prisma, this.browserPool, {
        termos: TERMOS_PADRAO_CJF,
        maxPaginasPorTermo: 3,
      });
      this.logger.log(`Crawl diario do CJF concluido: job ${resultado.jobId}`);
    } catch (err: any) {
      this.logger.error(`Crawl diario do CJF falhou: ${err.message}`);
    }
  }
}
