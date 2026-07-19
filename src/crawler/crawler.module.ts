import { Module } from '@nestjs/common';
import { CrawlerService } from './crawler.service';
import { CrawlerController } from './crawler.controller';
import { BrowserPoolService } from './browser-pool.service';
import { TjspCrawlJob } from './jobs/tjsp-crawl.job';
import { TjrjCrawlJob } from './jobs/tjrj-crawl.job';
import { TjscCrawlJob } from './jobs/tjsc-crawl.job';
import { TjrsCrawlJob } from './jobs/tjrs-crawl.job';
import { TjbaCrawlJob } from './jobs/tjba-crawl.job';
import { TjdfCrawlJob } from './jobs/tjdf-crawl.job';
import { TjpbCrawlJob } from './jobs/tjpb-crawl.job';
import { TjmtCrawlJob } from './jobs/tjmt-crawl.job';
import { TjceCrawlJob } from './jobs/tjce-crawl.job';
import { TjesCrawlJob } from './jobs/tjes-crawl.job';
import { TjrnCrawlJob } from './jobs/tjrn-crawl.job';
import { TjtoCrawlJob } from './jobs/tjto-crawl.job';
import { TjpiCrawlJob } from './jobs/tjpi-crawl.job';
import { TjalCrawlJob } from './jobs/tjal-crawl.job';
import { TjrrCrawlJob } from './jobs/tjrr-crawl.job';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [
    CrawlerService,
    BrowserPoolService,
    TjspCrawlJob,
    TjrjCrawlJob,
    TjscCrawlJob,
    TjrsCrawlJob,
    TjbaCrawlJob,
    TjdfCrawlJob,
    TjpbCrawlJob,
    TjmtCrawlJob,
    TjceCrawlJob,
    TjesCrawlJob,
    TjrnCrawlJob,
    TjtoCrawlJob,
    TjpiCrawlJob,
    TjalCrawlJob,
    TjrrCrawlJob,
  ],
  controllers: [CrawlerController],
  exports: [CrawlerService],
})
export class CrawlerModule {}
