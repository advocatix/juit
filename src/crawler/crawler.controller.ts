import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { PrismaService } from '../prisma/prisma.service';
import { CrawlerService } from './crawler.service';
import { BrowserPoolService } from './browser-pool.service';
import { TjspCjsgAdapter } from './adapters/tjsp-cjsg.adapter';
import { StjSconAdapter, TERMOS_PADRAO_STJ } from './adapters/stj-scon.adapter';
import { TjrjEjurisAdapter, TERMOS_PADRAO_TJRJ } from './adapters/tjrj-ejuris.adapter';
import { ExecutarCrawlTjspDto } from './dto/executar-crawl-tjsp.dto';
import { ExecutarCrawlStjDto } from './dto/executar-crawl-stj.dto';
import { ExecutarCrawlTjrjDto } from './dto/executar-crawl-tjrj.dto';

@Controller('crawler')
@UseGuards(ApiKeyGuard)
export class CrawlerController {
  constructor(
    private readonly crawler: CrawlerService,
    private readonly browserPool: BrowserPoolService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Dispara um crawl manual do TJSP para um período de julgamento.
   * Endpoint pensado para validar o adapter em dev/staging antes de
   * existir um agendamento automático (@Cron ainda não implementado —
   * escopo/frequência de coleta contínua é decisão separada).
   */
  @Post('tjsp/executar')
  async executarTjsp(@Body() dto: ExecutarCrawlTjspDto) {
    await this.prisma.tribunal.upsert({
      where: { sigla: 'TJSP' },
      update: {},
      create: { sigla: 'TJSP', nome: 'Tribunal de Justiça de São Paulo', instancia: 'TRIBUNAL' },
    });

    const hoje = new Date();
    const ontem = new Date(hoje);
    ontem.setDate(ontem.getDate() - 1);

    const adapter = new TjspCjsgAdapter(this.browserPool, {
      dataJulgamentoInicio: dto.dataInicio ? parseDataBr(dto.dataInicio) : ontem,
      dataJulgamentoFim: dto.dataFim ? parseDataBr(dto.dataFim) : hoje,
      maxPaginas: dto.maxPaginas ?? 3,
    });

    this.crawler.registrarAdapter(adapter);
    return this.crawler.executarCrawl('TJSP');
  }

  /**
   * Dispara um crawl manual do STJ. Diferente do TJSP, o SCON não aceita
   * busca só por período — exige um critério de texto (ver
   * stj-scon.adapter.ts) — então a coleta é por termo amplo, um por área
   * do direito, não por data.
   */
  @Post('stj/executar')
  async executarStj(@Body() dto: ExecutarCrawlStjDto) {
    await this.prisma.tribunal.upsert({
      where: { sigla: 'STJ' },
      update: {},
      create: { sigla: 'STJ', nome: 'Superior Tribunal de Justiça', instancia: 'SUPERIOR' },
    });

    const adapter = new StjSconAdapter(this.browserPool, {
      termos: dto.termos ?? TERMOS_PADRAO_STJ,
      maxPaginasPorTermo: dto.maxPaginasPorTermo ?? 2,
    });

    this.crawler.registrarAdapter(adapter);
    return this.crawler.executarCrawl('STJ');
  }

  /**
   * Dispara um crawl manual do TJRJ. Assim como o STJ, a busca é por
   * termo livre (não achamos filtro só por data no e-JURIS ainda).
   */
  @Post('tjrj/executar')
  async executarTjrj(@Body() dto: ExecutarCrawlTjrjDto) {
    await this.prisma.tribunal.upsert({
      where: { sigla: 'TJRJ' },
      update: {},
      create: { sigla: 'TJRJ', nome: 'Tribunal de Justiça do Rio de Janeiro', instancia: 'TRIBUNAL' },
    });

    const adapter = new TjrjEjurisAdapter(this.browserPool, {
      termos: dto.termos ?? TERMOS_PADRAO_TJRJ,
      maxPaginasPorTermo: dto.maxPaginasPorTermo ?? 2,
    });

    this.crawler.registrarAdapter(adapter);
    return this.crawler.executarCrawl('TJRJ');
  }
}

function parseDataBr(data: string): Date {
  const [dd, mm, yyyy] = data.split('/').map(Number);
  return new Date(yyyy, mm - 1, dd);
}
