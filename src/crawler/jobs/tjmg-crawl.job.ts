import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { CrawlerService } from '../crawler.service';
import { BrowserPoolService } from '../browser-pool.service';
import { TjmgEspelhoAdapter, TERMOS_PADRAO_TJMG } from '../adapters/tjmg-espelho.adapter';

@Injectable()
export class TjmgCrawlJob {
  private readonly logger = new Logger(TjmgCrawlJob.name);

  constructor(
    private readonly crawler: CrawlerService,
    private readonly browserPool: BrowserPoolService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Roda toda madrugada (10h40 UTC / 7h40 BRT, depois de TJSP, TJRJ,
   * TJSC, TJRS, TJBA, TJDFT, TJPB, TJMT, TJCE, TJES, TJRN, TJTO, TJPI,
   * TJAL, TJRR, TJAC e FALCÃO). Coleta o que foi julgado "ontem" —
   * diferente dos outros, exige resolver um CAPTCHA de imagem
   * (CapSolver) a cada termo buscado, então é mais lento e caro que os
   * demais (ainda assim, centavos por execução).
   */
  @Cron('40 10 * * *')
  async executarCrawlDiario(): Promise<void> {
    this.logger.log('Iniciando crawl diario do TJMG (Espelho de Acordao)');

    try {
      await this.prisma.tribunal.upsert({
        where: { sigla: 'TJMG' },
        update: {},
        create: { sigla: 'TJMG', nome: 'Tribunal de Justiça de Minas Gerais', instancia: 'TRIBUNAL' },
      });

      const hoje = new Date();
      const ontem = new Date(hoje);
      ontem.setDate(ontem.getDate() - 1);

      const adapter = new TjmgEspelhoAdapter(this.browserPool, this.configService, {
        termos: TERMOS_PADRAO_TJMG,
        dataJulgamentoInicio: ontem,
        dataJulgamentoFim: ontem,
        maxPaginas: 5,
      });

      this.crawler.registrarAdapter(adapter);
      const resultado = await this.crawler.executarCrawl('TJMG');
      this.logger.log(`Crawl diario do TJMG concluido: job ${resultado.jobId}`);
    } catch (err: any) {
      this.logger.error(`Crawl diario do TJMG falhou: ${err.message}`);
    }
  }
}
