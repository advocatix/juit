import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { CrawlerService } from '../crawler.service';
import { BrowserPoolService } from '../browser-pool.service';
import { TjseJurisprudenciaAdapter, TERMOS_PADRAO_TJSE } from '../adapters/tjse-jurisprudencia.adapter';

@Injectable()
export class TjseCrawlJob {
  private readonly logger = new Logger(TjseCrawlJob.name);

  constructor(
    private readonly crawler: CrawlerService,
    private readonly browserPool: BrowserPoolService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Roda toda madrugada (11h00 UTC / 8h00 BRT, depois de TJSP, TJRJ,
   * TJSC, TJRS, TJBA, TJDFT, TJPB, TJMT, TJCE, TJES, TJRN, TJTO, TJPI,
   * TJAL, TJRR, TJAC, FALCÃO e TJMG). Resolve Cloudflare Turnstile via
   * CapSolver a cada termo buscado (BrowserPoolService abre sessão
   * nova por termo, então o token é resolvido de novo a cada um).
   */
  @Cron('0 11 * * *')
  async executarCrawlDiario(): Promise<void> {
    this.logger.log('Iniciando crawl diario do TJSE');

    try {
      await this.prisma.tribunal.upsert({
        where: { sigla: 'TJSE' },
        update: {},
        create: { sigla: 'TJSE', nome: 'Tribunal de Justiça de Sergipe', instancia: 'TRIBUNAL' },
      });

      const adapter = new TjseJurisprudenciaAdapter(this.browserPool, this.configService, {
        termos: TERMOS_PADRAO_TJSE,
        maxPaginas: 5,
      });

      this.crawler.registrarAdapter(adapter);
      const resultado = await this.crawler.executarCrawl('TJSE');
      this.logger.log(`Crawl diario do TJSE concluido: job ${resultado.jobId}`);
    } catch (err: any) {
      this.logger.error(`Crawl diario do TJSE falhou: ${err.message}`);
    }
  }
}
