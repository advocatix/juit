import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { CrawlerService } from '../crawler.service';
import { BrowserPoolService } from '../browser-pool.service';
import { TjacCjsgAdapter } from '../adapters/tjac-cjsg.adapter';

@Injectable()
export class TjacCrawlJob {
  private readonly logger = new Logger(TjacCrawlJob.name);

  constructor(
    private readonly crawler: CrawlerService,
    private readonly browserPool: BrowserPoolService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Roda toda madrugada (21h UTC / 18h BRT, depois de TJSP, TJRJ, TJSC,
   * TJRS, TJBA, TJDFT, TJPB, TJMT, TJCE, TJES, TJRN, TJTO, TJPI, TJAL e
   * TJRR). Mesmo e-SAJ do TJSP (reCAPTCHA v3) — busca por período de
   * julgamento das últimas 24h.
   */
  @Cron('0 21 * * *')
  async executarCrawlDiario(): Promise<void> {
    this.logger.log('Iniciando crawl diario do TJAC (CJSG)');

    try {
      await this.prisma.tribunal.upsert({
        where: { sigla: 'TJAC' },
        update: {},
        create: { sigla: 'TJAC', nome: 'Tribunal de Justiça do Acre', instancia: 'TRIBUNAL' },
      });

      const hoje = new Date();
      const ontem = new Date(hoje);
      ontem.setDate(ontem.getDate() - 1);

      const adapter = new TjacCjsgAdapter(this.browserPool, {
        dataJulgamentoInicio: ontem,
        dataJulgamentoFim: hoje,
        maxPaginas: 5,
      });

      this.crawler.registrarAdapter(adapter);
      const resultado = await this.crawler.executarCrawl('TJAC');
      this.logger.log(`Crawl diario do TJAC concluido: job ${resultado.jobId}`);
    } catch (err: any) {
      this.logger.error(`Crawl diario do TJAC falhou: ${err.message}`);
    }
  }
}
