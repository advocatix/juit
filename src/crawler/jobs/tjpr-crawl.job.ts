import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { CrawlerService } from '../crawler.service';
import { BrowserPoolService } from '../browser-pool.service';
import { TjprJurisAdapter, TERMOS_PADRAO_TJPR } from '../adapters/tjpr-juris.adapter';

@Injectable()
export class TjprCrawlJob {
  private readonly logger = new Logger(TjprCrawlJob.name);

  constructor(
    private readonly crawler: CrawlerService,
    private readonly browserPool: BrowserPoolService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Roda toda madrugada (2h BRT). Este job só existe na branch
   * `worker-residencial` — pensado pra rodar numa máquina com IP
   * residencial (não Browserbase/datacenter), já que o TJPR funciona
   * local mas falha via Browserbase (ver memória do projeto).
   */
  @Cron('0 2 * * *')
  async executarCrawlDiario(): Promise<void> {
    this.logger.log('Iniciando crawl diario do TJPR (worker residencial)');

    try {
      await this.prisma.tribunal.upsert({
        where: { sigla: 'TJPR' },
        update: {},
        create: { sigla: 'TJPR', nome: 'Tribunal de Justiça do Paraná', instancia: 'TRIBUNAL' },
      });

      const adapter = new TjprJurisAdapter(this.browserPool, {
        termos: TERMOS_PADRAO_TJPR,
        maxPaginasPorTermo: 2,
      });

      this.crawler.registrarAdapter(adapter);
      const resultado = await this.crawler.executarCrawl('TJPR');
      this.logger.log(`Crawl diario do TJPR concluido: job ${resultado.jobId}`);
    } catch (err: any) {
      this.logger.error(`Crawl diario do TJPR falhou: ${err.message}`);
    }
  }
}
