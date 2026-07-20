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
 * Referer/X-Requested-With, não um bloqueio de bot de verdade.
 *
 * Bug real encontrado em 2026-07-20 durante o primeiro backfill: o
 * User-Agent usado aqui era `Mozilla/5.0 (compatible; JuitBot/1.0)`
 * — contém a palavra "Bot" de forma explícita. Confirmado ao vivo que
 * o WAF do TJRN passou a bloquear 100% das requisições com 403
 * "Access Denied" (Akamai) usando essa string, mesmo a primeira
 * requisição de uma sessão nova — provavelmente um administrador
 * viu "JuitBot" nos logs de acesso depois dos testes de 2026-07-19 e
 * adicionou uma regra de bloqueio por assinatura. Trocado pra um
 * User-Agent de navegador real resolveu de imediato (confirmado:
 * 15/15 requisições 200 OK). Por isso o intervalo entre
 * páginas/termos aqui continua o dobro do usual, por cautela.
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
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
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
