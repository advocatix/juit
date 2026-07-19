import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { CrawlerService } from '../crawler.service';
import { BrowserPoolService } from '../browser-pool.service';
import { TjrrJurisAdapter, TERMOS_PADRAO_TJRR } from '../adapters/tjrr-juris.adapter';

@Injectable()
export class TjrrCrawlJob {
  private readonly logger = new Logger(TjrrCrawlJob.name);

  constructor(
    private readonly crawler: CrawlerService,
    private readonly browserPool: BrowserPoolService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Roda toda madrugada (20h UTC / 17h BRT, depois de TJSP, TJRJ, TJSC,
   * TJRS, TJBA, TJDFT, TJPB, TJMT, TJCE, TJES, TJRN, TJTO, TJPI e
   * TJAL). Usa BrowserPoolService (JSF/PrimeFaces, sem CAPTCHA, mas
   * app stateful) — busca por termo amplo, um por área do direito.
   */
  @Cron('0 20 * * *')
  async executarCrawlDiario(): Promise<void> {
    this.logger.log('Iniciando crawl diario do TJRR (Juris)');

    try {
      await this.prisma.tribunal.upsert({
        where: { sigla: 'TJRR' },
        update: {},
        create: { sigla: 'TJRR', nome: 'Tribunal de Justiça de Roraima', instancia: 'TRIBUNAL' },
      });

      const adapter = new TjrrJurisAdapter(this.browserPool, {
        termos: TERMOS_PADRAO_TJRR,
        maxPaginasPorTermo: 3,
      });

      this.crawler.registrarAdapter(adapter);
      const resultado = await this.crawler.executarCrawl('TJRR');
      this.logger.log(`Crawl diario do TJRR concluido: job ${resultado.jobId}`);
    } catch (err: any) {
      this.logger.error(`Crawl diario do TJRR falhou: ${err.message}`);
    }
  }
}
