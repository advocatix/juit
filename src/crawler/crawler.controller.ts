import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
import { TjacCjsgAdapter } from './adapters/tjac-cjsg.adapter';
import { TjmgEspelhoAdapter, TERMOS_PADRAO_TJMG } from './adapters/tjmg-espelho.adapter';
import { TjseJurisprudenciaAdapter, TERMOS_PADRAO_TJSE } from './adapters/tjse-jurisprudencia.adapter';
import { TjpeJurisprudenciaAdapter, TERMOS_PADRAO_TJPE } from './adapters/tjpe-jurisprudencia.adapter';
import { TjgoProjudiAdapter, TERMOS_PADRAO_TJGO } from './adapters/tjgo-projudi.adapter';
import { TjpaDecisoesAdapter, TERMOS_PADRAO_TJPA } from './adapters/tjpa-decisoes.adapter';
import { TERMOS_PADRAO_FALCAO } from './adapters/falcao-nacional.adapter';
import { executarFalcaoCrawl } from './adapters/falcao-runner';
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
import { ExecutarCrawlTjacDto } from './dto/executar-crawl-tjac.dto';
import { ExecutarCrawlFalcaoDto } from './dto/executar-crawl-falcao.dto';
import { ExecutarCrawlTjmgDto } from './dto/executar-crawl-tjmg.dto';
import { ExecutarCrawlTjseDto } from './dto/executar-crawl-tjse.dto';
import { ExecutarCrawlTjpeDto } from './dto/executar-crawl-tjpe.dto';
import { ExecutarCrawlTjgoDto } from './dto/executar-crawl-tjgo.dto';
import { ExecutarCrawlTjpaDto } from './dto/executar-crawl-tjpa.dto';

