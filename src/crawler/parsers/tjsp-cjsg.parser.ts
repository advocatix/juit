import * as cheerio from 'cheerio';

export interface TjspCjsgResultado {
  numeroProcesso?: string;
  orgaoJulgador?: string;
  relator?: string;
  comarca?: string;
  classeAssunto?: string;
  dataJulgamento?: Date;
  dataPublicacao?: Date;
  ementa?: string;
  cdAcordao?: string;
}

/**
 * Parseia a página de resultados do CJSG (TJSP). Selectors verificados
 * ao vivo em 2026-07-18 contra `esaj.tjsp.jus.br/cjsg/resultadoCompleta.do`
 * — este HTML não é documentado publicamente, então se o TJSP mudar o
 * layout isto quebra silenciosamente (retorna lista vazia). O
 * TjspCjsgAdapter trata lista vazia como "sem mais páginas", então uma
 * mudança de layout se manifesta como "parou de coletar", não como erro.
 */
export function parseResultadosCjsg(html: string): TjspCjsgResultado[] {
  const $ = cheerio.load(html);
  const resultados: TjspCjsgResultado[] = [];

  $('tr.fundocinza1').each((_, row) => {
    const $row = $(row);

    const linkProcesso = $row.find('a.esajLinkLogin.downloadEmenta').first();
    const numeroProcesso = normalizarEspacos(linkProcesso.text());
    const cdAcordao = linkProcesso.attr('cdacordao');

    const campos: Record<string, string> = {};
    $row.find('tr.ementaClass2').each((__, campoRow) => {
      const $campoRow = $(campoRow);
      const label = normalizarEspacos($campoRow.find('strong').first().text()).replace(/:$/, '');
      if (!label) return;
      // Remove o <strong> do label para sobrar só o valor no texto do <td>
      const valor = normalizarEspacos($campoRow.find('td').first().clone().children('strong').remove().end().text());
      campos[label] = valor;
    });

    // A ementa completa fica no segundo `div[align="justify"]` (a versão
    // escondida usada pelo "mostrar mais"); a primeira pode vir truncada.
    const divsEmenta = $row.find('div[align="justify"]');
    const ementaBruta = divsEmenta.length > 1 ? divsEmenta.eq(1).text() : divsEmenta.eq(0).text();
    const ementa = normalizarEspacos(ementaBruta).replace(/^Ementa:\s*/, '');

    if (!numeroProcesso && !ementa) return;

    resultados.push({
      numeroProcesso: numeroProcesso || undefined,
      orgaoJulgador: campos['Órgão julgador'] || undefined,
      relator: campos['Relator(a)'] || undefined,
      comarca: campos['Comarca'] || undefined,
      classeAssunto: campos['Classe/Assunto'] || undefined,
      dataJulgamento: parseDataBr(campos['Data do julgamento']),
      dataPublicacao: parseDataBr(campos['Data de publicação']),
      ementa: ementa || undefined,
      cdAcordao,
    });
  });

  return resultados;
}

function normalizarEspacos(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim();
}

function parseDataBr(data?: string): Date | undefined {
  if (!data) return undefined;
  const match = data.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return undefined;
  const [, dd, mm, yyyy] = match;
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
}
