import * as cheerio from 'cheerio';

export interface FalcaoDocumento {
  numeroProcesso?: string;
  tribunal?: string;
  relator?: string;
  turma?: string;
  gabinete?: string;
  dataJulgamento?: string;
  ementa?: string;
  possuiEmenta?: string;
}

export interface FalcaoApiResponse {
  documentos?: FalcaoDocumento[];
  userMessage?: string;
}

export interface FalcaoResultado {
  numeroProcesso?: string;
  tribunalSigla?: string;
  orgaoJulgador?: string;
  relator?: string;
  dataJulgamento?: Date;
  ementa?: string;
}

/**
 * O FALCÃO (`jurisprudencia.jt.jus.br`) é um repositório NACIONAL —
 * cada busca já devolve documentos de vários tribunais numa resposta só
 * (`tribunal: "TRT3"`, `"TST"`, `"CSJT"`, etc.), diferente de todos os
 * outros adapters (que são 1 tribunal por vez). A ementa vem em HTML
 * com entidades nomeadas — usamos cheerio pra extrair o texto puro.
 */
export function parseResultadosFalcao(json: FalcaoApiResponse): FalcaoResultado[] {
  const documentos = json.documentos ?? [];

  return documentos.map((d) => ({
    numeroProcesso: d.numeroProcesso,
    tribunalSigla: d.tribunal,
    orgaoJulgador: [d.turma, d.gabinete].filter(Boolean).join(' - ') || undefined,
    relator: d.relator,
    dataJulgamento: parseDataBr(d.dataJulgamento),
    ementa: extrairTexto(d.ementa),
  }));
}

function extrairTexto(html?: string): string | undefined {
  if (!html) return undefined;
  const $ = cheerio.load(html);
  $('style, script').remove();
  const texto = $.root().text().replace(/\s+/g, ' ').trim();
  return texto || undefined;
}

function parseDataBr(data?: string): Date | undefined {
  if (!data) return undefined;
  const m = data.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return undefined;
  const [, dd, mm, yyyy] = m;
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
}
