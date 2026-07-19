import * as cheerio from 'cheerio';

export interface CjfResultado {
  numeroProcesso?: string;
  tribunalSigla?: string;
  orgaoJulgador?: string;
  relator?: string;
  dataJulgamento?: Date;
  ementa?: string;
}

/**
 * A Jurisprudência Unificada do CJF (`jurisprudencia.cjf.jus.br/unificada`)
 * é, assim como o FALCÃO, um repositório que cruza vários tribunais numa
 * busca só — mas aqui é STF + STJ + TNU + TRF1..TRF5 (Turmas Recursais e
 * Turmas Regionais de Uniformização existem como opção mas ficam de fora,
 * baixo valor/identidade confusa). O campo "Origem" vem em formatos
 * inconsistentes por tribunal (ex.: "STJ - SUPERIOR TRIBUNAL DE JUSTIÇA",
 * "TRF - PRIMEIRA REGIÃO", ou só "TNU"), então extraímos a sigla real via
 * regex em vez de usar o texto puro.
 */
export function parseResultadosCjf(html: string): CjfResultado[] {
  const $ = cheerio.load(html);
  const itens: CjfResultado[] = [];

  $('.table_resultado').each((_, el) => {
    const $tabela = $(el);
    const campos: Record<string, string> = {};

    $tabela.find('tr').each((i, tr) => {
      const $tr = $(tr);
      const label = $tr.find('.label_pontilhada').text().trim();
      if (label) {
        const $proximaTr = $tabela.find('tr').eq(i + 1);
        campos[label] = $proximaTr.text().replace(/\s+/g, ' ').trim();
      }
    });

    if (!Object.keys(campos).length) return;

    itens.push({
      numeroProcesso: (campos['Número'] || '').split(/\s/)[0] || undefined,
      tribunalSigla: extrairSiglaOrigem(campos['Origem']),
      orgaoJulgador: campos['Órgão julgador'] || undefined,
      relator: campos['Relator(a)'] || undefined,
      dataJulgamento: parseDataBr(campos['Data']),
      ementa: campos['Ementa'] || undefined,
    });
  });

  return itens;
}

function extrairSiglaOrigem(origem?: string): string | undefined {
  if (!origem) return undefined;
  if (/SUPREMO TRIBUNAL FEDERAL|^STF/i.test(origem)) return 'STF';
  if (/SUPERIOR TRIBUNAL DE JUSTIÇA|^STJ/i.test(origem)) return 'STJ';
  if (/TURMA NACIONAL DE UNIFORMIZAÇÃO|^TNU/i.test(origem)) return 'TNU';

  const regiao = origem.match(
    /TRF\D*(PRIMEIRA|SEGUNDA|TERCEIRA|QUARTA|QUINTA|SEXTA)\s*REGI[ÃA]O|(PRIMEIRA|SEGUNDA|TERCEIRA|QUARTA|QUINTA|SEXTA)\s*REGI[ÃA]O/i,
  );
  if (regiao) {
    const ordinal = (regiao[1] || regiao[2]).toUpperCase();
    const mapa: Record<string, string> = {
      PRIMEIRA: 'TRF1',
      SEGUNDA: 'TRF2',
      TERCEIRA: 'TRF3',
      QUARTA: 'TRF4',
      QUINTA: 'TRF5',
      SEXTA: 'TRF6',
    };
    return mapa[ordinal];
  }

  return undefined;
}

function parseDataBr(data?: string): Date | undefined {
  if (!data) return undefined;
  const m = data.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return undefined;
  const [, dd, mm, yyyy] = m;
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
}
