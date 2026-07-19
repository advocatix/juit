import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { CrawlerService } from '../crawler.service';
import { TjdfJurisdfAdapter, TERMOS_PADRAO_TJDF } from '../adapters/tjdf-jurisdf.adapter';

@Injectable()
export class TjdfCrawlJob {
  private readonly logger = new Logger(TjdfCrawlJob.name);

  constructor(
    private readonly crawler: CrawlerService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Roda toda madrugada (6h40 UTC / 3h40 BRT, depois de TJSP, TJRJ, TJSC,
   * TJRS e TJBA). Não usa BrowserPoolService — roda via HTTP puro
   * contra a API REST do JurisDF.
   */
  @Cron('40 6 * * *')
  async executarCrawlDiario(): Promise<void> {
    this.logger.log('Iniciando crawl diario do TJDFT (JurisDF)');

    try {
      await this.prisma.tribunal.upsert({
        where: { sigla: 'TJDFT' },
        update: {},
        create: { sigla: 'TJDFT', nome: 'Tribunal de Justiça do Distrito Federal e dos Territórios', instancia: 'TRIBUNAL' },
      });

      const adapter = new TjdfJurisdfAdapter({
        termos: TERMOS_PADRAO_TJDF,
        maxPaginasPorTermo: 3,
      });

      this.crawler.registrarAdapter(adapter);
      const resultado = await this.crawler.executarCrawl('TJDFT');
      this.logger.log(`Crawl diario do TJDFT concluido: job ${resultado.jobId}`);
    } catch (err: any) {
      this.logger.error(`Crawl diario do TJDFT falhou: ${err.message}`);
    }
  }
}
