import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { CrawlerService } from '../crawler.service';
import { BrowserPoolService } from '../browser-pool.service';
import { TjmsCjsgAdapter } from '../adapters/tjms-cjsg.adapter';

@Injectable()
export class TjmsCrawlJob {
  private readonly logger = new Logger(TjmsCrawlJob.name);

  constructor(
    private readonly crawler: CrawlerService,
    private readonly browserPool: BrowserPoolService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Roda toda madrugada (2h20 BRT). Este job só existe na branch
   * `worker-residencial` — o TJMS funciona local mas dá ERR_TIMED_OUT
   * via Browserbase (ver memória do projeto).
   */
  @Cron('20 2 * * *')
  async executarCrawlDiario(): Promise<void> {
    this.logger.log('Iniciando crawl diario do TJMS (worker residencial)');

    try {
      await this.prisma.tribunal.upsert({
        where: { sigla: 'TJMS' },
        update: {},
        create: { sigla: 'TJMS', nome: 'Tribunal de Justiça do Mato Grosso do Sul', instancia: 'TRIBUNAL' },
      });

      const hoje = new Date();
      const ontem = new Date(hoje);
      ontem.setDate(ontem.getDate() - 1);

      const adapter = new TjmsCjsgAdapter(this.browserPool, {
        dataJulgamentoInicio: ontem,
        dataJulgamentoFim: hoje,
        maxPaginas: 5,
      });

      this.crawler.registrarAdapter(adapter);
      const resultado = await this.crawler.executarCrawl('TJMS');
      this.logger.log(`Crawl diario do TJMS concluido: job ${resultado.jobId}`);
    } catch (err: any) {
      this.logger.error(`Crawl diario do TJMS falhou: ${err.message}`);
    }
  }
}
