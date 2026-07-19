import * as cheerio from 'cheerio';

export interface TjprResultado {
  numeroProcesso?: string;
  orgaoJulgador?: string;
  relator?: string;
  dataJulgamento?: Date;
  ementa?: string;
  urlOrigem?: string;
}

/**
 * Parseia a página de resultados do portal de jurisprudência do TJPR.
 * Selectors verificados ao vivo em 2026-07-18 contra
 * `portal.tjpr.jus.br/jurisprudencia/publico/pesquisa.do` — container
 * por resultado é limpo (`tr.even`/`tr.odd`), diferente do TJRJ.
 *
 * A ementa vem truncada (o site carrega o texto completo via AJAX ao
 * clicar em "Leia mais.."); usamos o trecho truncado por enquanto —
 * ainda é substancial, e buscar o texto completo exigiria uma
 * requisição extra por item.
 */
export function parseResultadosTjpr(html: string): TjprResultado[] {
  const $ = cheerio.load(html);
  const resultados: TjprResultado[] = [];

  $('tr.even, tr.odd').each((_, row) => {
    const $row = $(row);
    const linkProcesso = $row.find('a.acordao.negrito').first();
    if (!linkProcesso.length) return;

    const numeroProcesso = normalizarEspacos(linkProcesso.text());
    const urlOrigem = linkProcesso.attr('href');

    const blocoPropriedades = $row.find('.juris-tabela-propriedades');
    const textoPropriedades = blocoPropriedades.text();

    const relatorMatch = textoPropriedades.match(/Relator:\s*([^\n]+)/i);
    const orgaoMatch = textoPropriedades.match(/Órgão Julgador:\s*([^\n]+)/i);
    const dataMatch = textoPropriedades.match(/Data Julgamento:\s*(\d{2}\/\d{2}\/\d{4})/i);

    const ementaDiv = $row.find('[id^="ementa"]').first();
    const ementa = normalizarEspacos(ementaDiv.text());

    resultados.push({
      numeroProcesso: numeroProcesso || undefined,
      relator: relatorMatch ? normalizarEspacos(relatorMatch[1]) : undefined,
      orgaoJulgador: orgaoMatch ? normalizarEspacos(orgaoMatch[1]) : undefined,
      dataJulgamento: parseDataBr(dataMatch?.[1]),
      ementa: ementa || undefined,
      urlOrigem: urlOrigem ? `https://portal.tjpr.jus.br${urlOrigem.startsWith('/') ? '' : '/'}${urlOrigem}` : undefined,
    });
  });

  return resultados;
}

function normalizarEspacos(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim();
}

function parseDataBr(data?: string): Date | undefined {
  if (!data) return undefined;
  const match = data.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return undefined;
  const [, dd, mm, yyyy] = match;
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
}
