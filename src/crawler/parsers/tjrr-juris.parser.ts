import * as cheerio from 'cheerio';

export interface TjrrResultado {
  numeroProcesso?: string;
  orgaoJulgador?: string;
  relator?: string;
  dataJulgamento?: Date;
  ementa?: string;
}

/**
 * O Juris do TJRR (PrimeFaces/JSF) organiza cada resultado como uma
 * linha `tr[data-ri]` de uma `ui-datatable`, com pares
 * `.docTitulo`/`.docTexto` (PROCESSO, RELATOR, ÓRGÃO JULGADOR, DATA DO
 * JULGAMENTO, DATA DA PUBLICAÇÃO, EMENTA). O número do processo (sem
 * formatação) também aparece no `onclick` do botão "Consulta
 * Processual" (`extrato-processo?p=<20 digitos>`), de onde extraímos e
 * formatamos no padrão CNJ.
 */
export function parseResultadosTjrr(html: string): TjrrResultado[] {
  const $ = cheerio.load(html);
  const itens: TjrrResultado[] = [];

  // A página pré-renderiza as duas abas (Acórdãos e Decisão
  // Monocrática) no mesmo DOM, só escondendo a inativa via CSS — sem
  // escopar pela aba visível, misturaríamos as duas categorias.
  $('.ui-tabs-panel:not(.ui-helper-hidden) tr[data-ri]').each((_, el) => {
    const $row = $(el);
    const rowHtml = $row.html() ?? '';

    const numeroMatch = rowHtml.match(/extrato-processo\?p=(\d{20})/);
    const numeroProcesso = numeroMatch ? formatarNumeroProcesso(numeroMatch[1]) : undefined;

    const campos: Record<string, string> = {};
    $row.find('.docParagrafo').each((__, par) => {
      const $par = $(par);
      const titulo = $par.find('.docTitulo').first().text().trim().replace(/:$/, '');
      const texto = $par.find('.docTexto').first().text().replace(/\s+/g, ' ').trim();
      if (titulo) campos[titulo] = texto;
    });

    if (!Object.keys(campos).length) return;

    itens.push({
      numeroProcesso,
      orgaoJulgador: campos['ÓRGÃO JULGADOR'] || undefined,
      relator: campos['RELATOR'] || undefined,
      dataJulgamento: parseDataBr(campos['DATA DO JULGAMENTO']),
      ementa: campos['EMENTA'] || undefined,
    });
  });

  return itens;
}

function formatarNumeroProcesso(digitos: string): string {
  const m = digitos.match(/^(\d{7})(\d{2})(\d{4})(\d{1})(\d{2})(\d{4})$/);
  if (!m) return digitos;
  const [, seq, dv, ano, justica, tribunal, origem] = m;
  return `${seq}-${dv}.${ano}.${justica}.${tribunal}.${origem}`;
}

function parseDataBr(data?: string): Date | undefined {
  if (!data) return undefined;
  const m = data.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return undefined;
  const [, dd, mm, yyyy] = m;
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
}
