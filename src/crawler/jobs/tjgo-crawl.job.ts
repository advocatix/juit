import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { CrawlerService } from '../crawler.service';
import { BrowserPoolService } from '../browser-pool.service';
import { TjgoProjudiAdapter, TERMOS_PADRAO_TJGO } from '../adapters/tjgo-projudi.adapter';

@Injectable()
export class TjgoCrawlJob {
  private readonly logger = new Logger(TjgoCrawlJob.name);

  constructor(
    private readonly crawler: CrawlerService,
    private readonly browserPool: BrowserPoolService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Roda toda madrugada (11h40 UTC / 8h40 BRT, depois do TJPE às
   * 11h20 UTC). Resolve Cloudflare Turnstile via CapSolver — token às
   * vezes rejeitado de forma intermitente nesse site especificamente,
   * adapter já tem retry de 3 tentativas embutido (ver
   * tjgo-projudi.adapter.ts). maxPaginas alto (15) porque a ordenação
   * padrão mistura sentenças de 1º grau (descartadas, sem "Ementa:")
   * com acórdãos de verdade.
   */
  @Cron('40 11 * * *')
  async executarCrawlDiario(): Promise<void> {
    this.logger.log('Iniciando crawl diario do TJGO');

    try {
      await this.prisma.tribunal.upsert({
        where: { sigla: 'TJGO' },
        update: {},
        create: { sigla: 'TJGO', nome: 'Tribunal de Justiça de Goiás', instancia: 'TRIBUNAL' },
      });

      const adapter = new TjgoProjudiAdapter(this.browserPool, this.configService, {
        termos: TERMOS_PADRAO_TJGO,
        maxPaginas: 15,
      });

      this.crawler.registrarAdapter(adapter);
      const resultado = await this.crawler.executarCrawl('TJGO');
      this.logger.log(`Crawl diario do TJGO concluido: job ${resultado.jobId}`);
    } catch (err: any) {
      this.logger.error(`Crawl diario do TJGO falhou: ${err.message}`);
    }
  }
}
