import * as cheerio from 'cheerio';

export interface TjseResultado {
  numeroProcesso?: string;
  classeProcessual?: string;
  orgaoJulgador?: string;
  relator?: string;
  dataJulgamento?: Date;
  ementa?: string;
}

/**
 * Cada resultado é uma `table.ui-panelgrid` (`dgResultadoJurisprudencia2:N:...`)
 * do PrimeFaces. A ementa limpa está num `span` solto na linha do
 * corpo, mas os metadados estruturados (classe, número CNJ, câmara,
 * relator, data) só existem formatados como texto de citação dentro
 * do atributo `data-clipboard-text` do botão "Copiar" — ex.:
 * "...(Apelação Cível Nº 202500805297 Nº único: 0023632-45.2024.8.25.0001
 * - 2ª CÂMARA CÍVEL, Tribunal de Justiça de Sergipe - Relator(a): Fulano
 * - Julgado em 17/07/2026)". Extraímos via regex nesse texto em vez de
 * tentar montar os campos a partir do HTML dos outros elementos.
 */
const CITACAO_REGEX =
  /\(([^0-9(]+?)\s*Nº\s*\d+\s*Nº único:\s*([\d.\-]+)\s*-\s*([^,]+),\s*Tribunal de Justiça de Sergipe\s*-\s*Relator\(a\):\s*([^-]+?)\s*-\s*Julgado em\s*(\d{2}\/\d{2}\/\d{4})\)\s*$/;

export function parseResultadosTjse(html: string): TjseResultado[] {
  const $ = cheerio.load(html);
  const itens: TjseResultado[] = [];

  $('table[id^="dgResultadoJurisprudencia2:"]').each((_, el) => {
    const $table = $(el);
    const ementa = normalizarEspacos($table.find('span[style="float: left;"]').first().text());
    if (!ementa) return;

    const clip = $table.find('a.copia').attr('data-clipboard-text') ?? '';
    const match = clip.match(CITACAO_REGEX);

    if (!match) {
      itens.push({ ementa });
      return;
    }

    const [, classeProcessual, numeroProcesso, orgaoJulgador, relator, dataStr] = match;
    itens.push({
      numeroProcesso: numeroProcesso.trim(),
      classeProcessual: classeProcessual.trim(),
      orgaoJulgador: orgaoJulgador.trim(),
      relator: relator.trim(),
      dataJulgamento: parseDataBr(dataStr),
      ementa,
    });
  });

  return itens;
}

function normalizarEspacos(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim();
}

function parseDataBr(data: string): Date | undefined {
  const m = data.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return undefined;
  const [, dd, mm, yyyy] = m;
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
}
