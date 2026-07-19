import { Logger } from '@nestjs/common';
import axios from 'axios';
import { CrawlerAdapter } from '../crawler.service';
import { parseResultadosTjrn, TjrnApiResponse } from '../parsers/tjrn-elastic.parser';

const API_URL = 'https://jurisprudencia.tjrn.jus.br/api/pesquisar';

export interface TjrnTermo {
  termo: string;
  area?: string;
}

export interface TjrnElasticConfig {
  termos: TjrnTermo[];
  maxPaginasPorTermo?: number;
}

export const TERMOS_PADRAO_TJRN: TjrnTermo[] = [
  { termo: 'benefício previdenciário', area: 'PREVIDENCIARIO' },
  { termo: 'relação de emprego', area: 'TRABALHISTA' },
  { termo: 'responsabilidade civil', area: 'CIVIL' },
  { termo: 'direito de família', area: 'FAMILIA' },
  { termo: 'habeas corpus', area: 'CRIMINAL' },
  { termo: 'execução fiscal', area: 'TRIBUTARIO' },
  { termo: 'ato administrativo', area: 'OUTRO' },
];

/**
 * Coleta acórdãos do TJRN via a API de jurisprudência (Elasticsearch
 * por trás). Sem CAPTCHA — o 403 inicial era só falta dos headers
 * Referer/X-Requested-With, não um bloqueio de bot de verdade. Mas o
 * endpoint tem algum tipo de WAF/rate-limit por volume (confirmado ao
 * vivo em 2026-07-19: depois de ~7 requisições em poucos minutos
 * durante os testes, passou a responder 403 mesmo com os headers
 * corretos, inclusive fora da aplicação) — mesmo padrão visto no TJSC.
 * Por isso o intervalo entre páginas/termos aqui é o dobro do usual.
 */
export class TjrnElasticAdapter implements CrawlerAdapter {
  tribunalSigla = 'TJRN';
  private readonly logger = new Logger(TjrnElasticAdapter.name);

  constructor(private readonly config: TjrnElasticConfig) {}

  async *coletar() {
    const termos = this.config.termos.length ? this.config.termos : TERMOS_PADRAO_TJRN;
    const maxPaginas = this.config.maxPaginasPorTermo ?? 5;

    for (const { termo, area } of termos) {
      let pagina = 1;

      while (pagina <= maxPaginas) {
        let json: TjrnApiResponse;
        try {
          const resp = await axios.post<TjrnApiResponse>(
            API_URL,
            {
              jurisprudencia: {
                ementa: '',
                inteiro_teor: termo,
                nr_processo: '',
                id_classe_judicial: '',
                id_orgao_julgador: '',
                id_relator: '',
                id_colegiado: '',
                id_juiz: '',
                id_vara: '',
                dt_inicio: '',
                dt_fim: '',
                origem: '',
                sistema: 'PJE',
                decisoes: 'Acórdão',
                jurisdicoes: '',
                grau: '2',
              },
              page: pagina,
              usuario: { matricula: '', token: '' },
            },
            {
              headers: {
                'Content-Type': 'application/json;charset=UTF-8',
                'User-Agent': 'Mozilla/5.0 (compatible; JuitBot/1.0)',
                Referer: 'https://jurisprudencia.tjrn.jus.br/',
                'X-Requested-With': 'XMLHttpRequest',
              },
              timeout: 20000,
            },
          );
          json = resp.data;
        } catch (err: any) {
          this.logger.warn(`TJRN: falha na requisicao (termo "${termo}", pagina ${pagina}): ${err.message}`);
          break;
        }

        const itens = parseResultadosTjrn(json);
        if (!itens.length) {
          this.logger.log(`TJRN: termo "${termo}", pagina ${pagina} sem resultados, encerrando termo`);
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
        await esperar(2000);
      }

      await esperar(2000);
    }
  }
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
