import { Module } from '@nestjs/common';
import { CrawlerService } from './crawler.service';
import { CrawlerController } from './crawler.controller';
import { BrowserPoolService } from './browser-pool.service';
import { TjspCrawlJob } from './jobs/tjsp-crawl.job';
import { TjrjCrawlJob } from './jobs/tjrj-crawl.job';
import { TjscCrawlJob } from './jobs/tjsc-crawl.job';
import { TjrsCrawlJob } from './jobs/tjrs-crawl.job';
import { TjbaCrawlJob } from './jobs/tjba-crawl.job';
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
  ],
  controllers: [CrawlerController],
  exports: [CrawlerService],
})
export class CrawlerModule {}
