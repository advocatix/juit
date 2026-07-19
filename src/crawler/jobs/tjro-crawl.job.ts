import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { CrawlerService } from '../crawler.service';
import { BrowserPoolService } from '../browser-pool.service';
import { TjroElasticAdapter, TERMOS_PADRAO_TJRO } from '../adapters/tjro-elastic.adapter';

@Injectable()
export class TjroCrawlJob {
  private readonly logger = new Logger(TjroCrawlJob.name);

  constructor(
    private readonly crawler: CrawlerService,
    private readonly browserPool: BrowserPoolService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Roda toda madrugada (3h BRT). Este job só existe na branch
   * `worker-residencial` — o TJRO exige browser real pro desafio F5
   * TSPD, que limpa em ~6s local mas nunca limpou via Browserbase (ver
   * memória do projeto). Também confirmado bloqueado por política em
   * provedores de proxy residencial (Bright Data recusa "government").
   */
  @Cron('0 3 * * *')
  async executarCrawlDiario(): Promise<void> {
    this.logger.log('Iniciando crawl diario do TJRO (worker residencial)');

    try {
      await this.prisma.tribunal.upsert({
        where: { sigla: 'TJRO' },
        update: {},
        create: { sigla: 'TJRO', nome: 'Tribunal de Justiça de Rondônia', instancia: 'TRIBUNAL' },
      });

      const adapter = new TjroElasticAdapter(this.browserPool, {
        termos: TERMOS_PADRAO_TJRO,
        maxPaginasPorTermo: 2,
      });

      this.crawler.registrarAdapter(adapter);
      const resultado = await this.crawler.executarCrawl('TJRO');
      this.logger.log(`Crawl diario do TJRO concluido: job ${resultado.jobId}`);
    } catch (err: any) {
      this.logger.error(`Crawl diario do TJRO falhou: ${err.message}`);
    }
  }
}
