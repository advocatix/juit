import * as cheerio from 'cheerio';

export interface TjscResultado {
  numeroProcesso?: string;
  orgaoJulgador?: string;
  relator?: string;
  dataJulgamento?: Date;
  ementa?: string;
}

/**
 * Parseia o fragmento AJAX retornado por `buscaajax.do` (TJSC). Container
 * limpo por resultado (`div.resultados`), verificado ao vivo em
 * 2026-07-18. Diferente de todos os outros tribunais até agora, este
 * endpoint não tem CAPTCHA nem exige sessão de browser — dá pra chamar
 * via HTTP puro (ver tjsc-busca.adapter.ts).
 */
export function parseResultadosTjsc(html: string): TjscResultado[] {
  const $ = cheerio.load(html);
  const resultados: TjscResultado[] = [];

  $('div.resultados').each((_, row) => {
    const $row = $(row);
    const texto = $row.text();

    const processoMatch = texto.match(/Processo:\s*([\d.\-]+)/);
    const relatorMatch = texto.match(/Relator:\s*([^\n]+?)(?:\s*Origem:|\s*Orgão Julgador:|$)/);
    const orgaoMatch = texto.match(/Orgão Julgador:\s*([^\n]+?)(?:\s*Julgado em:|$)/);
    const dataMatch = texto.match(/Julgado em:\s*(\d{2}\/\d{2}\/\d{4})/);

    const ementa = normalizarEspacos($row.find('textarea[id^="text_ementa_"]').first().text());

    if (!processoMatch && !ementa) return;

    resultados.push({
      numeroProcesso: processoMatch?.[1],
      relator: relatorMatch ? normalizarEspacos(relatorMatch[1]) : undefined,
      orgaoJulgador: orgaoMatch ? normalizarEspacos(orgaoMatch[1]) : undefined,
      dataJulgamento: parseDataBr(dataMatch?.[1]),
      ementa: ementa || undefined,
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
