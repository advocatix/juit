import { Logger } from '@nestjs/common';
import axios from 'axios';
import { CrawlerAdapter } from '../crawler.service';
import { parseResultadosTjrs, TjrsSolrResponse } from '../parsers/tjrs-solr.parser';

const AJAX_URL = 'https://www.tjrs.jus.br/buscas/jurisprudencia/ajax.php';
const RESULTADOS_POR_PAGINA = 10;

export interface TjrsTermo {
  termo: string;
  area?: string;
}

export interface TjrsSolrConfig {
  termos: TjrsTermo[];
  maxPaginasPorTermo?: number;
}

export const TERMOS_PADRAO_TJRS: TjrsTermo[] = [
  { termo: 'benefício previdenciário', area: 'PREVIDENCIARIO' },
  { termo: 'relação de emprego', area: 'TRABALHISTA' },
  { termo: 'responsabilidade civil', area: 'CIVIL' },
  { termo: 'direito de família', area: 'FAMILIA' },
  { termo: 'habeas corpus', area: 'CRIMINAL' },
  { termo: 'execução fiscal', area: 'TRIBUTARIO' },
  { termo: 'ato administrativo', area: 'OUTRO' },
];

/**
 * Coleta acórdãos do TJRS via o backend Solr nativo (JSON puro, sem
 * HTML pra parsear). Sem CAPTCHA. Não testamos volume alto o bastante
 * pra confirmar se existe algum WAF por IP como o do TJSC — por
 * cautela, o adapter já nasce com o mesmo intervalo entre requisições.
 */
export class TjrsSolrAdapter implements CrawlerAdapter {
  tribunalSigla = 'TJRS';
  private readonly logger = new Logger(TjrsSolrAdapter.name);

  constructor(private readonly config: TjrsSolrConfig) {}

  async *coletar() {
    const termos = this.config.termos.length ? this.config.termos : TERMOS_PADRAO_TJRS;
    const maxPaginas = this.config.maxPaginasPorTermo ?? 5;

    for (const { termo, area } of termos) {
      let pagina = 1;

      while (pagina <= maxPaginas) {
        const start = (pagina - 1) * RESULTADOS_POR_PAGINA;
        let json: TjrsSolrResponse;

        try {
          const parametros = new URLSearchParams({
            aba: 'jurisprudencia',
            realizando_pesquisa: '1',
            pagina_atual: String(pagina),
            q_palavra_chave: termo,
            conteudo_busca: 'ementa_completa',
            filtroTribunal: '-1',
            filtroRelator: '-1',
            filtroOrgaoJulgador: '-1',
            filtroTipoProcesso: '-1',
            filtroClasseCnj: '-1',
            assuntoCnj: '-1',
            facet: 'on',
            'facet.sort': 'index',
            'facet.limit': 'index',
            wt: 'json',
            ordem: 'desc',
            start: String(start),
          }).toString();

          const body = new URLSearchParams({
            action: 'consultas_solr_ajax',
            metodo: 'buscar_resultados',
            parametros,
          }).toString();

          const resp = await axios.post<TjrsSolrResponse>(AJAX_URL, body, {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'User-Agent': 'Mozilla/5.0 (compatible; JuitBot/1.0)',
            },
            timeout: 20000,
          });
          json = resp.data;
        } catch (err: any) {
          this.logger.warn(`TJRS: falha na requisicao (termo "${termo}", pagina ${pagina}): ${err.message}`);
          break;
        }

        const itens = parseResultadosTjrs(json);
        if (!itens.length) {
          this.logger.log(`TJRS: termo "${termo}", pagina ${pagina} sem resultados, encerrando termo`);
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
        await esperar(1500);
      }

      await esperar(1500);
    }
  }
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
