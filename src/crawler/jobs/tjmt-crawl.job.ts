import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { CrawlerService } from '../crawler.service';
import { TjmtHellsgateAdapter, TERMOS_PADRAO_TJMT } from '../adapters/tjmt-hellsgate.adapter';

@Injectable()
export class TjmtCrawlJob {
  private readonly logger = new Logger(TjmtCrawlJob.name);

  constructor(
    private readonly crawler: CrawlerService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Roda toda madrugada (7h20 UTC / 4h20 BRT, depois de TJSP, TJRJ, TJSC,
   * TJRS, TJBA, TJDFT e TJPB). Não usa BrowserPoolService — roda via
   * HTTP puro contra a API REST do Portal Jurisprudência do TJMT.
   */
  @Cron('20 7 * * *')
  async executarCrawlDiario(): Promise<void> {
    this.logger.log('Iniciando crawl diario do TJMT (Hellsgate)');

    try {
      await this.prisma.tribunal.upsert({
        where: { sigla: 'TJMT' },
        update: {},
        create: { sigla: 'TJMT', nome: 'Tribunal de Justiça de Mato Grosso', instancia: 'TRIBUNAL' },
      });

      const adapter = new TjmtHellsgateAdapter({
        termos: TERMOS_PADRAO_TJMT,
        maxPaginasPorTermo: 3,
      });

      this.crawler.registrarAdapter(adapter);
      const resultado = await this.crawler.executarCrawl('TJMT');
      this.logger.log(`Crawl diario do TJMT concluido: job ${resultado.jobId}`);
    } catch (err: any) {
      this.logger.error(`Crawl diario do TJMT falhou: ${err.message}`);
    }
  }
}
