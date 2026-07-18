import { Module } from '@nestjs/common';
import { CrawlerService } from './crawler.service';
import { CrawlerController } from './crawler.controller';
import { BrowserPoolService } from './browser-pool.service';
import { TjspCrawlJob } from './jobs/tjsp-crawl.job';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [CrawlerService, BrowserPoolService, TjspCrawlJob],
  controllers: [CrawlerController],
  exports: [CrawlerService],
})
export class CrawlerModule {}