@Controller('crawler')
@UseGuards(ApiKeyGuard)
export class CrawlerController {
  constructor(
    private readonly crawler: CrawlerService,
    private readonly browserPool: BrowserPoolService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
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
      varrerTudo: dto.varrerTudo,
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
      varrerTudo: dto.varrerTudo,
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
      varrerTudo: dto.varrerTudo,
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
      varrerTudo: dto.varrerTudo,
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
      varrerTudo: dto.varrerTudo,
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
      varrerTudo: dto.varrerTudo,
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

  /**
   * Dispara um crawl manual do TJAC. Mesmo e-SAJ do TJSP/TJMS/TJAM/TJAL
   * (mesma estrutura de HTML, mesmo parser) — busca por período de
   * julgamento. Funciona normalmente via Browserbase (confirmado ao
   * vivo, mesmo padrão do TJAL).
   */
  @Post('tjac/executar')
  async executarTjac(@Body() dto: ExecutarCrawlTjacDto) {
    await this.prisma.tribunal.upsert({
      where: { sigla: 'TJAC' },
      update: {},
      create: { sigla: 'TJAC', nome: 'Tribunal de Justiça do Acre', instancia: 'TRIBUNAL' },
    });

    const hoje = new Date();
    const ontem = new Date(hoje);
    ontem.setDate(ontem.getDate() - 1);

    const adapter = new TjacCjsgAdapter(this.browserPool, {
      dataJulgamentoInicio: dto.dataInicio ? parseDataBr(dto.dataInicio) : ontem,
      dataJulgamentoFim: dto.dataFim ? parseDataBr(dto.dataFim) : hoje,
      maxPaginas: dto.maxPaginas ?? 3,
    });

    this.crawler.registrarAdapter(adapter);
    return this.crawler.executarCrawl('TJAC');
  }

  /**
   * Dispara um crawl manual do FALCÃO — repositório NACIONAL da Justiça
   * do Trabalho (TST + 24 TRTs + CSJT), unificado numa API só. Sem
   * CAPTCHA, mas bloqueia HTTP puro (WAF sensível a fingerprint) — usa
   * BrowserPoolService (ver falcao-nacional.adapter.ts).
   *
   * Diferente de todos os outros adapters (1 tribunal por chamada),
   * cada documento retornado já vem com o tribunal de origem
   * (TRT3, TST, CSJT...), então NÃO passa pelo
   * `CrawlerService.executarCrawl()` genérico — grava direto aqui,
   * upsertando o Tribunal real por item e um Tribunal pseudo "FALCAO"
   * só pra dono do CrawlJob (rastreio agregado do total da execução).
   */
  @Post('falcao/executar')
  async executarFalcao(@Body() dto: ExecutarCrawlFalcaoDto) {
    return executarFalcaoCrawl(this.prisma, this.browserPool, {
      termos: dto.termos ?? TERMOS_PADRAO_FALCAO,
      maxPaginasPorTermo: dto.maxPaginasPorTermo ?? 3,
    });
  }

  /**
   * Dispara um crawl manual do TJMG — "Espelho de Acórdão"
   * (formEspelhoAcordao.do). Exige resolver um CAPTCHA de imagem
   * clássico a cada busca nova; resolvido via CapSolver
   * (ver tjmg-espelho.adapter.ts). Só aceita busca por termo + período
   * (data isolada não é suficiente, termo isolado sem período estoura
   * o limite de exibição de resultados).
   */
  @Post('tjmg/executar')
  async executarTjmg(@Body() dto: ExecutarCrawlTjmgDto) {
    await this.prisma.tribunal.upsert({
      where: { sigla: 'TJMG' },
      update: {},
      create: { sigla: 'TJMG', nome: 'Tribunal de Justiça de Minas Gerais', instancia: 'TRIBUNAL' },
    });

    const hoje = new Date();
    const ontem = new Date(hoje);
    ontem.setDate(ontem.getDate() - 1);

    const adapter = new TjmgEspelhoAdapter(this.browserPool, this.configService, {
      termos: dto.termos ?? TERMOS_PADRAO_TJMG,
      dataJulgamentoInicio: dto.dataJulgamentoInicio ? new Date(dto.dataJulgamentoInicio) : ontem,
      dataJulgamentoFim: dto.dataJulgamentoFim ? new Date(dto.dataJulgamentoFim) : ontem,
      maxPaginas: dto.maxPaginas ?? 5,
    });

    this.crawler.registrarAdapter(adapter);
    return this.crawler.executarCrawl('TJMG');
  }

  /**
   * Dispara um crawl manual do TJSE. Protegido por Cloudflare
   * Turnstile de verdade — resolvido via CapSolver
   * (ver tjse-jurisprudencia.adapter.ts). Achado crítico: o token vai
   * num campo separado (#turnstile-hidden), não no campo interno do
   * próprio widget.
   */
  @Post('tjse/executar')
  async executarTjse(@Body() dto: ExecutarCrawlTjseDto) {
    await this.prisma.tribunal.upsert({
      where: { sigla: 'TJSE' },
      update: {},
      create: { sigla: 'TJSE', nome: 'Tribunal de Justiça de Sergipe', instancia: 'TRIBUNAL' },
    });

    const adapter = new TjseJurisprudenciaAdapter(this.browserPool, this.configService, {
      termos: dto.termos ?? TERMOS_PADRAO_TJSE,
      maxPaginas: dto.maxPaginas ?? 5,
    });

    this.crawler.registrarAdapter(adapter);
    return this.crawler.executarCrawl('TJSE');
  }

  /**
   * Dispara um crawl manual do TJPE. Sem CAPTCHA — a busca precisa
   * clicar no link "Pesquisar" de verdade e depois no link
   * "N documentos encontrados" de Acórdãos na tela intermediária
   * (ver tjpe-jurisprudencia.adapter.ts).
   */
  @Post('tjpe/executar')
  async executarTjpe(@Body() dto: ExecutarCrawlTjpeDto) {
    await this.prisma.tribunal.upsert({
      where: { sigla: 'TJPE' },
      update: {},
      create: { sigla: 'TJPE', nome: 'Tribunal de Justiça de Pernambuco', instancia: 'TRIBUNAL' },
    });

    const adapter = new TjpeJurisprudenciaAdapter(this.browserPool, {
      termos: dto.termos ?? TERMOS_PADRAO_TJPE,
      maxPaginas: dto.maxPaginas ?? 5,
    });

    this.crawler.registrarAdapter(adapter);
    return this.crawler.executarCrawl('TJPE');
  }

  /**
   * Dispara um crawl manual do TJGO — "Novo Módulo de Pesquisa de
   * Jurisprudência" do PROJUDI. Protegido por Cloudflare Turnstile
   * (widget visível) resolvido via CapSolver
   * (ver tjgo-projudi.adapter.ts).
   */
  @Post('tjgo/executar')
  async executarTjgo(@Body() dto: ExecutarCrawlTjgoDto) {
    await this.prisma.tribunal.upsert({
      where: { sigla: 'TJGO' },
      update: {},
      create: { sigla: 'TJGO', nome: 'Tribunal de Justiça de Goiás', instancia: 'TRIBUNAL' },
    });

    const adapter = new TjgoProjudiAdapter(this.browserPool, this.configService, {
      termos: dto.termos ?? TERMOS_PADRAO_TJGO,
      maxPaginas: dto.maxPaginas ?? 15,
    });

    this.crawler.registrarAdapter(adapter);
    return this.crawler.executarCrawl('TJGO');
  }

  /**
   * Dispara um crawl manual do TJPA. Sem CAPTCHA, sem browser — API
   * JSON nativa do "Banco de Jurisprudência", sistema novo lançado em
   * 2026 que substituiu o antigo serviço 100% manual por e-mail (ver
   * tjpa-decisoes.adapter.ts).
   */
  @Post('tjpa/executar')
  async executarTjpa(@Body() dto: ExecutarCrawlTjpaDto) {
    await this.prisma.tribunal.upsert({
      where: { sigla: 'TJPA' },
      update: {},
      create: { sigla: 'TJPA', nome: 'Tribunal de Justiça do Pará', instancia: 'TRIBUNAL' },
    });

    const adapter = new TjpaDecisoesAdapter({
      termos: dto.termos ?? TERMOS_PADRAO_TJPA,
      maxPaginasPorTermo: dto.maxPaginasPorTermo ?? 3,
    });

    this.crawler.registrarAdapter(adapter);
    return this.crawler.executarCrawl('TJPA');
  }
}

function parseDataBr(data: string): Date {
  const [dd, mm, yyyy] = data.split('/').map(Number);
  return new Date(yyyy, mm - 1, dd);
}
