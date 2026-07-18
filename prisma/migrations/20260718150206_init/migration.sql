-- CreateTable
CREATE TABLE "api_clients" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "apiKeyHash" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "planoLimiteMensal" INTEGER NOT NULL DEFAULT 1000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tribunais" (
    "id" TEXT NOT NULL,
    "sigla" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "instancia" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tribunais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "precedentes" (
    "id" TEXT NOT NULL,
    "tribunalId" TEXT NOT NULL,
    "numeroProcesso" TEXT,
    "orgaoJulgador" TEXT,
    "relator" TEXT,
    "dataJulgamento" TIMESTAMP(3),
    "area" TEXT,
    "tese" TEXT,
    "ementa" TEXT,
    "textoIntegral" TEXT,
    "fonte" TEXT NOT NULL,
    "urlOrigem" TEXT,
    "hashConteudo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "precedentes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crawl_jobs" (
    "id" TEXT NOT NULL,
    "tribunalId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "iniciadoEm" TIMESTAMP(3),
    "concluidoEm" TIMESTAMP(3),
    "itensColetados" INTEGER NOT NULL DEFAULT 0,
    "itensNovos" INTEGER NOT NULL DEFAULT 0,
    "erro" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crawl_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "busca_logs" (
    "id" TEXT NOT NULL,
    "apiClientId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "resultados" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "busca_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "api_clients_apiKeyHash_key" ON "api_clients"("apiKeyHash");

-- CreateIndex
CREATE UNIQUE INDEX "tribunais_sigla_key" ON "tribunais"("sigla");

-- CreateIndex
CREATE UNIQUE INDEX "precedentes_hashConteudo_key" ON "precedentes"("hashConteudo");

-- CreateIndex
CREATE INDEX "precedentes_tribunalId_area_idx" ON "precedentes"("tribunalId", "area");

-- CreateIndex
CREATE INDEX "precedentes_dataJulgamento_idx" ON "precedentes"("dataJulgamento");

-- CreateIndex
CREATE INDEX "crawl_jobs_tribunalId_status_idx" ON "crawl_jobs"("tribunalId", "status");

-- CreateIndex
CREATE INDEX "busca_logs_apiClientId_createdAt_idx" ON "busca_logs"("apiClientId", "createdAt");

-- AddForeignKey
ALTER TABLE "precedentes" ADD CONSTRAINT "precedentes_tribunalId_fkey" FOREIGN KEY ("tribunalId") REFERENCES "tribunais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crawl_jobs" ADD CONSTRAINT "crawl_jobs_tribunalId_fkey" FOREIGN KEY ("tribunalId") REFERENCES "tribunais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "busca_logs" ADD CONSTRAINT "busca_logs_apiClientId_fkey" FOREIGN KEY ("apiClientId") REFERENCES "api_clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
