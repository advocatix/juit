import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { CrawlerService } from '../crawler.service';
import { BrowserPoolService } from '../browser-pool.service';
import { TjpeJurisprudenciaAdapter, TERMOS_PADRAO_TJPE } from '../adapters/tjpe-jurisprudencia.adapter';

@Injectable()
export class TjpeCrawlJob {
  private readonly logger = new Logger(TjpeCrawlJob.name);

  constructor(
    private readonly crawler: CrawlerService,
    private readonly browserPool: BrowserPoolService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Roda toda madrugada (11h20 UTC / 8h20 BRT, depois do TJSE às
   * 11h00 UTC). Sem CAPTCHA — JSF/RichFaces stateful, usa
   * BrowserPoolService (ver tjpe-jurisprudencia.adapter.ts).
   */
  @Cron('20 11 * * *')
  async executarCrawlDiario(): Promise<void> {
    this.logger.log('Iniciando crawl diario do TJPE');

    try {
      await this.prisma.tribunal.upsert({
        where: { sigla: 'TJPE' },
        update: {},
        create: { sigla: 'TJPE', nome: 'Tribunal de Justiça de Pernambuco', instancia: 'TRIBUNAL' },
      });

      const adapter = new TjpeJurisprudenciaAdapter(this.browserPool, {
        termos: TERMOS_PADRAO_TJPE,
        maxPaginas: 5,
      });

      this.crawler.registrarAdapter(adapter);
      const resultado = await this.crawler.executarCrawl('TJPE');
      this.logger.log(`Crawl diario do TJPE concluido: job ${resultado.jobId}`);
    } catch (err: any) {
      this.logger.error(`Crawl diario do TJPE falhou: ${err.message}`);
    }
  }
}
