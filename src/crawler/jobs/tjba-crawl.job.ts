import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { CrawlerService } from '../crawler.service';
import { TjbaGraphqlAdapter, TERMOS_PADRAO_TJBA } from '../adapters/tjba-graphql.adapter';

@Injectable()
export class TjbaCrawlJob {
  private readonly logger = new Logger(TjbaCrawlJob.name);

  constructor(
    private readonly crawler: CrawlerService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Roda toda madrugada (10h UTC / 7h BRT, depois de TJSP, TJRJ, TJSC e
   * TJRS). Não usa BrowserPoolService — roda via HTTP puro contra a API
   * GraphQL do TJBA.
   */
  @Cron('0 10 * * *')
  async executarCrawlDiario(): Promise<void> {
    this.logger.log('Iniciando crawl diario do TJBA (GraphQL)');

    try {
      await this.prisma.tribunal.upsert({
        where: { sigla: 'TJBA' },
        update: {},
        create: { sigla: 'TJBA', nome: 'Tribunal de Justiça da Bahia', instancia: 'TRIBUNAL' },
      });

      const adapter = new TjbaGraphqlAdapter({
        termos: TERMOS_PADRAO_TJBA,
        maxPaginasPorTermo: 3,
      });

      this.crawler.registrarAdapter(adapter);
      const resultado = await this.crawler.executarCrawl('TJBA');
      this.logger.log(`Crawl diario do TJBA concluido: job ${resultado.jobId}`);
    } catch (err: any) {
      this.logger.error(`Crawl diario do TJBA falhou: ${err.message}`);
    }
  }
}
