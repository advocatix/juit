export interface TjceDocumento {
  numeroProcesso?: string;
  orgaoJulgador?: string;
  magistrado?: string;
  /** Serialização Java de LocalDate: [ano, mes(1-indexado), dia]. */
  dataJulgamento?: number[];
  ementa?: string;
}

export interface TjceApiResponse {
  pagina?: {
    content: TjceDocumento[];
    totalElements: number;
  };
}

export interface TjceResultado {
  numeroProcesso?: string;
  orgaoJulgador?: string;
  relator?: string;
  dataJulgamento?: Date;
  ementa?: string;
}

/**
 * O TJCE (SJURIS, sistema novo lançado out/2023) responde via REST JSON
 * nativo — sem HTML pra parsear. Endpoint descoberto ao vivo em
 * 2026-07-19 contra `gateway.tjce.jus.br/sjuris/api/v1/jurisprudencia`.
 */
export function parseResultadosTjce(json: TjceApiResponse): TjceResultado[] {
  const content = json.pagina?.content ?? [];

  return content.map((d) => ({
    numeroProcesso: d.numeroProcesso,
    orgaoJulgador: d.orgaoJulgador,
    relator: d.magistrado,
    dataJulgamento: parseDataArray(d.dataJulgamento),
    ementa: limparHtml(d.ementa),
  }));
}

function limparHtml(html?: string): string | undefined {
  if (!html) return undefined;
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDataArray(arr?: number[]): Date | undefined {
  if (!arr || arr.length < 3) return undefined;
  const [ano, mes, dia] = arr;
  return new Date(ano, mes - 1, dia);
}
