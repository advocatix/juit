import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { CrawlerService } from '../crawler.service';
import { BrowserPoolService } from '../browser-pool.service';
import { TjspCjsgAdapter } from '../adapters/tjsp-cjsg.adapter';

@Injectable()
export class TjspCrawlJob {
  private readonly logger = new Logger(TjspCrawlJob.name);

  constructor(
    private readonly crawler: CrawlerService,
    private readonly browserPool: BrowserPoolService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Roda toda madrugada (5h UTC = 2h em Brasília) coletando o que foi
   * julgado no dia anterior — dá tempo do TJSP publicar as decisões do
   * dia sem concorrer com o horário comercial. Diferente do dou-monitor
   * (que roda 1x/dia às 9h BRT porque só precisa do boletim do dia), o
   * TJSP tem muita coisa por página (20/pagina, milhares por dia), então
   * maxPaginas alto o bastante para não deixar coisa pra tras num dia
   * de volume normal, mas com trava de seguranca.
   *
   * Horário reajustado em 2026-07-19: os crons foram sendo escalonados
   * de 1h em 1h em UTC sem reconferir a conversão pra BRT (Brasil =
   * UTC-3, sem horário de verão) — isso empurrou os últimos tribunais
   * pra dentro do horário comercial brasileiro, o oposto do motivo
   * original deste horário. Agora os 17 crons ficam comprimidos entre
   * 2h e 7h20 BRT, escalonados de 20 em 20 minutos.
   */
  @Cron('0 5 * * *')
  async executarCrawlDiario(): Promise<void> {
    this.logger.log('Iniciando crawl diario do TJSP (CJSG)');

    try {
      await this.prisma.tribunal.upsert({
        where: { sigla: 'TJSP' },
        update: {},
        create: { sigla: 'TJSP', nome: 'Tribunal de Justiça de São Paulo', instancia: 'TRIBUNAL' },
      });

      const hoje = new Date();
      const ontem = new Date(hoje);
      ontem.setDate(ontem.getDate() - 1);

      const adapter = new TjspCjsgAdapter(this.browserPool, {
        dataJulgamentoInicio: ontem,
        dataJulgamentoFim: ontem,
        maxPaginas: 100,
      });

      this.crawler.registrarAdapter(adapter);
      const resultado = await this.crawler.executarCrawl('TJSP');
      this.logger.log(`Crawl diario do TJSP concluido: job ${resultado.jobId}`);
    } catch (err: any) {
      this.logger.error(`Crawl diario do TJSP falhou: ${err.message}`);
    }
  }
}
