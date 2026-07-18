import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Esqueleto do crawler. Cada tribunal/fonte vira um "adapter" próprio
 * (padrão parecido com apps/api/src/jarvis/adapters) que sabe buscar e
 * normalizar os precedentes daquela fonte específica. Nenhum adapter real
 * foi implementado ainda — isso depende de definirmos primeiro quais
 * tribunais/fontes entram no escopo inicial.
 */
export interface CrawlerAdapter {
  tribunalSigla: string;
  coletar(): AsyncGenerator<{
    numeroProcesso?: string;
    orgaoJulgador?: string;
    relator?: string;
    dataJulgamento?: Date;
    area?: string;
    tese?: string;
    ementa?: string;
    textoIntegral?: string;
    urlOrigem?: string;
  }>;
}

@Injectable()
export class CrawlerService {
  private readonly logger = new Logger(CrawlerService.name);
  private readonly adapters: CrawlerAdapter[] = [];

  constructor(private readonly prisma: PrismaService) {}

  /** Substitui o adapter registrado para o mesmo tribunal, se já houver um
   *  (permite reconfigurar o período de busca a cada chamada). */
  registrarAdapter(adapter: CrawlerAdapter) {
    const idx = this.adapters.findIndex((a) => a.tribunalSigla === adapter.tribunalSigla);
    if (idx >= 0) this.adapters[idx] = adapter;
    else this.adapters.push(adapter);
  }

  async executarCrawl(tribunalSigla: string): Promise<{ jobId: string }> {
    const tribunal = await this.prisma.tribunal.findUnique({ where: { sigla: tribunalSigla } });
    if (!tribunal) {
      throw new Error(`Tribunal ${tribunalSigla} não cadastrado`);
    }

    const job = await this.prisma.crawlJob.create({
      data: { tribunalId: tribunal.id, status: 'RODANDO', iniciadoEm: new Date() },
    });

    const adapter = this.adapters.find((a) => a.tribunalSigla === tribunalSigla);
    if (!adapter) {
      await this.prisma.crawlJob.update({
        where: { id: job.id },
        data: { status: 'FALHOU', erro: 'Adapter não implementado', concluidoEm: new Date() },
      });
      return { jobId: job.id };
    }

    let coletados = 0;
    let novos = 0;

    try {
      for await (const item of adapter.coletar()) {
        coletados++;
        const hashConteudo = this.hashDe(item.textoIntegral ?? item.ementa ?? item.numeroProcesso ?? '');
        const existente = await this.prisma.precedente.findUnique({ where: { hashConteudo } });
        if (existente) continue;

        await this.prisma.precedente.create({
          data: {
            tribunalId: tribunal.id,
            fonte: tribunalSigla,
            hashConteudo,
            ...item,
          },
        });
        novos++;
      }

      await this.prisma.crawlJob.update({
        where: { id: job.id },
        data: {
          status: 'CONCLUIDO',
          concluidoEm: new Date(),
          itensColetados: coletados,
          itensNovos: novos,
        },
      });
    } catch (err: any) {
      this.logger.error(`Crawl de ${tribunalSigla} falhou: ${err.message}`);
      await this.prisma.crawlJob.update({
        where: { id: job.id },
        data: { status: 'FALHOU', erro: err.message, concluidoEm: new Date(), itensColetados: coletados, itensNovos: novos },
      });
    }

    return { jobId: job.id };
  }

  private hashDe(texto: string): string {
    return createHash('sha256').update(texto).digest('hex');
  }
}
