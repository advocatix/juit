/**
 * Nomes/instância dos tribunais cobertos pela Jurisprudência Unificada
 * do CJF — usado para upsert do Tribunal real por item coletado (ver
 * cjf-unificada.adapter.ts e a rota /cjf/executar no controller).
 */
export const TRIBUNAIS_CJF: Record<string, { nome: string; instancia: string }> = {
  STF: { nome: 'Supremo Tribunal Federal', instancia: 'SUPERIOR' },
  STJ: { nome: 'Superior Tribunal de Justiça', instancia: 'SUPERIOR' },
  TNU: { nome: 'Turma Nacional de Uniformização', instancia: 'SUPERIOR' },
  TRF1: { nome: 'Tribunal Regional Federal da 1ª Região', instancia: 'FEDERAL' },
  TRF2: { nome: 'Tribunal Regional Federal da 2ª Região', instancia: 'FEDERAL' },
  TRF3: { nome: 'Tribunal Regional Federal da 3ª Região', instancia: 'FEDERAL' },
  TRF4: { nome: 'Tribunal Regional Federal da 4ª Região', instancia: 'FEDERAL' },
  TRF5: { nome: 'Tribunal Regional Federal da 5ª Região', instancia: 'FEDERAL' },
  TRF6: { nome: 'Tribunal Regional Federal da 6ª Região', instancia: 'FEDERAL' },
};
