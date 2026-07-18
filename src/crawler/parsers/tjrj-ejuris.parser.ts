export interface TjrjResultado {
  numeroProcesso?: string;
  orgaoJulgador?: string;
  relator?: string;
  dataJulgamento?: Date;
  dataPublicacao?: Date;
  ementa?: string;
  urlOrigem?: string;
}

/**
 * Parseia a página de resultados do e-JURIS (TJRJ). Selectors/regex
 * verificados ao vivo em 2026-07-18 contra
 * `www3.tjrj.jus.br/EJURIS/ProcessarConsJurisES.aspx` — diferente do
 * CJSG (TJSP) e do SCON (STJ), o HTML do e-JURIS não tem um container
 * limpo por resultado (é uma sequência de <tr> soltos, resquício de
 * relatório ASP.NET antigo), então em vez de cheerio usamos regex
 * ancorado no link `ConsultaProcesso.aspx?N=` — o único elemento
 * consistentemente bem formado que marca o início de cada resultado.
 * Lista vazia é tratada como "sem mais páginas" pelo TjrjEjurisAdapter.
 */
export function parseResultadosTjrj(html: string): TjrjResultado[] {
  const indicesBloco: number[] = [];
  const marcador = /ConsultaProcesso\.aspx\?N=/g;
  let m: RegExpExecArray | null;
  while ((m = marcador.exec(html))) indicesBloco.push(m.index);

  const resultados: TjrjResultado[] = [];
  for (let i = 0; i < indicesBloco.length; i++) {
    const inicio = indicesBloco[i];
    const fim = i + 1 < indicesBloco.length ? indicesBloco[i + 1] : html.length;
    const item = parseBloco(html.slice(inicio, fim));
    if (item) resultados.push(item);
  }
  return resultados;
}

function parseBloco(bloco: string): TjrjResultado | null {
  const processoMatch = bloco.match(/N=[^"]*">([^<]+)<\/a>\s*<\/b>\s*-\s*([^<]+?)\s*<\/td>/);
  const relatorMatch = bloco.match(
    /ª Ementa<\/b><\/td><\/tr>\s*<tr><td>\s*(?:Des\(a\)\.?|Des\.|Min\.)?\s*([^-]+?)\s*-\s*Julgamento:\s*(\d{2}\/\d{2}\/\d{4})\s*-\s*([^<]+?)\s*<\/td>/,
  );
  const ementaMatch = bloco.match(/Conteúdo da ementa[^>]*-->\s*<tr><td[^>]*>([\s\S]*?)<\/td><\/tr>/);
  const inteiroTeorMatch = bloco.match(
    /<a href="(https:\/\/www3\.tjrj\.jus\.br\/gedcacheweb\/[^"]+)"[^>]*>[^<]*Acórdão<\/a>\s*-\s*Data de Julgamento:\s*(\d{2}\/\d{2}\/\d{4})\s*-\s*Data de Publicação:\s*(\d{2}\/\d{2}\/\d{4})/,
  );

  if (!processoMatch && !ementaMatch) return null;

  return {
    numeroProcesso: processoMatch?.[1]?.trim(),
    relator: relatorMatch?.[1]?.trim(),
    orgaoJulgador: relatorMatch?.[3]?.trim(),
    dataJulgamento: parseDataBr(inteiroTeorMatch?.[2] ?? relatorMatch?.[2]),
    dataPublicacao: parseDataBr(inteiroTeorMatch?.[3]),
    ementa: ementaMatch ? limparHtml(ementaMatch[1]) : undefined,
    urlOrigem: inteiroTeorMatch?.[1] ? decodificarEntidadesUrl(inteiroTeorMatch[1]) : undefined,
  };
}

function decodificarEntidadesUrl(url: string): string {
  return url.replace(/&amp;/g, '&');
}

function limparHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDataBr(data?: string): Date | undefined {
  if (!data) return undefined;
  const match = data.trim().match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return undefined;
  const [, dd, mm, yyyy] = match;
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
}
