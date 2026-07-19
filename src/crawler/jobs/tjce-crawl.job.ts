import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { CrawlerService } from '../crawler.service';
import { TjceSjurisAdapter, TERMOS_PADRAO_TJCE } from '../adapters/tjce-sjuris.adapter';

@Injectable()
export class TjceCrawlJob {
  private readonly logger = new Logger(TjceCrawlJob.name);

  constructor(
    private readonly crawler: CrawlerService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Roda toda madrugada (7h40 UTC / 4h40 BRT, depois de TJSP, TJRJ, TJSC,
   * TJRS, TJBA, TJDFT, TJPB e TJMT). Não usa BrowserPoolService — roda
   * via HTTP puro contra a API REST do SJURIS.
   */
  @Cron('40 7 * * *')
  async executarCrawlDiario(): Promise<void> {
    this.logger.log('Iniciando crawl diario do TJCE (SJURIS)');

    try {
      await this.prisma.tribunal.upsert({
        where: { sigla: 'TJCE' },
        update: {},
        create: { sigla: 'TJCE', nome: 'Tribunal de Justiça do Ceará', instancia: 'TRIBUNAL' },
      });

      const adapter = new TjceSjurisAdapter({
        termos: TERMOS_PADRAO_TJCE,
        maxPaginasPorTermo: 3,
      });

      this.crawler.registrarAdapter(adapter);
      const resultado = await this.crawler.executarCrawl('TJCE');
      this.logger.log(`Crawl diario do TJCE concluido: job ${resultado.jobId}`);
    } catch (err: any) {
      this.logger.error(`Crawl diario do TJCE falhou: ${err.message}`);
    }
  }
}
