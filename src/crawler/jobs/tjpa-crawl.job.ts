import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { CrawlerService } from '../crawler.service';
import { TjpaDecisoesAdapter, TERMOS_PADRAO_TJPA } from '../adapters/tjpa-decisoes.adapter';

@Injectable()
export class TjpaCrawlJob {
  private readonly logger = new Logger(TjpaCrawlJob.name);

  constructor(
    private readonly crawler: CrawlerService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Roda toda madrugada (12h00 UTC / 9h00 BRT, depois do TJGO às
   * 11h40 UTC). Sem CAPTCHA, sem browser — API JSON nativa direto via
   * HTTP (ver tjpa-decisoes.adapter.ts).
   */
  @Cron('0 12 * * *')
  async executarCrawlDiario(): Promise<void> {
    this.logger.log('Iniciando crawl diario do TJPA');

    try {
      await this.prisma.tribunal.upsert({
        where: { sigla: 'TJPA' },
        update: {},
        create: { sigla: 'TJPA', nome: 'Tribunal de Justiça do Pará', instancia: 'TRIBUNAL' },
      });

      const adapter = new TjpaDecisoesAdapter({
        termos: TERMOS_PADRAO_TJPA,
        maxPaginasPorTermo: 3,
      });

      this.crawler.registrarAdapter(adapter);
      const resultado = await this.crawler.executarCrawl('TJPA');
      this.logger.log(`Crawl diario do TJPA concluido: job ${resultado.jobId}`);
    } catch (err: any) {
      this.logger.error(`Crawl diario do TJPA falhou: ${err.message}`);
    }
  }
}
