# Worker residencial — TJPR, TJMS, TJAM, TJRO, CJF

Esta branch (`worker-residencial`) roda **só** os 5 tribunais/fontes que
precisam de um IP residencial de verdade (não datacenter/cloud): TJPR,
TJMS, TJAM, TJRO e a Jurisprudência Unificada do CJF (STF+STJ+TNU+TRF1-5).

Os outros 17 tribunais/fontes continuam rodando normalmente no servidor
de produção (branch `main`, via Browserbase) — **não precisa mexer
neles aqui**.

## Por quê

Esses 5 funcionam com Chrome local (confirmado ao vivo), mas travam via
Browserbase — TJPR e TJAM por um problema específico da rede da
Browserbase (confirmado: funcionam de outras redes cloud como Railway);
TJMS, TJRO e CJF por um bloqueio mais amplo contra IPs de datacenter
(alguns provedores de proxy até recusam esses domínios por política,
já que são sites de governo). Um PC com internet residencial normal
não tem nenhum desses dois problemas.

## Pré-requisitos na máquina

- Windows (ajuste os comandos se for outro SO)
- [Node.js 20+](https://nodejs.org/)
- Google Chrome instalado (o caminho padrão já é o esperado:
  `C:/Program Files/Google/Chrome/Application/chrome.exe`)
- Acesso à internet residencial normal (não usar VPN/proxy)

## Instalação

```powershell
git clone -b worker-residencial https://github.com/advocatix/juit.git
cd juit
npm install
```

Crie um arquivo `.env` (copie de `.env.example` e ajuste):

```env
# Mesmo banco do servidor de produção — os precedentes coletados aqui
# vão pro mesmo lugar que os do servidor principal.
JUIT_DATABASE_URL="<peça a URL do Neon de produção>"

PORT="3010"
NODE_ENV="production"

# NÃO defina BROWSERBASE_API_KEY aqui — a ausência dela é o que faz o
# BrowserPoolService cair no Chrome local automaticamente.
PLAYWRIGHT_CHROMIUM_PATH="C:/Program Files/Google/Chrome/Application/chrome.exe"
```

Build e start:

```powershell
npm run build
npm start
```

Se subir sem erro (`Nest application successfully started`), os 5 crons
já estão agendados (rodam sozinhos, não precisa fazer nada manual):

| Tribunal | Horário (Brasília) |
|---|---|
| TJPR | 2h00 |
| TJMS | 2h20 |
| TJAM | 2h40 |
| TJRO | 3h00 |
| CJF (STF/STJ/TNU/TRF1-5) | 3h20 |

## Manter rodando 24/7

O processo Node precisa continuar ativo pros crons dispararem sozinhos.
Duas opções simples:

**Opção A — deixar a janela do terminal aberta** (mais simples, mas se
a máquina reiniciar ou a janela fechar, para de rodar):
```powershell
npm start
```

**Opção B — rodar como serviço com [pm2](https://pm2.keymetrics.io/)**
(sobrevive a reinício da máquina). No Windows, `pm2 startup` (pensado
pra systemd/launchd) não funciona sozinho — use o pacote
`pm2-windows-startup`, que registra o pm2 pra subir automaticamente
via Agendador de Tarefas do Windows:
```powershell
npm install -g pm2 pm2-windows-startup
pm2-startup install
pm2 start dist/main.js --name juit-worker
pm2 save
```
Depois disso, reiniciar o PC não derruba o worker — o Windows sobe o
pm2 sozinho, que por sua vez sobe de novo o `juit-worker` salvo.

## Não é grave se a máquina cair um dia

Cada tribunal tem dedupe por conteúdo (`hashConteudo`) — se o worker
ficar desligado um dia e voltar depois, ele não perde histórico, só
não coletou aquele dia específico. Não precisa se preocupar em nunca
deixar cair.

## Não mergear esta branch na `main`

Esta branch existe só pra esse worker. O `crawler.module.ts` aqui foi
**substituído** pra registrar só os 5 jobs — não tem os outros 17. Se
alguém tentar mergear isso na `main` sem cuidado, vai *remover* os
outros 17 crons de produção. Trate como uma branch permanentemente
paralela, não como uma feature branch normal.
