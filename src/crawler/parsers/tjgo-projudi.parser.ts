import * as cheerio from 'cheerio';

export interface TjgoResultado {
  numeroProcesso?: string;
  orgaoJulgador?: string;
  relator?: string;
  dataPublicacao?: Date;
  ementa?: string;
}

/**
 * O Novo Módulo de Pesquisa de Jurisprudência do PROJUDI/TJGO lista
 * cada resultado como um `div.search-result`: `<h4>` com o número do
 * processo (primeiro nó de texto, antes dos links de download/copiar),
 * três `<p><b>` seguidos (câmara, relator, tipo de decisão), um
 * `<p><b><i>Publicado em dd/mm/aaaa HH:MM:SS</i></b></p>`, e um
 * `<p class="conteudoTexto">` com o conteúdo (timbre + qualificação
 * das partes + ementa, tudo concatenado sem separador) — a ementa de
 * fato começa no marcador "Ementa:", que usamos como corte.
 */
export function parseResultadosTjgo(html: string): TjgoResultado[] {
  const $ = cheerio.load(html);
  const itens: TjgoResultado[] = [];

  $('div.search-result').each((_, el) => {
    const $item = $(el);

    const numeroProcesso = normalizarEspacos($item.find('h4').first().contents().first().text()) || undefined;

    const paragrafosB = $item.find('> p > b, > p > b > i').map((__, b) => normalizarEspacos($(b).text())).get();
    const orgaoJulgador = paragrafosB[0] || undefined;
    const relator = paragrafosB[1] ? paragrafosB[1].replace(/\s*-\s*\([^)]*\)\s*$/, '').trim() : undefined;

    const publicadoTexto = $item
      .find('p')
      .filter((__, p) => /Publicado em/i.test($(p).text()))
      .first()
      .text();
    const dataPublicacao = parseDataHoraBr(publicadoTexto);

    const conteudo = $item.find('p.conteudoTexto').first().text();
    const ementa = extrairEmenta(conteudo);
    if (!ementa) return;

    itens.push({ numeroProcesso, orgaoJulgador, relator, dataPublicacao, ementa });
  });

  return itens;
}

/** Só decisões de 2º grau (acórdãos/decisões monocráticas de
 *  Desembargador) vêm com o marcador "Ementa:" — sentenças de 1º
 *  grau não têm esse padrão e trazem só o texto bruto com
 *  timbre/endereço da vara, sem valor de precedente. Descartadas. */
function extrairEmenta(texto: string): string | undefined {
  const idx = texto.indexOf('Ementa:');
  if (idx < 0) return undefined;
  return normalizarEspacos(texto.slice(idx));
}

function normalizarEspacos(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim();
}

function parseDataHoraBr(texto?: string): Date | undefined {
  if (!texto) return undefined;
  const m = texto.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return undefined;
  const [, dd, mm, yyyy] = m;
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
}
