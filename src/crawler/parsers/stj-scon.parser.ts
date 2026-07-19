import * as cheerio from 'cheerio';

export interface StjSconResultado {
  numeroProcesso?: string;
  orgaoJulgador?: string;
  relator?: string;
  dataJulgamento?: Date;
  dataPublicacao?: Date;
  tese?: string;
  ementa?: string;
}

/**
 * Parseia a página de resultados do SCON (STJ). Selectors verificados ao
 * vivo em 2026-07-18 contra `scon.stj.jus.br/SCON/pesquisar.jsp` — assim
 * como o CJSG do TJSP, este HTML não é documentado publicamente e pode
 * mudar sem aviso; lista vazia é tratada como "sem mais páginas" pelo
 * StjSconAdapter, então uma mudança de layout se manifesta como "parou
 * de coletar", não como erro.
 */
export function parseResultadosScon(html: string): StjSconResultado[] {
  const $ = cheerio.load(html);
  const resultados: StjSconResultado[] = [];

  $('div.documento').each((_, doc) => {
    const $doc = $(doc);
    const campos: Record<string, string> = {};

    $doc.find('.paragrafoBRS').each((__, bloco) => {
      const $bloco = $(bloco);
      const label = normalizarEspacos(
        $bloco.find('.docTitulo').first().clone().find('.hint, i').remove().end().text(),
      );
      if (!label) return;
      const valor = textoComQuebrasDeLinha($bloco.find('.docTexto').first());
      campos[label] = valor;
    });

    if (!Object.keys(campos).length) return;

    const numeroProcesso = (campos['Processo'] ?? '').split('\n')[0]?.trim() || undefined;

    resultados.push({
      numeroProcesso,
      relator: limparRelator(campos['Relator']),
      orgaoJulgador: campos['Órgão Julgador'] || undefined,
      dataJulgamento: parseDataBr(campos['Data do Julgamento']),
      dataPublicacao: parseDataPublicacao(campos['Data da Publicação/Fonte']),
      tese: campos['Tese Jurídica'] || undefined,
      ementa: campos['Ementa'] || undefined,
    });
  });

  return resultados;
}

/** `.docTexto` costuma ter `<br>` como separador de linha — `.text()` puro
 *  do cheerio concatena sem espaço, grudando palavras. */
function textoComQuebrasDeLinha($el: any): string {
  const html = $el.html() ?? '';
  const comQuebras = html.replace(/<br\s*\/?>/gi, '\n');
  const texto = cheerio.load(`<div>${comQuebras}</div>`)('div').text();
  return normalizarEspacosPreservandoQuebras(texto);
}

function normalizarEspacos(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim();
}

function normalizarEspacosPreservandoQuebras(texto: string): string {
  return texto
    .split('\n')
    .map((linha) => linha.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

function limparRelator(relator?: string): string | undefined {
  if (!relator) return undefined;
  // Vem como "Ministro FULANO DE TAL (1141)" — o número entre parênteses
  // é um código interno do STJ, sem valor fora do próprio sistema.
  return relator.replace(/\s*\(\d+\)\s*$/, '').trim() || undefined;
}

function parseDataBr(data?: string): Date | undefined {
  if (!data) return undefined;
  const match = data.trim().match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return undefined;
  const [, dd, mm, yyyy] = match;
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
}

function parseDataPublicacao(campo?: string): Date | undefined {
  // Formato: "DJe 17/03/2021" ou similar — extrai a primeira data dd/mm/aaaa.
  return parseDataBr(campo);
}
