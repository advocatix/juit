import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { CrawlerService } from '../crawler.service';
import { BrowserPoolService } from '../browser-pool.service';
import { TjrjEjurisAdapter, TERMOS_PADRAO_TJRJ } from '../adapters/tjrj-ejuris.adapter';

@Injectable()
export class TjrjCrawlJob {
  private readonly logger = new Logger(TjrjCrawlJob.name);

  constructor(
    private readonly crawler: CrawlerService,
    private readonly browserPool: BrowserPoolService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Roda toda madrugada (7h UTC / 4h BRT, uma hora depois do TJSP para
   * não disputar sessões da Browserbase ao mesmo tempo). Diferente do
   * TJSP, o e-JURIS não tem filtro por data — a coleta é por termo
   * amplo por área (TERMOS_PADRAO_TJRJ), então o "incremental" real vem
   * do dedupe por hashConteudo no CrawlerService, não de um range de
   * data explícito.
   */
  @Cron('0 7 * * *')
  async executarCrawlDiario(): Promise<void> {
    this.logger.log('Iniciando crawl diario do TJRJ (e-JURIS)');

    try {
      await this.prisma.tribunal.upsert({
        where: { sigla: 'TJRJ' },
        update: {},
        create: { sigla: 'TJRJ', nome: 'Tribunal de Justiça do Rio de Janeiro', instancia: 'TRIBUNAL' },
      });

      const adapter = new TjrjEjurisAdapter(this.browserPool, {
        termos: TERMOS_PADRAO_TJRJ,
        maxPaginasPorTermo: 3,
      });

      this.crawler.registrarAdapter(adapter);
      const resultado = await this.crawler.executarCrawl('TJRJ');
      this.logger.log(`Crawl diario do TJRJ concluido: job ${resultado.jobId}`);
    } catch (err: any) {
      this.logger.error(`Crawl diario do TJRJ falhou: ${err.message}`);
    }
  }
}
