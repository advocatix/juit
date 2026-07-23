import { Logger } from '@nestjs/common';
import axios from 'axios';
import { parseResultadosFalcao, FalcaoApiResponse } from '../parsers/falcao-nacional.parser';

const API_URL = 'https://jurisprudencia.jt.jus.br/jurisprudencia-nacional-backend/api/no-auth/pesquisa';
const TAMANHO_PAGINA = 10; // tem que ser exatamente 10 (2 e 20+ retornam erro/403)

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
 * (`api/no-auth/pesquisa?colecao=acordaos`). HTTP puro via axios — o
 * bloqueio anterior ("Tentativa inválida de acesso ao sistema"/403 do
 * CloudFront) era só falta de `User-Agent`/`Referer` de browser nos
 * headers, não exigência de execução de JS (confirmado ao vivo em
 * 2026-07-23: a mesma chamada que falha sem esses dois headers
 * funciona normalmente com eles — sem precisar de Browserbase).
 * Achados operacionais:
 * - `sessionId` precisa ter exatamente 8 caracteres (`_` + 7
 *   alfanuméricos) — qualquer outro tamanho retorna
 *   "Tentativa inválida de acesso ao sistema".
 * - `size` precisa ser exatamente 10 — outros valores (2, 20+) retornam
 *   erro/403 explícito.
 * - `colecao=acordaos` é o valor certo pra acórdãos de verdade
 *   (`precedentes` traz só súmulas/OJs, `jurisprudencia` não existe).
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

  constructor(private readonly config: FalcaoNacionalConfig) {}

  async *coletar(): AsyncGenerator<FalcaoItemColetado> {
    const termos = this.config.termos.length ? this.config.termos : TERMOS_PADRAO_FALCAO;
    const maxPaginas = this.config.maxPaginasPorTermo ?? 5;

    for (const { termo, area } of termos) {
      let pagina = 0;

      while (pagina < maxPaginas) {
        let json: FalcaoApiResponse;
        try {
          const resp = await axios.get<FalcaoApiResponse>(API_URL, {
            params: {
              sessionId: gerarSessionId(),
              latitude: '0',
              longitude: '0',
              texto: termo,
              verTodosPrecedentes: 'false',
              tribunais: '',
              pesquisaSomenteNasEmentas: 'false',
              colecao: 'acordaos',
              page: pagina,
              size: TAMANHO_PAGINA,
            },
            headers: {
              Accept: 'application/json, text/plain, */*',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
              Referer: 'https://jurisprudencia.jt.jus.br/',
            },
            timeout: 20000,
          });
          json = resp.data;
        } catch (err: any) {
          this.logger.warn(`FALCAO: falha na requisicao (termo "${termo}", pagina ${pagina}): ${err.message}`);
          break;
        }

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
        await esperar(1200);
      }

      await esperar(1200);
    }
  }
}

function gerarSessionId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '_';
  for (let i = 0; i < 7; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
