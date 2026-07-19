import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { CrawlerService } from '../crawler.service';
import { TjpbJurispbAdapter, TERMOS_PADRAO_TJPB } from '../adapters/tjpb-jurispb.adapter';

@Injectable()
export class TjpbCrawlJob {
  private readonly logger = new Logger(TjpbCrawlJob.name);

  constructor(
    private readonly crawler: CrawlerService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Roda toda madrugada (12h UTC / 9h BRT, depois de TJSP, TJRJ, TJSC,
   * TJRS, TJBA e TJDFT). Não usa BrowserPoolService — roda via HTTP
   * puro contra a API REST do JurisPB.
   */
  @Cron('0 12 * * *')
  async executarCrawlDiario(): Promise<void> {
    this.logger.log('Iniciando crawl diario do TJPB (JurisPB)');

    try {
      await this.prisma.tribunal.upsert({
        where: { sigla: 'TJPB' },
        update: {},
        create: { sigla: 'TJPB', nome: 'Tribunal de Justiça da Paraíba', instancia: 'TRIBUNAL' },
      });

      const adapter = new TjpbJurispbAdapter({
        termos: TERMOS_PADRAO_TJPB,
        maxPaginasPorTermo: 3,
      });

      this.crawler.registrarAdapter(adapter);
      const resultado = await this.crawler.executarCrawl('TJPB');
      this.logger.log(`Crawl diario do TJPB concluido: job ${resultado.jobId}`);
    } catch (err: any) {
      this.logger.error(`Crawl diario do TJPB falhou: ${err.message}`);
    }
  }
}
