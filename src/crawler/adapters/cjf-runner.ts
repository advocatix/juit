import { Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { BrowserPoolService } from '../browser-pool.service';
import { CjfUnificadaAdapter, CjfUnificadaConfig } from './cjf-unificada.adapter';
import { TRIBUNAIS_CJF } from './cjf-tribunais';

const logger = new Logger('CjfRunner');

/**
 * Lógica de execução compartilhada entre a rota manual (`/cjf/executar`)
 * e o cron diário (`cjf-crawl.job.ts`) — mesmo padrão do
 * falcao-runner.ts (multi-tribunal, não usa
 * `CrawlerService.executarCrawl()` genérico).
 */
export async function executarCjfCrawl(
  prisma: PrismaService,
  browserPool: BrowserPoolService,
  config: CjfUnificadaConfig,
): Promise<{ jobId: string }> {
  const tribunalJob = await prisma.tribunal.upsert({
    where: { sigla: 'CJF' },
    update: {},
    create: {
      sigla: 'CJF',
      nome: 'Jurisprudência Unificada do CJF (STF/STJ/TNU/TRFs)',
      instancia: 'NACIONAL',
    },
  });

  const job = await prisma.crawlJob.create({
    data: { tribunalId: tribunalJob.id, status: 'RODANDO', iniciadoEm: new Date() },
  });

  const adapter = new CjfUnificadaAdapter(browserPool, config);

  let coletados = 0;
  let novos = 0;
  const tribunaisCache = new Map<string, string>();

  try {
    for await (const item of adapter.coletar()) {
      coletados++;

      const siglaReal = item.tribunalSigla;
      if (!siglaReal || !TRIBUNAIS_CJF[siglaReal]) continue;

      let tribunalId = tribunaisCache.get(siglaReal);
      if (!tribunalId) {
        const info = TRIBUNAIS_CJF[siglaReal];
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
          fonte: 'CJF',
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
    logger.error(`Crawl do CJF falhou: ${err.message}`);
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
