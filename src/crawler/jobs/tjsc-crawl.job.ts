import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { CrawlerService } from '../crawler.service';
import { TjscBuscaAdapter, TERMOS_PADRAO_TJSC } from '../adapters/tjsc-busca.adapter';

@Injectable()
export class TjscCrawlJob {
  private readonly logger = new Logger(TjscCrawlJob.name);

  constructor(
    private readonly crawler: CrawlerService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Roda toda madrugada (8h UTC / 5h BRT, depois de TJSP e TJRJ). Não
   * precisa de BrowserPoolService — o TJSC é o único tribunal que
   * responde a requisição HTTP pura, então não disputa sessões da
   * Browserbase com os outros crons.
   */
  @Cron('0 8 * * *')
  async executarCrawlDiario(): Promise<void> {
    this.logger.log('Iniciando crawl diario do TJSC (busca.tjsc.jus.br)');

    try {
      await this.prisma.tribunal.upsert({
        where: { sigla: 'TJSC' },
        update: {},
        create: { sigla: 'TJSC', nome: 'Tribunal de Justiça de Santa Catarina', instancia: 'TRIBUNAL' },
      });

      const adapter = new TjscBuscaAdapter({
        termos: TERMOS_PADRAO_TJSC,
        maxPaginasPorTermo: 3,
      });

      this.crawler.registrarAdapter(adapter);
      const resultado = await this.crawler.executarCrawl('TJSC');
      this.logger.log(`Crawl diario do TJSC concluido: job ${resultado.jobId}`);
    } catch (err: any) {
      this.logger.error(`Crawl diario do TJSC falhou: ${err.message}`);
    }
  }
}
