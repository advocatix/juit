import { Logger } from '@nestjs/common';
import { BrowserPoolService } from '../browser-pool.service';
import { parseResultadosFalcao, FalcaoApiResponse } from '../parsers/falcao-nacional.parser';

const HOME_URL = 'https://jurisprudencia.jt.jus.br/';
const API_URL = 'https://jurisprudencia.jt.jus.br/jurisprudencia-nacional-backend/api/no-auth/pesquisa';
const TAMANHO_PAGINA = 10; // máximo aceito pelo backend (20+ retorna 403)

export interface FalcaoTermo {
  termo: string;
  area?: string;
}

export interface FalcaoNacionalConfig {
  termos: FalcaoTermo[];
  maxPaginasPorTermo?: number;
}

export const TERMOS_PADRAO_FALCAO: FalcaoTermo[] = [
  { termo: 'assédio moral', area: 'TRABALHISTA' },
  { termo: 'horas extras', area: 'TRABALHISTA' },
  { termo: 'rescisão indireta', area: 'TRABALHISTA' },
  { termo: 'acidente de trabalho', area: 'TRABALHISTA' },
  { termo: 'equiparação salarial', area: 'TRABALHISTA' },
  { termo: 'justa causa', area: 'TRABALHISTA' },
  { termo: 'vínculo empregatício', area: 'TRABALHISTA' },
];

export interface FalcaoItemColetado {
  numeroProcesso?: string;
  tribunalSigla?: string;
  orgaoJulgador?: string;
  relator?: string;
  dataJulgamento?: Date;
  area?: string;
  ementa?: string;
}

/**
 * Coleta acórdãos do FALCÃO — repositório NACIONAL da Justiça do
 * Trabalho (TST + 24 TRTs + CSJT), unificado numa API só
 * (`api/no-auth/pesquisa?colecao=acordaos`). Sem CAPTCHA, mas a API
 * bloqueia requisições sem passar por um browser real (WAF sensível a
 * fingerprint — HTTP puro via axios/curl recebe sempre "Tentativa
 * inválida de acesso ao sistema", mesmo replicando headers idênticos
 * aos do browser). Por isso usa BrowserPoolService e chama a API via
 * fetch() dentro da própria página. Achados operacionais:
 * - `sessionId` precisa ter exatamente 8 caracteres (`_` + 7
 *   alfanuméricos) — qualquer outro tamanho retorna
 *   "Tentativa inválida de acesso ao sistema" mesmo dentro do browser.
 * - `size` máximo aceito é 10 — 20+ retorna 403 explícito.
 * - `colecao=acordaos` é o valor certo pra acórdãos de verdade (`
 *   precedentes` traz só súmulas/OJs, `jurisprudencia` não existe).
 *
 * Diferente de todos os outros adapters, este NÃO é 1-tribunal-só: cada
 * documento retornado já vem com o tribunal de origem
 * (`tribunal: "TRT3"`, `"TST"`, `"CSJT"`...), então o item resultante
 * inclui `tribunalSigla` — quem grava no banco (ver rota no
 * controller) resolve/upserta o Tribunal real por item, sem depender
 * do `CrawlerService.executarCrawl()` genérico (que assume um único
 * tribunal fixo por chamada).
 */
export class FalcaoNacionalAdapter {
  private readonly logger = new Logger(FalcaoNacionalAdapter.name);

  constructor(
    private readonly browserPool: BrowserPoolService,
    private readonly config: FalcaoNacionalConfig,
  ) {}

  async *coletar(): AsyncGenerator<FalcaoItemColetado> {
    const termos = this.config.termos.length ? this.config.termos : TERMOS_PADRAO_FALCAO;
    const maxPaginas = this.config.maxPaginasPorTermo ?? 5;

    const page = await this.browserPool.newPage();

    try {
      await page.goto(HOME_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);

      for (const { termo, area } of termos) {
        let pagina = 0;

        while (pagina < maxPaginas) {
          const json = await page.evaluate<FalcaoApiResponse, { url: string; sessionId: string; termo: string; pagina: number; size: number }>(
            async ({ url, sessionId, termo, pagina, size }) => {
              const params = new URLSearchParams({
                sessionId,
                latitude: '0',
                longitude: '0',
                texto: termo,
                verTodosPrecedentes: 'false',
                tribunais: '',
                pesquisaSomenteNasEmentas: 'false',
                colecao: 'acordaos',
                page: String(pagina),
                size: String(size),
              });
              const resp = await fetch(`${url}?${params.toString()}`, {
                headers: { Accept: 'application/json, text/plain, */*' },
              });
              return resp.json();
            },
            { url: API_URL, sessionId: gerarSessionId(), termo, pagina, size: TAMANHO_PAGINA },
          );

          if (json.userMessage) {
            this.logger.warn(`FALCAO: termo "${termo}", pagina ${pagina} falhou: ${json.userMessage}`);
            break;
          }

          const itens = parseResultadosFalcao(json);
          if (!itens.length) {
            this.logger.log(`FALCAO: termo "${termo}", pagina ${pagina} sem resultados, encerrando termo`);
            break;
          }

          for (const item of itens) {
            if (!item.ementa) continue;
            yield {
              numeroProcesso: item.numeroProcesso,
              tribunalSigla: item.tribunalSigla,
              orgaoJulgador: item.orgaoJulgador,
              relator: item.relator,
              dataJulgamento: item.dataJulgamento,
              area,
              ementa: item.ementa,
            };
          }

          pagina++;
          await page.waitForTimeout(1200);
        }

        await page.waitForTimeout(1200);
      }
    } finally {
      await page.close();
    }
  }
}

function gerarSessionId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '_';
  for (let i = 0; i < 7; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
