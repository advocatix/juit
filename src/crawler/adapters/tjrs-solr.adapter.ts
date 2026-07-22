import { Logger } from '@nestjs/common';
import axios from 'axios';
import { CrawlerAdapter } from '../crawler.service';
import { parseResultadosTjrs, TjrsSolrResponse } from '../parsers/tjrs-solr.parser';

const AJAX_URL = 'https://www.tjrs.jus.br/buscas/jurisprudencia/ajax.php';
const RESULTADOS_POR_PAGINA = 10;
// Modo "varrer tudo": o wrapper PHP sobre Solr nao aceita page size >10
// nem cursorMark (sort e fixo no servidor, ignora o parametro) — acima
// de ~500.000 no offset `start` o Solr rejeita a query (custo de deep
// paging). Confirmado ao vivo (2026-07-22) que o form real usa os
// campos `data_julgamento_de`/`data_julgamento_ate` (extraidos de
// jurisprudencia-ajax.js, que so faz `form.serialize()` — nao ha
// endpoint separado, e literalmente o form HTML) e que nenhum ano
// isolado passa de ~505.000 resultados (pico em 2010). Por isso
// varremos ano a ano (de 1988, inicio realista de digitalizacao, ate o
// ano atual), cada ano ficando bem abaixo do teto de offset seguro.
const ANO_INICIAL = 1988;
const OFFSET_MAX_SEGURO = 490000; // margem abaixo dos ~500k onde o Solr comeca a rejeitar
const PAGINAS_MAX_POR_ANO = OFFSET_MAX_SEGURO / RESULTADOS_POR_PAGINA;

export interface TjrsTermo {
  termo: string;
  area?: string;
}

export interface TjrsSolrConfig {
  termos: TjrsTermo[];
  maxPaginasPorTermo?: number;
  /** Ignora `termos` e varre o acervo inteiro, ano a ano, via filtro de data. */
  varrerTudo?: boolean;
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
    if (this.config.varrerTudo) {
      yield* this.varrerAcervoCompleto();
      return;
    }

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

  private async *varrerAcervoCompleto() {
    const anoAtual = new Date().getFullYear();

    for (let ano = anoAtual; ano >= ANO_INICIAL; ano--) {
      let pagina = 1;
      let falhasSeguidas = 0;

      while (pagina <= PAGINAS_MAX_POR_ANO) {
        const start = (pagina - 1) * RESULTADOS_POR_PAGINA;
        let json: TjrsSolrResponse;

        try {
          const parametros = new URLSearchParams({
            aba: 'jurisprudencia',
            realizando_pesquisa: '1',
            pagina_atual: String(pagina),
            q_palavra_chave: '',
            conteudo_busca: 'ementa_completa',
            filtroTribunal: '-1',
            filtroRelator: '-1',
            filtroOrgaoJulgador: '-1',
            filtroTipoProcesso: '-1',
            filtroClasseCnj: '-1',
            assuntoCnj: '-1',
            data_julgamento_de: `01/01/${ano}`,
            data_julgamento_ate: `31/12/${ano}`,
            facet: 'off',
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
            timeout: 30000,
          });
          json = resp.data;
          falhasSeguidas = 0;
        } catch (err: any) {
          falhasSeguidas++;
          this.logger.warn(`TJRS: falha na requisicao (varrer tudo, ano ${ano}, pagina ${pagina}): ${err.message}`);
          if (falhasSeguidas >= 5) {
            this.logger.error(`TJRS: 5 falhas seguidas no ano ${ano}, pulando para o proximo ano`);
            break;
          }
          await esperar(5000);
          continue;
        }

        const itens = parseResultadosTjrs(json);
        if (!itens.length) {
          this.logger.log(`TJRS: ano ${ano} encerrado na pagina ${pagina} (sem mais resultados)`);
          break;
        }

        for (const item of itens) {
          yield {
            numeroProcesso: item.numeroProcesso,
            orgaoJulgador: item.orgaoJulgador,
            relator: item.relator,
            dataJulgamento: item.dataJulgamento,
            ementa: item.ementa,
          };
        }

        if (pagina % 50 === 0) {
          this.logger.log(`TJRS: varredura completa, ano ${ano}, pagina ${pagina} (total do ano: ${json.response?.numFound ?? '?'})`);
        }

        pagina++;
        await esperar(800);
      }

      if (pagina > PAGINAS_MAX_POR_ANO) {
        this.logger.warn(`TJRS: ano ${ano} atingiu o teto de seguranca de offset (${OFFSET_MAX_SEGURO}) sem esgotar — pode haver registros nao coletados nesse ano`);
      }
    }
  }
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
