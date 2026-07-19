import * as cheerio from 'cheerio';

export interface TjtoResultado {
  numeroProcesso?: string;
  orgaoJulgador?: string;
  relator?: string;
  dataJulgamento?: Date;
  ementa?: string;
}

/**
 * O portal Jurisprudência 4.0 do TJTO (`consulta.php`) responde HTML
 * renderizado server-side — sem API JSON. O bloco de resultado por item
 * é `.container.align-self-center.panel.panel-default`, com uma tabela
 * de metadados (Classe, Tipo Julgamento, Assunto(s), Competência,
 * Relator, Data Autuação, Data Julgamento) e a ementa em
 * `.content_ementa`. Não há campo de "órgão julgador" separado — usamos
 * "Competência" (ex.: "TURMAS DAS CAMARAS CIVEIS"), que é o mais
 * próximo disso na estrutura de dados exposta.
 */
export function parseResultadosTjto(html: string): TjtoResultado[] {
  const $ = cheerio.load(html);
  const itens: TjtoResultado[] = [];

  $('.container.align-self-center.panel.panel-default').each((_, el) => {
    const $el = $(el);
    const numeroProcesso = $el.find('[onclick*="setcopiarConteudo"]').first().text().trim() || undefined;

    const campos: Record<string, string> = {};
    $el.find('table tr').each((__, tr) => {
      const tds = $(tr).find('td');
      if (tds.length >= 2) {
        campos[$(tds[0]).text().trim()] = $(tds[1]).text().trim();
      }
    });

    const ementa = $el.find('.content_ementa').first().text().replace(/\s+/g, ' ').trim() || undefined;

    itens.push({
      numeroProcesso,
      orgaoJulgador: campos['Competência'] || undefined,
      relator: campos['Relator'] || undefined,
      dataJulgamento: parseDataBr(campos['Data Julgamento']),
      ementa,
    });
  });

  return itens;
}

function parseDataBr(data?: string): Date | undefined {
  if (!data) return undefined;
  const m = data.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return undefined;
  const [, dd, mm, yyyy] = m;
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
}
