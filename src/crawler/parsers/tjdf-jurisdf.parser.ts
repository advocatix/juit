export interface TjdfRegistro {
  processo?: string;
  descricaoOrgaoJulgador?: string;
  nomeRelator?: string;
  dataJulgamento?: string;
  dataPublicacao?: string;
  ementa?: string;
}

export interface TjdfApiResponse {
  hits?: { value: number };
  registros?: TjdfRegistro[];
}

export interface TjdfResultado {
  numeroProcesso?: string;
  orgaoJulgador?: string;
  relator?: string;
  dataJulgamento?: Date;
  dataPublicacao?: Date;
  ementa?: string;
}

/**
 * O TJDFT (JurisDF, sistema novo lançado out/2024) responde via REST
 * JSON nativo — sem HTML pra parsear. Endpoint descoberto ao vivo em
 * 2026-07-18 contra `jurisdf.tjdft.jus.br/api/v1/pesquisa`.
 */
export function parseResultadosTjdf(json: TjdfApiResponse): TjdfResultado[] {
  const registros = json.registros ?? [];

  return registros.map((r) => ({
    numeroProcesso: r.processo,
    orgaoJulgador: r.descricaoOrgaoJulgador,
    relator: r.nomeRelator,
    dataJulgamento: parseDataIso(r.dataJulgamento),
    dataPublicacao: parseDataIso(r.dataPublicacao),
    ementa: r.ementa?.trim(),
  }));
}

function parseDataIso(data?: string): Date | undefined {
  if (!data) return undefined;
  const d = new Date(data);
  return isNaN(d.getTime()) ? undefined : d;
}
