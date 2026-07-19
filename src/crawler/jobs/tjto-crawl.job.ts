import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { CrawlerService } from '../crawler.service';
import { TjtoConsultaAdapter, TERMOS_PADRAO_TJTO } from '../adapters/tjto-consulta.adapter';

@Injectable()
export class TjtoCrawlJob {
  private readonly logger = new Logger(TjtoCrawlJob.name);

  constructor(
    private readonly crawler: CrawlerService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Roda toda madrugada (17h UTC / 14h BRT, depois de TJSP, TJRJ, TJSC,
   * TJRS, TJBA, TJDFT, TJPB, TJMT, TJCE, TJES e TJRN). Não usa
   * BrowserPoolService — roda via HTTP puro contra o portal
   * "Jurisprudência 4.0" do TJTO.
   */
  @Cron('0 17 * * *')
  async executarCrawlDiario(): Promise<void> {
    this.logger.log('Iniciando crawl diario do TJTO (Jurisprudencia 4.0)');

    try {
      await this.prisma.tribunal.upsert({
        where: { sigla: 'TJTO' },
        update: {},
        create: { sigla: 'TJTO', nome: 'Tribunal de Justiça do Tocantins', instancia: 'TRIBUNAL' },
      });

      const adapter = new TjtoConsultaAdapter({
        termos: TERMOS_PADRAO_TJTO,
        maxPaginasPorTermo: 3,
      });

      this.crawler.registrarAdapter(adapter);
      const resultado = await this.crawler.executarCrawl('TJTO');
      this.logger.log(`Crawl diario do TJTO concluido: job ${resultado.jobId}`);
    } catch (err: any) {
      this.logger.error(`Crawl diario do TJTO falhou: ${err.message}`);
    }
  }
}
