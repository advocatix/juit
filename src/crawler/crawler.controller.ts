import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { PrismaService } from '../prisma/prisma.service';
import { CrawlerService } from './crawler.service';
import { BrowserPoolService } from './browser-pool.service';
import { TjspCjsgAdapter } from './adapters/tjsp-cjsg.adapter';
import { StjSconAdapter, TERMOS_PADRAO_STJ } from './adapters/stj-scon.adapter';
import { TjrjEjurisAdapter, TERMOS_PADRAO_TJRJ } from './adapters/tjrj-ejuris.adapter';
import { TjscBuscaAdapter, TERMOS_PADRAO_TJSC } from './adapters/tjsc-busca.adapter';
import { TjrsSolrAdapter, TERMOS_PADRAO_TJRS } from './adapters/tjrs-solr.adapter';
import { TjbaGraphqlAdapter, TERMOS_PADRAO_TJBA } from './adapters/tjba-graphql.adapter';
import { TjdfJurisdfAdapter, TERMOS_PADRAO_TJDF } from './adapters/tjdf-jurisdf.adapter';
import { TjpbJurispbAdapter, TERMOS_PADRAO_TJPB } from './adapters/tjpb-jurispb.adapter';
import { TjmtHellsgateAdapter, TERMOS_PADRAO_TJMT } from './adapters/tjmt-hellsgate.adapter';
import { TjceSjurisAdapter, TERMOS_PADRAO_TJCE } from './adapters/tjce-sjuris.adapter';
import { TjesSolrAdapter, TERMOS_PADRAO_TJES } from './adapters/tjes-solr.adapter';
import { TjrnElasticAdapter, TERMOS_PADRAO_TJRN } from './adapters/tjrn-elastic.adapter';
import { TjtoConsultaAdapter, TERMOS_PADRAO_TJTO } from './adapters/tjto-consulta.adapter';
import { TjpiConsultaAdapter, TERMOS_PADRAO_TJPI } from './adapters/tjpi-consulta.adapter';
import { TjalCjsgAdapter } from './adapters/tjal-cjsg.adapter';
import { TjrrJurisAdapter, TERMOS_PADRAO_TJRR } from './adapters/tjrr-juris.adapter';
import { ExecutarCrawlTjspDto } from './dto/executar-crawl-tjsp.dto';
import { ExecutarCrawlStjDto } from './dto/executar-crawl-stj.dto';
import { ExecutarCrawlTjrjDto } from './dto/executar-crawl-tjrj.dto';
import { ExecutarCrawlTjscDto } from './dto/executar-crawl-tjsc.dto';
import { ExecutarCrawlTjrsDto } from './dto/executar-crawl-tjrs.dto';
import { ExecutarCrawlTjbaDto } from './dto/executar-crawl-tjba.dto';
import { ExecutarCrawlTjdfDto } from './dto/executar-crawl-tjdf.dto';
import { ExecutarCrawlTjpbDto } from './dto/executar-crawl-tjpb.dto';
import { ExecutarCrawlTjmtDto } from './dto/executar-crawl-tjmt.dto';
import { ExecutarCrawlTjceDto } from './dto/executar-crawl-tjce.dto';
import { ExecutarCrawlTjesDto } from './dto/executar-crawl-tjes.dto';
import { ExecutarCrawlTjrnDto } from './dto/executar-crawl-tjrn.dto';
import { ExecutarCrawlTjtoDto } from './dto/executar-crawl-tjto.dto';
import { ExecutarCrawlTjpiDto } from './dto/executar-crawl-tjpi.dto';
import { ExecutarCrawlTjalDto } from './dto/executar-crawl-tjal.dto';
import { ExecutarCrawlTjrrDto } from './dto/executar-crawl-tjrr.dto';

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

  /**
   * Dispara um crawl manual do TJSC. Único tribunal sem CAPTCHA nem
   * exigência de browser — roda via HTTP puro, muito mais barato. Tem um
   * WAF por IP em vez disso (ver tjsc-busca.adapter.ts).
   */
  @Post('tjsc/executar')
  async executarTjsc(@Body() dto: ExecutarCrawlTjscDto) {
    await this.prisma.tribunal.upsert({
      where: { sigla: 'TJSC' },
      update: {},
      create: { sigla: 'TJSC', nome: 'Tribunal de Justiça de Santa Catarina', instancia: 'TRIBUNAL' },
    });

    const adapter = new TjscBuscaAdapter({
      termos: dto.termos ?? TERMOS_PADRAO_TJSC,
      maxPaginasPorTermo: dto.maxPaginasPorTermo ?? 2,
    });

    this.crawler.registrarAdapter(adapter);
    return this.crawler.executarCrawl('TJSC');
  }

  /**
   * Dispara um crawl manual do TJRS. Backend Solr nativo (JSON puro),
   * sem CAPTCHA, sem exigência de browser.
   */
  @Post('tjrs/executar')
  async executarTjrs(@Body() dto: ExecutarCrawlTjrsDto) {
    await this.prisma.tribunal.upsert({
      where: { sigla: 'TJRS' },
      update: {},
      create: { sigla: 'TJRS', nome: 'Tribunal de Justiça do Rio Grande do Sul', instancia: 'TRIBUNAL' },
    });

    const adapter = new TjrsSolrAdapter({
      termos: dto.termos ?? TERMOS_PADRAO_TJRS,
      maxPaginasPorTermo: dto.maxPaginasPorTermo ?? 2,
    });

    this.crawler.registrarAdapter(adapter);
    return this.crawler.executarCrawl('TJRS');
  }

  /**
   * Dispara um crawl manual do TJBA. GraphQL nativo, sem CAPTCHA, sem
   * exigência de browser — melhor estruturado que o TJRS.
   */
  @Post('tjba/executar')
  async executarTjba(@Body() dto: ExecutarCrawlTjbaDto) {
    await this.prisma.tribunal.upsert({
      where: { sigla: 'TJBA' },
      update: {},
      create: { sigla: 'TJBA', nome: 'Tribunal de Justiça da Bahia', instancia: 'TRIBUNAL' },
    });

    const adapter = new TjbaGraphqlAdapter({
      termos: dto.termos ?? TERMOS_PADRAO_TJBA,
      maxPaginasPorTermo: dto.maxPaginasPorTermo ?? 2,
    });

    this.crawler.registrarAdapter(adapter);
    return this.crawler.executarCrawl('TJBA');
  }

  /**
   * Dispara um crawl manual do TJDFT. API REST nativa (JurisDF), sem
   * CAPTCHA, sem exigência de browser.
   */
  @Post('tjdf/executar')
  async executarTjdf(@Body() dto: ExecutarCrawlTjdfDto) {
    await this.prisma.tribunal.upsert({
      where: { sigla: 'TJDFT' },
      update: {},
      create: { sigla: 'TJDFT', nome: 'Tribunal de Justiça do Distrito Federal e dos Territórios', instancia: 'TRIBUNAL' },
    });

    const adapter = new TjdfJurisdfAdapter({
      termos: dto.termos ?? TERMOS_PADRAO_TJDF,
      maxPaginasPorTermo: dto.maxPaginasPorTermo ?? 2,
    });

    this.crawler.registrarAdapter(adapter);
    return this.crawler.executarCrawl('TJDFT');
  }

  /**
   * Dispara um crawl manual do TJPB. API REST nativa (JurisPB), sem
   * CAPTCHA, sem exigência de browser. Filtra segundo grau (ementa vem
   * nula em sentenças de primeiro grau).
   */
  @Post('tjpb/executar')
  async executarTjpb(@Body() dto: ExecutarCrawlTjpbDto) {
    await this.prisma.tribunal.upsert({
      where: { sigla: 'TJPB' },
      update: {},
      create: { sigla: 'TJPB', nome: 'Tribunal de Justiça da Paraíba', instancia: 'TRIBUNAL' },
    });

    const adapter = new TjpbJurispbAdapter({
      termos: dto.termos ?? TERMOS_PADRAO_TJPB,
      maxPaginasPorTermo: dto.maxPaginasPorTermo ?? 2,
    });

    this.crawler.registrarAdapter(adapter);
    return this.crawler.executarCrawl('TJPB');
  }

  /**
   * Dispara um crawl manual do TJMT. API REST nativa, sem CAPTCHA, sem
   * exigência de browser — só um header `token` fixo do frontend.
   */
  @Post('tjmt/executar')
  async executarTjmt(@Body() dto: ExecutarCrawlTjmtDto) {
    await this.prisma.tribunal.upsert({
      where: { sigla: 'TJMT' },
      update: {},
      create: { sigla: 'TJMT', nome: 'Tribunal de Justiça de Mato Grosso', instancia: 'TRIBUNAL' },
    });

    const adapter = new TjmtHellsgateAdapter({
      termos: dto.termos ?? TERMOS_PADRAO_TJMT,
      maxPaginasPorTermo: dto.maxPaginasPorTermo ?? 2,
    });

    this.crawler.registrarAdapter(adapter);
    return this.crawler.executarCrawl('TJMT');
  }

  /**
   * Dispara um crawl manual do TJCE. SJURIS, API REST nativa (sistema
   * novo lançado out/2023), sem CAPTCHA, sem exigência de browser.
   */
  @Post('tjce/executar')
  async executarTjce(@Body() dto: ExecutarCrawlTjceDto) {
    await this.prisma.tribunal.upsert({
      where: { sigla: 'TJCE' },
      update: {},
      create: { sigla: 'TJCE', nome: 'Tribunal de Justiça do Ceará', instancia: 'TRIBUNAL' },
    });

    const adapter = new TjceSjurisAdapter({
      termos: dto.termos ?? TERMOS_PADRAO_TJCE,
      maxPaginasPorTermo: dto.maxPaginasPorTermo ?? 2,
    });

    this.crawler.registrarAdapter(adapter);
    return this.crawler.executarCrawl('TJCE');
  }

  /**
   * Dispara um crawl manual do TJES. API REST própria sobre Solr, sem
   * CAPTCHA, sem exigência de browser. Usa o core `pje2g` (2º grau).
   */
  @Post('tjes/executar')
  async executarTjes(@Body() dto: ExecutarCrawlTjesDto) {
    await this.prisma.tribunal.upsert({
      where: { sigla: 'TJES' },
      update: {},
      create: { sigla: 'TJES', nome: 'Tribunal de Justiça do Espírito Santo', instancia: 'TRIBUNAL' },
    });

    const adapter = new TjesSolrAdapter({
      termos: dto.termos ?? TERMOS_PADRAO_TJES,
      maxPaginasPorTermo: dto.maxPaginasPorTermo ?? 2,
    });

    this.crawler.registrarAdapter(adapter);
    return this.crawler.executarCrawl('TJES');
  }

  /**
   * Dispara um crawl manual do TJRN. Elasticsearch nativo por trás de
   * API própria. Sem CAPTCHA de verdade — o 403 inicial era só falta
   * dos headers Referer/X-Requested-With (ver tjrn-elastic.parser.ts).
   */
  @Post('tjrn/executar')
  async executarTjrn(@Body() dto: ExecutarCrawlTjrnDto) {
    await this.prisma.tribunal.upsert({
      where: { sigla: 'TJRN' },
      update: {},
      create: { sigla: 'TJRN', nome: 'Tribunal de Justiça do Rio Grande do Norte', instancia: 'TRIBUNAL' },
    });

    const adapter = new TjrnElasticAdapter({
      termos: dto.termos ?? TERMOS_PADRAO_TJRN,
      maxPaginasPorTermo: dto.maxPaginasPorTermo ?? 2,
    });

    this.crawler.registrarAdapter(adapter);
    return this.crawler.executarCrawl('TJRN');
  }

  /**
   * Dispara um crawl manual do TJTO. Portal "Jurisprudência 4.0"
   * (`consulta.php`), HTML renderizado server-side, sem CAPTCHA, sem
   * exigência de browser. Paginação só funciona via POST.
   */
  @Post('tjto/executar')
  async executarTjto(@Body() dto: ExecutarCrawlTjtoDto) {
    await this.prisma.tribunal.upsert({
      where: { sigla: 'TJTO' },
      update: {},
      create: { sigla: 'TJTO', nome: 'Tribunal de Justiça do Tocantins', instancia: 'TRIBUNAL' },
    });

    const adapter = new TjtoConsultaAdapter({
      termos: dto.termos ?? TERMOS_PADRAO_TJTO,
      maxPaginasPorTermo: dto.maxPaginasPorTermo ?? 2,
    });

    this.crawler.registrarAdapter(adapter);
    return this.crawler.executarCrawl('TJTO');
  }

  /**
   * Dispara um crawl manual do TJPI. JusPI (`jurisprudences/search`),
   * HTML renderizado server-side, sem CAPTCHA, sem exigência de
   * browser. Filtra `tipo=Acórdão` (exclui Decisões Terminativas e
   * Súmulas).
   */
  @Post('tjpi/executar')
  async executarTjpi(@Body() dto: ExecutarCrawlTjpiDto) {
    await this.prisma.tribunal.upsert({
      where: { sigla: 'TJPI' },
      update: {},
      create: { sigla: 'TJPI', nome: 'Tribunal de Justiça do Piauí', instancia: 'TRIBUNAL' },
    });

    const adapter = new TjpiConsultaAdapter({
      termos: dto.termos ?? TERMOS_PADRAO_TJPI,
      maxPaginasPorTermo: dto.maxPaginasPorTermo ?? 2,
    });

    this.crawler.registrarAdapter(adapter);
    return this.crawler.executarCrawl('TJPI');
  }

  /**
   * Dispara um crawl manual do TJAL. Mesmo e-SAJ do TJSP/TJMS/TJAM
   * (mesma estrutura de HTML, mesmo parser) — busca por período de
   * julgamento. Diferente do TJMS/TJAM, funciona normalmente via
   * Browserbase (confirmado ao vivo).
   */
  @Post('tjal/executar')
  async executarTjal(@Body() dto: ExecutarCrawlTjalDto) {
    await this.prisma.tribunal.upsert({
      where: { sigla: 'TJAL' },
      update: {},
      create: { sigla: 'TJAL', nome: 'Tribunal de Justiça de Alagoas', instancia: 'TRIBUNAL' },
    });

    const hoje = new Date();
    const ontem = new Date(hoje);
    ontem.setDate(ontem.getDate() - 1);

    const adapter = new TjalCjsgAdapter(this.browserPool, {
      dataJulgamentoInicio: dto.dataInicio ? parseDataBr(dto.dataInicio) : ontem,
      dataJulgamentoFim: dto.dataFim ? parseDataBr(dto.dataFim) : hoje,
      maxPaginas: dto.maxPaginas ?? 3,
    });

    this.crawler.registrarAdapter(adapter);
    return this.crawler.executarCrawl('TJAL');
  }

  /**
   * Dispara um crawl manual do TJRR. Juris (JSF/PrimeFaces), sem
   * CAPTCHA. Usa BrowserPoolService por ser um app stateful (mesmo
   * tipo do TJPE, mas confiável aqui — ver tjrr-juris.adapter.ts).
   */
  @Post('tjrr/executar')
  async executarTjrr(@Body() dto: ExecutarCrawlTjrrDto) {
    await this.prisma.tribunal.upsert({
      where: { sigla: 'TJRR' },
      update: {},
      create: { sigla: 'TJRR', nome: 'Tribunal de Justiça de Roraima', instancia: 'TRIBUNAL' },
    });

    const adapter = new TjrrJurisAdapter(this.browserPool, {
      termos: dto.termos ?? TERMOS_PADRAO_TJRR,
      maxPaginasPorTermo: dto.maxPaginasPorTermo ?? 2,
    });

    this.crawler.registrarAdapter(adapter);
    return this.crawler.executarCrawl('TJRR');
  }
}

function parseDataBr(data: string): Date {
  const [dd, mm, yyyy] = data.split('/').map(Number);
  return new Date(yyyy, mm - 1, dd);
}
