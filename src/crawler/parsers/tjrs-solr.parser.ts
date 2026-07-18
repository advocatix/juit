export interface TjrsDoc {
  numero_processo?: string;
  orgao_julgador?: string;
  nome_relator?: string;
  data_julgamento?: string;
  data_publicacao?: string;
  ementa_completa?: string[];
  nome_assunto_cnj?: string;
}

export interface TjrsSolrResponse {
  response?: {
    numFound: number;
    docs: TjrsDoc[];
  };
}

export interface TjrsResultado {
  numeroProcesso?: string;
  orgaoJulgador?: string;
  relator?: string;
  dataJulgamento?: Date;
  dataPublicacao?: Date;
  ementa?: string;
  assuntoCnj?: string;
}

/**
 * O TJRS responde em Solr JSON nativo — sem HTML pra parsear. Verificado
 * ao vivo em 2026-07-18 contra
 * `www.tjrs.jus.br/buscas/jurisprudencia/ajax.php`.
 */
export function parseResultadosTjrs(json: TjrsSolrResponse): TjrsResultado[] {
  const docs = json.response?.docs ?? [];

  return docs.map((doc) => ({
    numeroProcesso: doc.numero_processo,
    orgaoJulgador: doc.orgao_julgador,
    relator: doc.nome_relator,
    dataJulgamento: parseDataIso(doc.data_julgamento),
    dataPublicacao: parseDataIso(doc.data_publicacao),
    ementa: doc.ementa_completa?.[0]?.trim(),
    assuntoCnj: doc.nome_assunto_cnj,
  }));
}

function parseDataIso(data?: string): Date | undefined {
  if (!data) return undefined;
  const d = new Date(data);
  return isNaN(d.getTime()) ? undefined : d;
}
