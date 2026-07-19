import { Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { BrowserPoolService } from '../browser-pool.service';
import { FalcaoNacionalAdapter, FalcaoNacionalConfig } from './falcao-nacional.adapter';
import { TRIBUNAIS_FALCAO } from './falcao-tribunais';

const logger = new Logger('FalcaoRunner');

/**
 * Lógica de execução compartilhada entre a rota manual
 * (`/falcao/executar`) e o cron diário (`falcao-crawl.job.ts`) — extraída
 * pra não duplicar a gravação multi-tribunal em dois lugares. Ver
 * falcao-nacional.adapter.ts para o motivo de não usar
 * `CrawlerService.executarCrawl()` genérico aqui.
 */
export async function executarFalcaoCrawl(
  prisma: PrismaService,
  browserPool: BrowserPoolService,
  config: FalcaoNacionalConfig,
): Promise<{ jobId: string }> {
  const tribunalJob = await prisma.tribunal.upsert({
    where: { sigla: 'FALCAO' },
    update: {},
    create: {
      sigla: 'FALCAO',
      nome: 'FALCÃO — Repositório Nacional de Jurisprudência da Justiça do Trabalho',
      instancia: 'NACIONAL',
    },
  });

  const job = await prisma.crawlJob.create({
    data: { tribunalId: tribunalJob.id, status: 'RODANDO', iniciadoEm: new Date() },
  });

  const adapter = new FalcaoNacionalAdapter(browserPool, config);

  let coletados = 0;
  let novos = 0;
  const tribunaisCache = new Map<string, string>();

  try {
    for await (const item of adapter.coletar()) {
      coletados++;

      const siglaReal = item.tribunalSigla;
      if (!siglaReal || !TRIBUNAIS_FALCAO[siglaReal]) continue;

      let tribunalId = tribunaisCache.get(siglaReal);
      if (!tribunalId) {
        const info = TRIBUNAIS_FALCAO[siglaReal];
        const tribunalReal = await prisma.tribunal.upsert({
          where: { sigla: siglaReal },
          update: {},
          create: { sigla: siglaReal, nome: info.nome, instancia: info.instancia },
        });
        tribunalId = tribunalReal.id;
        tribunaisCache.set(siglaReal, tribunalId);
      }

      const hashConteudo = createHash('sha256')
        .update(item.ementa ?? item.numeroProcesso ?? '')
        .digest('hex');

      const existente = await prisma.precedente.findUnique({ where: { hashConteudo } });
      if (existente) continue;

      await prisma.precedente.create({
        data: {
          tribunalId,
          fonte: 'FALCAO',
          hashConteudo,
          numeroProcesso: item.numeroProcesso,
          orgaoJulgador: item.orgaoJulgador,
          relator: item.relator,
          dataJulgamento: item.dataJulgamento,
          area: item.area,
          ementa: item.ementa,
        },
      });
      novos++;
    }

    await prisma.crawlJob.update({
      where: { id: job.id },
      data: { status: 'CONCLUIDO', concluidoEm: new Date(), itensColetados: coletados, itensNovos: novos },
    });
  } catch (err: any) {
    logger.error(`Crawl do FALCAO falhou: ${err.message}`);
    await prisma.crawlJob.update({
      where: { id: job.id },
      data: {
        status: 'FALHOU',
        erro: err.message,
        concluidoEm: new Date(),
        itensColetados: coletados,
        itensNovos: novos,
      },
    });
  }

  return { jobId: job.id };
}
