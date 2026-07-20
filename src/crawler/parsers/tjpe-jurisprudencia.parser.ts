import * as cheerio from 'cheerio';

export interface TjpeResultado {
  numeroProcesso?: string;
  classeProcessual?: string;
  assunto?: string;
  relator?: string;
  orgaoJulgador?: string;
  dataJulgamento?: Date;
  dataPublicacao?: Date;
  ementa?: string;
}

/**
 * Cada resultado é uma `table.tableDocumento` com pares
 * label/valor em linhas alternadas (`<label>Campo</label>` numa
 * linha, o valor na linha seguinte) — Processo, Classe CNJ, Assunto
 * CNJ, Relator(a), Órgão Julgador, Data de Julgamento, Data da
 * Publicação/Fonte, Ementa, Acórdão (inteiro teor, não usado aqui —
 * repete a ementa e tem ruído de timbre/paginação), Meio de
 * Tramitação. O campo "Processo" tem dois números na mesma célula
 * separados por `<br>` (o antigo e o CNJ) — extrai o CNJ via regex
 * depois de converter `<br>` em quebra real, senão os dois números
 * grudam sem separador no `.text()`.
 */
export function parseResultadosTjpe(html: string): TjpeResultado[] {
  const $ = cheerio.load(html);
  const itens: TjpeResultado[] = [];

  $('table.tableDocumento').each((_, el) => {
    const $table = $(el);
    const campos: Record<string, string> = {};
    let labelAtual: string | null = null;

    $table.find('tr').each((__, row) => {
      const $row = $(row);
      const label = $row.find('label').first();
      if (label.length) {
        labelAtual = normalizarEspacos(label.text());
        return;
      }
      if (labelAtual) {
        campos[labelAtual] = textoComQuebras($row.find('td').first());
        labelAtual = null;
      }
    });

    const ementa = normalizarEspacos(campos['Ementa'] ?? '');
    if (!ementa) return;

    itens.push({
      numeroProcesso: extrairNumeroCNJ(campos['Processo']),
      classeProcessual: normalizarEspacos(campos['Classe CNJ'] ?? '') || undefined,
      assunto: normalizarEspacos(campos['Assunto CNJ'] ?? '') || undefined,
      relator: normalizarEspacos(campos['Relator(a)'] ?? '') || undefined,
      orgaoJulgador: normalizarEspacos(campos['Órgão Julgador'] ?? '') || undefined,
      dataJulgamento: parseDataBr(campos['Data de Julgamento']),
      dataPublicacao: parseDataBr(campos['Data da Publicação/Fonte']),
      ementa,
    });
  });

  return itens;
}

function textoComQuebras($el: any): string {
  const html = $el.html() ?? '';
  const comQuebras = html.replace(/<br\s*\/?>/gi, '\n');
  return cheerio.load(`<div>${comQuebras}</div>`)('div').text();
}

function extrairNumeroCNJ(processoTexto?: string): string | undefined {
  if (!processoTexto) return undefined;
  const match = processoTexto.match(/(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/);
  return match ? match[1] : undefined;
}

function normalizarEspacos(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim();
}

function parseDataBr(texto?: string): Date | undefined {
  if (!texto) return undefined;
  const m = texto.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return undefined;
  const [, dd, mm, yyyy] = m;
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
}
