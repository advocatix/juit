/**
 * Nomes/instância dos tribunais cobertos pelo FALCÃO — usado para
 * upsert do Tribunal real por item coletado (ver falcao-nacional.adapter.ts
 * e a rota /falcao/executar no controller). Regiões do TRT seguem a
 * numeração oficial da Justiça do Trabalho.
 */
export const TRIBUNAIS_FALCAO: Record<string, { nome: string; instancia: string }> = {
  TST: { nome: 'Tribunal Superior do Trabalho', instancia: 'SUPERIOR' },
  CSJT: { nome: 'Conselho Superior da Justiça do Trabalho', instancia: 'SUPERIOR' },
  TRT1: { nome: 'Tribunal Regional do Trabalho da 1ª Região (RJ)', instancia: 'REGIONAL' },
  TRT2: { nome: 'Tribunal Regional do Trabalho da 2ª Região (SP)', instancia: 'REGIONAL' },
  TRT3: { nome: 'Tribunal Regional do Trabalho da 3ª Região (MG)', instancia: 'REGIONAL' },
  TRT4: { nome: 'Tribunal Regional do Trabalho da 4ª Região (RS)', instancia: 'REGIONAL' },
  TRT5: { nome: 'Tribunal Regional do Trabalho da 5ª Região (BA)', instancia: 'REGIONAL' },
  TRT6: { nome: 'Tribunal Regional do Trabalho da 6ª Região (PE)', instancia: 'REGIONAL' },
  TRT7: { nome: 'Tribunal Regional do Trabalho da 7ª Região (CE)', instancia: 'REGIONAL' },
  TRT8: { nome: 'Tribunal Regional do Trabalho da 8ª Região (PA/AP)', instancia: 'REGIONAL' },
  TRT9: { nome: 'Tribunal Regional do Trabalho da 9ª Região (PR)', instancia: 'REGIONAL' },
  TRT10: { nome: 'Tribunal Regional do Trabalho da 10ª Região (DF/TO)', instancia: 'REGIONAL' },
  TRT11: { nome: 'Tribunal Regional do Trabalho da 11ª Região (AM/RR)', instancia: 'REGIONAL' },
  TRT12: { nome: 'Tribunal Regional do Trabalho da 12ª Região (SC)', instancia: 'REGIONAL' },
  TRT13: { nome: 'Tribunal Regional do Trabalho da 13ª Região (PB)', instancia: 'REGIONAL' },
  TRT14: { nome: 'Tribunal Regional do Trabalho da 14ª Região (RO/AC)', instancia: 'REGIONAL' },
  TRT15: { nome: 'Tribunal Regional do Trabalho da 15ª Região (Campinas/SP)', instancia: 'REGIONAL' },
  TRT16: { nome: 'Tribunal Regional do Trabalho da 16ª Região (MA)', instancia: 'REGIONAL' },
  TRT17: { nome: 'Tribunal Regional do Trabalho da 17ª Região (ES)', instancia: 'REGIONAL' },
  TRT18: { nome: 'Tribunal Regional do Trabalho da 18ª Região (GO)', instancia: 'REGIONAL' },
  TRT19: { nome: 'Tribunal Regional do Trabalho da 19ª Região (AL)', instancia: 'REGIONAL' },
  TRT20: { nome: 'Tribunal Regional do Trabalho da 20ª Região (SE)', instancia: 'REGIONAL' },
  TRT21: { nome: 'Tribunal Regional do Trabalho da 21ª Região (RN)', instancia: 'REGIONAL' },
  TRT22: { nome: 'Tribunal Regional do Trabalho da 22ª Região (PI)', instancia: 'REGIONAL' },
  TRT23: { nome: 'Tribunal Regional do Trabalho da 23ª Região (MT)', instancia: 'REGIONAL' },
  TRT24: { nome: 'Tribunal Regional do Trabalho da 24ª Região (MS)', instancia: 'REGIONAL' },
};
