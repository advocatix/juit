import * as cheerio from 'cheerio';

export interface TjroHit {
  _source: {
    nr_processo?: string;
    ds_orgao_julgador?: string;
    ds_nome?: string;
    dtjulgamento?: string;
    ds_modelo_documento?: string;
    tipo?: string;
  };
}

export interface TjroApiResponse {
  hits?: {
    total?: { value: number };
    hits?: TjroHit[];
  };
}

export interface TjroResultado {
  numeroProcesso?: string;
  orgaoJulgador?: string;
  relator?: string;
  dataJulgamento?: Date;
  ementa?: string;
}

/**
 * O TJRO (Elasticsearch nativo por trás de juris-back.tjro.jus.br) só
 * indexa documentos do tipo EMENTA com ementa de verdade — os demais
 * campos de "tipo" (voto, relatório) são filtrados pela própria consulta.
 * O corpo (`ds_modelo_documento`) vem como HTML com entidades nomeadas
 * (&Ccedil;, &Atilde;, etc.) — usamos cheerio pra extrair o texto puro
 * já decodificado em vez de um regex manual de entidades.
 */
export function parseResultadosTjro(json: TjroApiResponse): TjroResultado[] {
  const hits = json.hits?.hits ?? [];

  return hits.map((h) => ({
    numeroProcesso: h._source.nr_processo,
    orgaoJulgador: h._source.ds_orgao_julgador,
    relator: h._source.ds_nome,
    dataJulgamento: parseDataIso(h._source.dtjulgamento),
    ementa: extrairTexto(h._source.ds_modelo_documento),
  }));
}

function extrairTexto(html?: string): string | undefined {
  if (!html) return undefined;
  const $ = cheerio.load(html);
  const texto = $.root().text().replace(/\s+/g, ' ').trim();
  return texto || undefined;
}

function parseDataIso(data?: string): Date | undefined {
  if (!data) return undefined;
  const d = new Date(`${data}T00:00:00`);
  return isNaN(d.getTime()) ? undefined : d;
}
