import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { CrawlerService } from '../crawler.service';
import { TjesSolrAdapter, TERMOS_PADRAO_TJES } from '../adapters/tjes-solr.adapter';

@Injectable()
export class TjesCrawlJob {
  private readonly logger = new Logger(TjesCrawlJob.name);

  constructor(
    private readonly crawler: CrawlerService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Roda toda madrugada (8h UTC / 5h BRT, depois de TJSP, TJRJ, TJSC,
   * TJRS, TJBA, TJDFT, TJPB, TJMT e TJCE). Não usa BrowserPoolService —
   * roda via HTTP puro contra a API própria sobre Solr do TJES.
   */
  @Cron('0 8 * * *')
  async executarCrawlDiario(): Promise<void> {
    this.logger.log('Iniciando crawl diario do TJES (Solr)');

    try {
      await this.prisma.tribunal.upsert({
        where: { sigla: 'TJES' },
        update: {},
        create: { sigla: 'TJES', nome: 'Tribunal de Justiça do Espírito Santo', instancia: 'TRIBUNAL' },
      });

      const adapter = new TjesSolrAdapter({
        termos: TERMOS_PADRAO_TJES,
        maxPaginasPorTermo: 3,
      });

      this.crawler.registrarAdapter(adapter);
      const resultado = await this.crawler.executarCrawl('TJES');
      this.logger.log(`Crawl diario do TJES concluido: job ${resultado.jobId}`);
    } catch (err: any) {
      this.logger.error(`Crawl diario do TJES falhou: ${err.message}`);
    }
  }
}
