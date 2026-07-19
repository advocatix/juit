import * as cheerio from 'cheerio';

export interface TjpiResultado {
  numeroProcesso?: string;
  orgaoJulgador?: string;
  relator?: string;
  dataJulgamento?: Date;
  ementa?: string;
}

/**
 * O JusPI (`jurisprudencia.tjpi.jus.br/jurisprudences/search`) responde
 * HTML renderizado server-side — sem API JSON. Cada resultado é um
 * `.callout.callout-danger`; o texto completo (ementa + inteiro teor)
 * fica num bloco oculto (`[data-reveal-target="item"]`) que termina com
 * um rodapé de citação no formato
 * "(TJPI - <classe> <numero> - Relator: <nome> - <câmara> - Data <dd/mm/yyyy>)",
 * de onde extraímos os metadados via regex (não há tabela estruturada
 * como em outros tribunais).
 */
export function parseResultadosTjpi(html: string): TjpiResultado[] {
  const $ = cheerio.load(html);
  const itens: TjpiResultado[] = [];

  $('.callout.callout-danger').each((_, el) => {
    const $el = $(el);
    const textoCompleto = $el.find('[data-reveal-target="item"]').text().replace(/\s+/g, ' ').trim();
    if (!textoCompleto) return;

    const numeroMatch = textoCompleto.match(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/);
    const rodapeMatch = textoCompleto.match(/Relator:\s*([^-]+?)\s*-\s*([^-]+?)\s*-\s*Data\s*(\d{2}\/\d{2}\/\d{4})/);

    const ementa = textoCompleto.replace(/\(TJPI\s*-[\s\S]*?\)\s*$/, '').trim();

    itens.push({
      numeroProcesso: numeroMatch?.[0],
      orgaoJulgador: rodapeMatch?.[2]?.trim(),
      relator: rodapeMatch?.[1]?.trim(),
      dataJulgamento: parseDataBr(rodapeMatch?.[3]),
      ementa: ementa || undefined,
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
