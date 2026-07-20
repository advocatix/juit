export interface TjpaApiItem {
  numeroprocesso?: string;
  tipo?: string;
  classe?: { nome?: string };
  orgaojulgador?: { nome?: string };
  orgaojulgadorcolegiado?: { nome?: string };
  datajulgamento?: string;
  datapublicacao?: string | null;
  ementatextopuro?: string;
}

export interface TjpaApiResponse {
  message: string;
  data: {
    content: TjpaApiItem[];
    totalElements: number;
  };
}

export interface TjpaResultado {
  numeroProcesso?: string;
  classeProcessual?: string;
  relator?: string;
  orgaoJulgador?: string;
  dataJulgamento?: Date;
  dataPublicacao?: Date;
  ementa?: string;
}

/**
 * API JSON nativa (`bff/api/decisoes/buscar`) do "Banco de
 * Jurisprudência" do TJPA — sistema novo, lançado em 2026, substitui
 * o antigo serviço 100% manual (pedido por e-mail, 72h, 2/dia) que
 * tinha feito o TJPA ser descartado. Resposta já vem estruturada,
 * `ementatextopuro` sem HTML/highlight — não precisa de parser HTML.
 */
export function parseResultadosTjpa(resp: TjpaApiResponse): TjpaResultado[] {
  return resp.data.content
    .filter((item) => item.ementatextopuro)
    .map((item) => ({
      numeroProcesso: item.numeroprocesso,
      classeProcessual: item.classe?.nome,
      relator: item.orgaojulgador?.nome,
      orgaoJulgador: item.orgaojulgadorcolegiado?.nome,
      dataJulgamento: parseDataIso(item.datajulgamento),
      dataPublicacao: parseDataIso(item.datapublicacao ?? undefined),
      ementa: item.ementatextopuro,
    }));
}

function parseDataIso(data?: string): Date | undefined {
  if (!data) return undefined;
  const d = new Date(data);
  return Number.isNaN(d.getTime()) ? undefined : d;
}
