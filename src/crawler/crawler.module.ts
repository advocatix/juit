import { Module } from '@nestjs/common';
import { CrawlerService } from './crawler.service';
import { CrawlerController } from './crawler.controller';
import { BrowserPoolService } from './browser-pool.service';
import { TjprCrawlJob } from './jobs/tjpr-crawl.job';
import { TjmsCrawlJob } from './jobs/tjms-crawl.job';
import { TjamCrawlJob } from './jobs/tjam-crawl.job';
import { TjroCrawlJob } from './jobs/tjro-crawl.job';
import { CjfCrawlJob } from './jobs/cjf-crawl.job';
import { AuthModule } from '../auth/auth.module';

/**
 * ATENÇÃO: esta é a branch `worker-residencial`, NÃO a `main`. Aqui só
 * registramos os 5 tribunais/fontes que precisam de IP residencial
 * (bloqueados via Browserbase/proxy datacenter, mas funcionam local):
 * TJPR, TJMS, TJAM, TJRO, CJF. Os outros 17 (TJSP, TJRJ, TJSC, TJRS,
 * TJBA, TJDFT, TJPB, TJMT, TJCE, TJES, TJRN, TJTO, TJPI, TJAL, TJRR,
 * TJAC, FALCÃO) continuam rodando só no servidor de produção (branch
 * `main`, via Browserbase) — não duplicar a coleta deles aqui.
 *
 * Esta branch nunca deve ser mergeada de volta pra `main` — é um
 * deploy paralelo, isolado, pensado pra rodar numa máquina com IP
 * residencial de verdade (ver WORKER-README.md).
 */
@Module({
  imports: [AuthModule],
  providers: [CrawlerService, BrowserPoolService, TjprCrawlJob, TjmsCrawlJob, TjamCrawlJob, TjroCrawlJob, CjfCrawlJob],
  controllers: [CrawlerController],
  exports: [CrawlerService],
})
export class CrawlerModule {}
