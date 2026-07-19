import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { CrawlerService } from '../crawler.service';
import { BrowserPoolService } from '../browser-pool.service';
import { TjamCjsgAdapter } from '../adapters/tjam-cjsg.adapter';

@Injectable()
export class TjamCrawlJob {
  private readonly logger = new Logger(TjamCrawlJob.name);

  constructor(
    private readonly crawler: CrawlerService,
    private readonly browserPool: BrowserPoolService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Roda toda madrugada (2h40 BRT). Este job só existe na branch
   * `worker-residencial` — o TJAM funciona igual local e via
   * Browserbase (zero resultados sem erro nos dois), então rodar aqui
   * não resolve o comportamento estranho do site, só elimina a
   * variável de infraestrutura como suspeita (ver memória do projeto).
   */
  @Cron('40 2 * * *')
  async executarCrawlDiario(): Promise<void> {
    this.logger.log('Iniciando crawl diario do TJAM (worker residencial)');

    try {
      await this.prisma.tribunal.upsert({
        where: { sigla: 'TJAM' },
        update: {},
        create: { sigla: 'TJAM', nome: 'Tribunal de Justiça do Amazonas', instancia: 'TRIBUNAL' },
      });

      const hoje = new Date();
      const ontem = new Date(hoje);
      ontem.setDate(ontem.getDate() - 1);

      const adapter = new TjamCjsgAdapter(this.browserPool, {
        dataJulgamentoInicio: ontem,
        dataJulgamentoFim: hoje,
        maxPaginas: 5,
      });

      this.crawler.registrarAdapter(adapter);
      const resultado = await this.crawler.executarCrawl('TJAM');
      this.logger.log(`Crawl diario do TJAM concluido: job ${resultado.jobId}`);
    } catch (err: any) {
      this.logger.error(`Crawl diario do TJAM falhou: ${err.message}`);
    }
  }
}
