export interface TjrnSource {
  numero_processo?: string;
  orgao_julgador?: string;
  magistrado?: string;
  dt_publicacao?: string;
  ementa?: string;
}

export interface TjrnApiResponse {
  hits?: {
    total: number;
    hits: Array<{ _source: TjrnSource }>;
  };
}

export interface TjrnResultado {
  numeroProcesso?: string;
  orgaoJulgador?: string;
  relator?: string;
  dataJulgamento?: Date;
  ementa?: string;
}

/**
 * O TJRN responde via Elasticsearch nativo por trás de uma API própria
 * — sem HTML de listagem pra parsear, mas o campo `ementa` em si vem
 * como HTML bruto (formatação Word/Office), precisa de limpeza.
 * Endpoint descoberto ao vivo em 2026-07-19 contra
 * `jurisprudencia.tjrn.jus.br/api/pesquisar`. Exige os headers
 * `Referer` e `X-Requested-With: XMLHttpRequest` — sem eles, o CDN
 * (Akamai) retorna 403 "Access Denied" mesmo sem CAPTCHA de verdade.
 */
export function parseResultadosTjrn(json: TjrnApiResponse): TjrnResultado[] {
  const hits = json.hits?.hits ?? [];

  return hits.map(({ _source: d }) => ({
    numeroProcesso: d.numero_processo,
    orgaoJulgador: d.orgao_julgador,
    relator: d.magistrado,
    dataJulgamento: parseDataIso(d.dt_publicacao),
    ementa: limparHtml(d.ementa),
  }));
}

function limparHtml(html?: string): string | undefined {
  if (!html) return undefined;
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDataIso(data?: string): Date | undefined {
  if (!data) return undefined;
  const d = new Date(data);
  return isNaN(d.getTime()) ? undefined : d;
}
