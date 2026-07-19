import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { CrawlerService } from '../crawler.service';
import { TjrnElasticAdapter, TERMOS_PADRAO_TJRN } from '../adapters/tjrn-elastic.adapter';

@Injectable()
export class TjrnCrawlJob {
  private readonly logger = new Logger(TjrnCrawlJob.name);

  constructor(
    private readonly crawler: CrawlerService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Roda toda madrugada (8h20 UTC / 5h20 BRT, depois de TJSP, TJRJ, TJSC,
   * TJRS, TJBA, TJDFT, TJPB, TJMT, TJCE e TJES). Não usa
   * BrowserPoolService — roda via HTTP puro contra a API de
   * jurisprudência (Elasticsearch) do TJRN.
   */
  @Cron('20 8 * * *')
  async executarCrawlDiario(): Promise<void> {
    this.logger.log('Iniciando crawl diario do TJRN (Elasticsearch)');

    try {
      await this.prisma.tribunal.upsert({
        where: { sigla: 'TJRN' },
        update: {},
        create: { sigla: 'TJRN', nome: 'Tribunal de Justiça do Rio Grande do Norte', instancia: 'TRIBUNAL' },
      });

      const adapter = new TjrnElasticAdapter({
        termos: TERMOS_PADRAO_TJRN,
        maxPaginasPorTermo: 3,
      });

      this.crawler.registrarAdapter(adapter);
      const resultado = await this.crawler.executarCrawl('TJRN');
      this.logger.log(`Crawl diario do TJRN concluido: job ${resultado.jobId}`);
    } catch (err: any) {
      this.logger.error(`Crawl diario do TJRN falhou: ${err.message}`);
    }
  }
}
