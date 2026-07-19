export interface TjpbRegistro {
  numeroProcesso?: string;
  orgao?: string;
  relator?: string;
  dataJulgamento?: string;
  ementa?: string;
}

export interface TjpbApiResponse {
  content?: TjpbRegistro[];
  totalElements?: number;
  totalPages?: number;
}

export interface TjpbResultado {
  numeroProcesso?: string;
  orgaoJulgador?: string;
  relator?: string;
  dataJulgamento?: Date;
  ementa?: string;
}

/**
 * O TJPB (JurisPB, sistema novo) responde via REST JSON nativo — sem
 * HTML pra parsear. Endpoint descoberto ao vivo em 2026-07-18 contra
 * `app.tjpb.jus.br/juris-pb-backend/public/search`.
 */
export function parseResultadosTjpb(json: TjpbApiResponse): TjpbResultado[] {
  const content = json.content ?? [];

  return content.map((r) => ({
    numeroProcesso: r.numeroProcesso,
    orgaoJulgador: r.orgao,
    relator: r.relator,
    dataJulgamento: parseDataIso(r.dataJulgamento),
    ementa: r.ementa?.trim(),
  }));
}

function parseDataIso(data?: string): Date | undefined {
  if (!data) return undefined;
  const d = new Date(data);
  return isNaN(d.getTime()) ? undefined : d;
}
