export interface TjesDoc {
  nr_processo?: string;
  orgao_julgador?: string;
  magistrado?: string;
  dt_juntada?: string;
  ementa?: string;
}

export interface TjesApiResponse {
  docs?: TjesDoc[];
  total?: number;
}

export interface TjesResultado {
  numeroProcesso?: string;
  orgaoJulgador?: string;
  relator?: string;
  dataJulgamento?: Date;
  ementa?: string;
}

/**
 * O TJES responde via REST JSON nativo (proxy próprio sobre Solr) — sem
 * HTML pra parsear. Endpoint descoberto ao vivo em 2026-07-19 contra
 * `sistemas.tjes.jus.br/consulta-jurisprudencia/api/search`. Usa o core
 * `pje2g` (2º grau/acórdãos) — os cores `pje2g_mono` (monocráticas) e
 * `pje1g` (1º grau) existem mas não servem como jurisprudência citável.
 */
export function parseResultadosTjes(json: TjesApiResponse): TjesResultado[] {
  const docs = json.docs ?? [];

  return docs.map((d) => ({
    numeroProcesso: d.nr_processo,
    orgaoJulgador: d.orgao_julgador,
    relator: d.magistrado,
    dataJulgamento: parseDataIso(d.dt_juntada),
    ementa: d.ementa?.trim(),
  }));
}

function parseDataIso(data?: string): Date | undefined {
  if (!data) return undefined;
  const d = new Date(data);
  return isNaN(d.getTime()) ? undefined : d;
}
