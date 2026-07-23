export interface TjbaDecisao {
  numeroProcesso?: string;
  orgaoJulgador?: { nome?: string };
  relator?: { nome?: string };
  dataPublicacao?: string;
  dataJulgamento?: string;
  ementa?: string;
}

export interface TjbaGraphqlResponse {
  data?: {
    filter?: {
      decisoes: TjbaDecisao[];
      itemCount: number;
      pageCount: number;
    };
  };
  errors?: { message?: string }[];
}

export interface TjbaResultado {
  numeroProcesso?: string;
  orgaoJulgador?: string;
  relator?: string;
  dataPublicacao?: Date;
  dataJulgamento?: Date;
  ementa?: string;
}

/**
 * O TJBA responde via GraphQL nativo — sem HTML pra parsear. Endpoint e
 * schema descobertos ao vivo em 2026-07-18 inspecionando as chamadas de
 * rede reais do browser contra `jurisprudencia.tjba.jus.br`.
 */
export function parseResultadosTjba(json: TjbaGraphqlResponse): TjbaResultado[] {
  const decisoes = json.data?.filter?.decisoes ?? [];

  return decisoes.map((d) => ({
    numeroProcesso: d.numeroProcesso,
    orgaoJulgador: d.orgaoJulgador?.nome,
    relator: d.relator?.nome,
    dataPublicacao: parseDataIso(d.dataPublicacao),
    dataJulgamento: parseDataIso(d.dataJulgamento),
    ementa: d.ementa?.trim(),
  }));
}

function parseDataIso(data?: string): Date | undefined {
  if (!data) return undefined;
  const d = new Date(data);
  return isNaN(d.getTime()) ? undefined : d;
}
