import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { CrawlerService } from '../crawler.service';
import { BrowserPoolService } from '../browser-pool.service';
import { TjalCjsgAdapter } from '../adapters/tjal-cjsg.adapter';

@Injectable()
export class TjalCrawlJob {
  private readonly logger = new Logger(TjalCrawlJob.name);

  constructor(
    private readonly crawler: CrawlerService,
    private readonly browserPool: BrowserPoolService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Roda toda madrugada (19h UTC / 16h BRT, depois de TJSP, TJRJ, TJSC,
   * TJRS, TJBA, TJDFT, TJPB, TJMT, TJCE, TJES, TJRN, TJTO e TJPI). Usa
   * BrowserPoolService (mesmo e-SAJ do TJSP, reCAPTCHA v3) — busca por
   * período de julgamento das últimas 24h.
   */
  @Cron('0 19 * * *')
  async executarCrawlDiario(): Promise<void> {
    this.logger.log('Iniciando crawl diario do TJAL (CJSG)');

    try {
      await this.prisma.tribunal.upsert({
        where: { sigla: 'TJAL' },
        update: {},
        create: { sigla: 'TJAL', nome: 'Tribunal de Justiça de Alagoas', instancia: 'TRIBUNAL' },
      });

      const hoje = new Date();
      const ontem = new Date(hoje);
      ontem.setDate(ontem.getDate() - 1);

      const adapter = new TjalCjsgAdapter(this.browserPool, {
        dataJulgamentoInicio: ontem,
        dataJulgamentoFim: hoje,
        maxPaginas: 5,
      });

      this.crawler.registrarAdapter(adapter);
      const resultado = await this.crawler.executarCrawl('TJAL');
      this.logger.log(`Crawl diario do TJAL concluido: job ${resultado.jobId}`);
    } catch (err: any) {
      this.logger.error(`Crawl diario do TJAL falhou: ${err.message}`);
    }
  }
}
