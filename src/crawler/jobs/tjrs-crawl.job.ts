import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { CrawlerService } from '../crawler.service';
import { TjrsSolrAdapter, TERMOS_PADRAO_TJRS } from '../adapters/tjrs-solr.adapter';

@Injectable()
export class TjrsCrawlJob {
  private readonly logger = new Logger(TjrsCrawlJob.name);

  constructor(
    private readonly crawler: CrawlerService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Roda toda madrugada (9h UTC / 6h BRT, depois de TJSP, TJRJ e TJSC).
   * Não usa BrowserPoolService — igual ao TJSC, o TJRS roda via HTTP
   * puro contra o backend Solr.
   */
  @Cron('0 9 * * *')
  async executarCrawlDiario(): Promise<void> {
    this.logger.log('Iniciando crawl diario do TJRS (Solr)');

    try {
      await this.prisma.tribunal.upsert({
        where: { sigla: 'TJRS' },
        update: {},
        create: { sigla: 'TJRS', nome: 'Tribunal de Justiça do Rio Grande do Sul', instancia: 'TRIBUNAL' },
      });

      const adapter = new TjrsSolrAdapter({
        termos: TERMOS_PADRAO_TJRS,
        maxPaginasPorTermo: 3,
      });

      this.crawler.registrarAdapter(adapter);
      const resultado = await this.crawler.executarCrawl('TJRS');
      this.logger.log(`Crawl diario do TJRS concluido: job ${resultado.jobId}`);
    } catch (err: any) {
      this.logger.error(`Crawl diario do TJRS falhou: ${err.message}`);
    }
  }
}
