import { Logger } from '@nestjs/common';
import { Page } from 'playwright-core';
import { CrawlerAdapter } from '../crawler.service';
import { BrowserPoolService } from '../browser-pool.service';
import { parseResultadosTjro, TjroApiResponse } from '../parsers/tjro-elastic.parser';

const SITE_URL = 'https://juris.tjro.jus.br/';
const API_URL = 'https://juris-back.tjro.jus.br/search/varios_parametros/';
const CAMPO_BUSCA = 'input[placeholder="Digite o texto ou palavra a ser pesquisada..."]';
const TAMANHO_PAGINA = 10;

export interface TjroTermo {
  termo: string;
  area?: string;
}

export interface TjroElasticConfig {
  termos: TjroTermo[];
  maxPaginasPorTermo?: number;
}

export const TERMOS_PADRAO_TJRO: TjroTermo[] = [
  { termo: 'benefício previdenciário', area: 'PREVIDENCIARIO' },
  { termo: 'relação de emprego', area: 'TRABALHISTA' },
  { termo: 'responsabilidade civil', area: 'CIVIL' },
  { termo: 'direito de família', area: 'FAMILIA' },
  { termo: 'habeas corpus', area: 'CRIMINAL' },
  { termo: 'execução fiscal', area: 'TRIBUTARIO' },
  { termo: 'ato administrativo', area: 'OUTRO' },
];

/**
 * Coleta acórdãos do TJRO via a API de jurisprudência (Elasticsearch por
 * trás de juris-back.tjro.jus.br). O front (juris.tjro.jus.br) e a API
 * ficam atrás de um F5 BIG-IP com desafio JS (TSPD) — confirmado ao vivo
 * que a API rejeita HTTP puro (resposta com header inválido/NUL byte),
 * mas libera normalmente dentro de um browser real depois que o desafio
 * carrega (alguns segundos). Por isso usamos BrowserPoolService e
 * chamamos a API via fetch() dentro da própria página (mesmas
 * cookies/fingerprint que o front usa), em vez de parsear HTML.
 */
export class TjroElasticAdapter implements CrawlerAdapter {
  tribunalSigla = 'TJRO';
  private readonly logger = new Logger(TjroElasticAdapter.name);

  constructor(
    private readonly browserPool: BrowserPoolService,
    private readonly config: TjroElasticConfig,
  ) {}

  async *coletar() {
    const termos = this.config.termos.length ? this.config.termos : TERMOS_PADRAO_TJRO;
    const maxPaginas = this.config.maxPaginasPorTermo ?? 5;

    for (const { termo, area } of termos) {
      const page = await this.browserPool.newPage();

      try {
        await page.goto(SITE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForSelector(CAMPO_BUSCA, { timeout: 20000 }).catch(() => null);

        if ((await page.locator(CAMPO_BUSCA).count()) === 0) {
          this.logger.warn(`TJRO: desafio F5 nao liberou para o termo "${termo}", pulando`);
          continue;
        }

        // O desafio F5/TSPD e por dominio: passar em juris.tjro.jus.br
        // (front) nao libera automaticamente juris-back.tjro.jus.br
        // (API) — o cookie do desafio da API e resolvido por JS em
        // background depois que a pagina carrega, de forma assincrona.
        // Sem essa espera, o primeiro fetch() pode ainda cair na pagina
        // de desafio (HTML) em vez do JSON esperado.
        await page.waitForTimeout(6000);

        let pagina = 1;
        while (pagina <= maxPaginas) {
          const from = (pagina - 1) * TAMANHO_PAGINA;
          const resultado = await this.buscarPaginaComRetry(page, termo, from);
          if (resultado === null) {
            this.logger.warn(`TJRO: termo "${termo}", pagina ${pagina} — desafio F5 nao liberou a API apos retries, pulando termo`);
            break;
          }

          const itens = parseResultadosTjro(resultado);
          if (!itens.length) {
            this.logger.log(`TJRO: termo "${termo}", pagina ${pagina} sem resultados, encerrando termo`);
            break;
          }

          for (const item of itens) {
            if (!item.ementa) continue;
            yield {
              numeroProcesso: item.numeroProcesso,
              orgaoJulgador: item.orgaoJulgador,
              relator: item.relator,
              dataJulgamento: item.dataJulgamento,
              area,
              ementa: item.ementa,
            };
          }

          pagina++;
          await page.waitForTimeout(1000);
        }
      } finally {
        await page.close();
      }
    }
  }

  /**
   * Faz o POST pra API dentro da pagina (mesmas cookies do desafio
   * F5/TSPD) validando content-type antes de chamar `.json()` — se a
   * API ainda estiver servindo a pagina de desafio (HTML), `.json()`
   * lancava `SyntaxError: Unexpected token '<'` e derrubava o crawl
   * inteiro. Agora espera e tenta de novo algumas vezes antes de
   * desistir do termo.
   */
  private async buscarPaginaComRetry(
    page: Page,
    termo: string,
    from: number,
    tentativas = 3,
  ): Promise<TjroApiResponse | null> {
    for (let i = 0; i < tentativas; i++) {
      const resultado = await page.evaluate<
        { ok: true; json: TjroApiResponse } | { ok: false },
        { url: string; termo: string; from: number; size: number }
      >(
        async ({ url, termo, from, size }) => {
          const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from,
              size,
              fields: {
                nr_processo: '',
                query: termo,
                'tipo.raw': ['EMENTA'],
                'ds_nome.raw': [],
                'ds_orgao_julgador.raw': [],
                'ds_orgao_julgador_colegiado.raw': [],
                'ds_classe_judicial.raw': [],
              },
              sort: [{ _score: 'desc' }, { dtjulgamento: 'desc' }],
            }),
          });
          const contentType = resp.headers.get('content-type') ?? '';
          if (!resp.ok || !contentType.includes('application/json')) return { ok: false };
          return { ok: true, json: await resp.json() };
        },
        { url: API_URL, termo, from, size: TAMANHO_PAGINA },
      );

      if (resultado.ok) return resultado.json;
      if (i < tentativas - 1) await page.waitForTimeout(4000 * (i + 1));
    }
    return null;
  }
}
