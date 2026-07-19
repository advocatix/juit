import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { CrawlerService } from '../crawler.service';
import { TjpiConsultaAdapter, TERMOS_PADRAO_TJPI } from '../adapters/tjpi-consulta.adapter';

@Injectable()
export class TjpiCrawlJob {
  private readonly logger = new Logger(TjpiCrawlJob.name);

  constructor(
    private readonly crawler: CrawlerService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Roda toda madrugada (18h UTC / 15h BRT, depois de TJSP, TJRJ, TJSC,
   * TJRS, TJBA, TJDFT, TJPB, TJMT, TJCE, TJES, TJRN e TJTO). Não usa
   * BrowserPoolService — roda via HTTP puro contra o JusPI.
   */
  @Cron('0 18 * * *')
  async executarCrawlDiario(): Promise<void> {
    this.logger.log('Iniciando crawl diario do TJPI (JusPI)');

    try {
      await this.prisma.tribunal.upsert({
        where: { sigla: 'TJPI' },
        update: {},
        create: { sigla: 'TJPI', nome: 'Tribunal de Justiça do Piauí', instancia: 'TRIBUNAL' },
      });

      const adapter = new TjpiConsultaAdapter({
        termos: TERMOS_PADRAO_TJPI,
        maxPaginasPorTermo: 3,
      });

      this.crawler.registrarAdapter(adapter);
      const resultado = await this.crawler.executarCrawl('TJPI');
      this.logger.log(`Crawl diario do TJPI concluido: job ${resultado.jobId}`);
    } catch (err: any) {
      this.logger.error(`Crawl diario do TJPI falhou: ${err.message}`);
    }
  }
}
