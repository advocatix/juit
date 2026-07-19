export interface TjmtProcesso {
  DataJulgamento?: string;
  DataPublicacao?: string;
  NumeroUnicoFormatado?: string;
  DescricaoCamara?: string;
  NomeRelator?: string;
}

export interface TjmtDocumento {
  Conteudo?: string;
  Processo?: TjmtProcesso;
}

export interface TjmtApiResponse {
  AcordaoCollection?: TjmtDocumento[];
  CountAcordaoDocumento?: number;
}

export interface TjmtResultado {
  numeroProcesso?: string;
  orgaoJulgador?: string;
  relator?: string;
  dataJulgamento?: Date;
  dataPublicacao?: Date;
  ementa?: string;
}

/**
 * O TJMT (Portal Jurisprudência) responde via REST JSON nativo — sem
 * HTML pra parsear, mas exige um header `token` fixo (embutido no
 * bundle JS do frontend, não é segredo por-usuário — qualquer browser
 * que carrega a página o envia). Endpoint e token descobertos ao vivo
 * em 2026-07-18 contra `hellsgate-preview.tjmt.jus.br`.
 */
export function parseResultadosTjmt(json: TjmtApiResponse): TjmtResultado[] {
  const docs = json.AcordaoCollection ?? [];

  return docs.map((d) => ({
    numeroProcesso: d.Processo?.NumeroUnicoFormatado,
    orgaoJulgador: d.Processo?.DescricaoCamara,
    relator: d.Processo?.NomeRelator,
    dataJulgamento: parseDataIso(d.Processo?.DataJulgamento),
    dataPublicacao: parseDataIso(d.Processo?.DataPublicacao),
    ementa: limparHtml(d.Conteudo),
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
