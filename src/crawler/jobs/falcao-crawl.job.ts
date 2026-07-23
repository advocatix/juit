import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { TERMOS_PADRAO_FALCAO } from '../adapters/falcao-nacional.adapter';
import { executarFalcaoCrawl } from '../adapters/falcao-runner';

@Injectable()
export class FalcaoCrawlJob {
  private readonly logger = new Logger(FalcaoCrawlJob.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Roda toda madrugada (10h20 UTC / 7h20 BRT, depois de todos os
   * tribunais estaduais — último era TJAC às 10h UTC). HTTP puro via
   * axios (ver falcao-nacional.adapter.ts) — busca por termo amplo, um
   * por área do direito. Não usa CrawlerService.executarCrawl genérico
   * (ver falcao-runner.ts): grava direto, upsertando o Tribunal real
   * por item (TST/TRT1..24/CSJT).
   */
  @Cron('20 10 * * *')
  async executarCrawlDiario(): Promise<void> {
    this.logger.log('Iniciando crawl diario do FALCAO (Justica do Trabalho nacional)');

    try {
      const resultado = await executarFalcaoCrawl(this.prisma, {
        termos: TERMOS_PADRAO_FALCAO,
        maxPaginasPorTermo: 5,
      });
      this.logger.log(`Crawl diario do FALCAO concluido: job ${resultado.jobId}`);
    } catch (err: any) {
      this.logger.error(`Crawl diario do FALCAO falhou: ${err.message}`);
    }
  }
}
