# Juit

Serviço de busca/validação de jurisprudência, inspirado no juit.com.br.
Vive dentro do monorepo advocatix (reaproveita `apps/machine-learning` via
chamada HTTP), mas é isolado o suficiente para ser vendido como produto
próprio, fora do advocatix.

## Decisões de arquitetura

- **Banco próprio** (`JUIT_DATABASE_URL`), schema Prisma isolado do
  `apps/api`. Nenhuma tabela referencia Tenant/User do advocatix.
- **Auth por API key** (`ApiClient` + header `x-api-key`), não JWT de tenant.
  O advocatix consome esta API como mais um cliente — mesmo caminho que um
  escritório externo usaria.
- **Deploy próprio** (serviço Railway separado, root directory
  `apps/juit`), ciclo de vida independente do `api`/`web`.
- **ML via HTTP**, não import direto do código Python de
  `apps/machine-learning` — mantém os dois deployáveis independentemente.

## Estrutura

- `src/precedentes` — busca de precedentes (hoje: ILIKE simples; evolui para
  full-text/vetorial quando o volume justificar).
- `src/crawler` — esqueleto de coleta. Cada tribunal/fonte vira um
  `CrawlerAdapter` próprio (nenhum foi implementado ainda — depende de
  definirmos o escopo inicial de tribunais/fontes).
- `src/auth` — guard de API key.
- `prisma/schema.prisma` — `Tribunal`, `Precedente`, `CrawlJob`, `ApiClient`,
  `BuscaLog`.

## Rodando localmente

```bash
cp .env.example .env
# ajuste JUIT_DATABASE_URL para um Postgres local ou de dev
npm install
npm run db:migrate
npm run dev
```

## Pendente (não implementado neste esqueleto)

- Adapters de crawler reais por tribunal/fonte.
- Job agendado (`@Cron`) para disparar os crawls — comentado/ausente até o
  escopo de fontes ser definido.
- Endpoint para provisionar `ApiClient` (hoje só existe o guard de leitura).
- Rate limit por plano do `ApiClient` (`planoLimiteMensal` já existe no
  schema, ainda não é verificado).
