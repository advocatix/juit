import * as cheerio from 'cheerio';

export interface TjmgResultado {
  numeroProcesso?: string;
  classeProcessual?: string;
  relator?: string;
  dataJulgamento?: Date;
  dataPublicacao?: Date;
  ementa?: string;
}

/**
 * O "Espelho de Acórdão" do TJMG lista cada resultado como um bloco
 * `div.caixa_processo` (link com classe + os dois números do processo)
 * seguido de irmãos soltos (não agrupados num container comum): tabela
 * do relator, dois `div.corpo` de data e um `div.corpo` da ementa.
 * `.nextUntil('.caixa_processo')` recolhe exatamente esse intervalo.
 */
export function parseResultadosTjmg(html: string): TjmgResultado[] {
  const $ = cheerio.load(html);
  const itens: TjmgResultado[] = [];

  $('.caixa_processo').each((_, el) => {
    const $caixa = $(el);
    const linkTexto = normalizarEspacos($caixa.find('a').first().clone().find('div').remove().end().text());
    const classeMatch = linkTexto.match(/Processo:\s*(.+)$/);
    const classeProcessual = classeMatch ? classeMatch[1].trim() : undefined;

    const numeros = $caixa
      .find('a > div')
      .map((__, d) => $(d).text().trim())
      .get();
    const numeroProcesso = numeros[1] ? numeros[1].replace(/\s*\(\d+\)\s*$/, '').trim() : undefined;

    const resto = $caixa.nextUntil('.caixa_processo');

    let relator: string | undefined;
    let dataJulgamento: Date | undefined;
    let dataPublicacao: Date | undefined;
    let ementa: string | undefined;

    resto.each((__, r) => {
      const $r = $(r);
      const texto = $r.text();
      if (/Relator/i.test(texto) && $r.find('strong').length) {
        relator = texto.replace(/^\s*Relator\(a\):\s*/i, '').trim() || undefined;
      } else if (texto.includes('Data de Julgamento:')) {
        dataJulgamento = parseDataBr(texto);
      } else if (texto.includes('Data da publicação')) {
        dataPublicacao = parseDataBr(texto);
      } else if (texto.includes('Ementa:')) {
        ementa = extrairEmenta($r);
      }
    });

    if (!ementa) return;

    itens.push({ numeroProcesso, classeProcessual, relator, dataJulgamento, dataPublicacao, ementa });
  });

  return itens;
}

/** A ementa vem com `<br>` como separador de linha e trechos de
 *  destaque do termo buscado em `<font color="#FF0000"><b>` — ambos
 *  somem no `.text()`, só precisamos converter `<br>` em quebra real
 *  antes de extrair, senão as linhas grudam sem espaço. */
function extrairEmenta($el: any): string {
  const html = $el.html() ?? '';
  const semLabel = html.replace(/<strong>\s*Ementa:\s*<\/strong>/i, '');
  const comQuebras = semLabel.replace(/<br\s*\/?>/gi, '\n');
  const texto = cheerio.load(`<div>${comQuebras}</div>`)('div').text();
  return texto
    .split('\n')
    .map((linha) => linha.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

function normalizarEspacos(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim();
}

function parseDataBr(texto: string): Date | undefined {
  const m = texto.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return undefined;
  const [, dd, mm, yyyy] = m;
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
}
