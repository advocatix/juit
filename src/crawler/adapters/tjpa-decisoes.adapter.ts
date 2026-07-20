import { Logger } from '@nestjs/common';
import axios from 'axios';
import { CrawlerAdapter } from '../crawler.service';
import { parseResultadosTjpa, TjpaApiResponse } from '../parsers/tjpa-decisoes.parser';

const API_URL = 'https://jurisprudencia.tjpa.jus.br/bff/api/decisoes/buscar';
const ITENS_POR_PAGINA = 25;

export interface TjpaTermo {
  termo: string;
  area?: string;
}

export interface TjpaDecisoesConfig {
  termos: TjpaTermo[];
  maxPaginasPorTermo?: number;
}

export const TERMOS_PADRAO_TJPA: TjpaTermo[] = [
  { termo: 'responsabilidade civil', area: 'CIVIL' },
  { termo: 'relação de emprego', area: 'TRABALHISTA' },
  { termo: 'direito de família', area: 'FAMILIA' },
  { termo: 'benefício previdenciário', area: 'PREVIDENCIARIO' },
  { termo: 'habeas corpus', area: 'CRIMINAL' },
  { termo: 'execução fiscal', area: 'TRIBUTARIO' },
  { termo: 'ato administrativo', area: 'OUTRO' },
];

/**
 * Coleta acórdãos/decisões monocráticas do TJPA via a API JSON nativa
 * do "Banco de Jurisprudência" (`jurisprudencia.tjpa.jus.br`, lançado
 * em 2026 — sistema completamente novo, substitui o antigo serviço
 * manual por e-mail que tinha feito o TJPA ser descartado de vez em
 * rodadas anteriores). Sem CAPTCHA, sem exigência de browser, resposta
 * já vem em JSON estruturado limpo (ver tjpa-decisoes.parser.ts) —
 * confirmado ao vivo que a URL antiga do hotsite mudou de maiúscula
 * pra minúscula (`hotsite/jurisprudencia/`, não `Jurisprudencia/`).
 */
export class TjpaDecisoesAdapter implements CrawlerAdapter {
  tribunalSigla = 'TJPA';
  private readonly logger = new Logger(TjpaDecisoesAdapter.name);

  constructor(private readonly config: TjpaDecisoesConfig) {}

  async *coletar() {
    const termos = this.config.termos.length ? this.config.termos : TERMOS_PADRAO_TJPA;
    const maxPaginas = this.config.maxPaginasPorTermo ?? 5;

    for (const { termo, area } of termos) {
      let pagina = 0;

      while (pagina < maxPaginas) {
        let json: TjpaApiResponse;
        try {
          const resp = await axios.post<TjpaApiResponse>(
            API_URL,
            {
              query: termo,
              queryType: 'free',
              queryScope: 'ementa',
              origem: ['tribunal de justiça do estado do pará'],
              tipo: ['acórdão', 'decisão monocrática'],
              page: pagina,
              size: ITENS_POR_PAGINA,
              sortBy: 'relevancia',
              sortOrder: 'desc',
            },
            {
              headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json, text/plain, */*',
                'User-Agent': 'Mozilla/5.0 (compatible; JuitBot/1.0)',
                Referer: 'https://jurisprudencia.tjpa.jus.br/',
              },
              timeout: 20000,
            },
          );
          json = resp.data;
        } catch (err: any) {
          this.logger.warn(`TJPA: falha na requisicao (termo "${termo}", pagina ${pagina}): ${err.message}`);
          break;
        }

        const itens = parseResultadosTjpa(json);
        if (!itens.length) {
          this.logger.log(`TJPA: termo "${termo}", pagina ${pagina} sem resultados uteis, encerrando termo`);
          break;
        }

        for (const item of itens) {
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
        await esperar(1000);
      }

      await esperar(1000);
    }
  }
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
