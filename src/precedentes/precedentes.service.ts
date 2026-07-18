import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BuscarPrecedentesDto } from './dto/buscar-precedentes.dto';

@Injectable()
export class PrecedentesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Busca textual simples (ILIKE) como ponto de partida. Quando o escopo do
   * crawler/fontes estiver definido, isto evolui para full-text search
   * (pg_trgm / tsvector) ou busca vetorial, reaproveitando o padrão já usado
   * no RAG do apps/api.
   */
  async buscar(dto: BuscarPrecedentesDto, apiClientId: string) {
    const where = {
      AND: [
        {
          OR: [
            { ementa: { contains: dto.query, mode: 'insensitive' as const } },
            { tese: { contains: dto.query, mode: 'insensitive' as const } },
            { textoIntegral: { contains: dto.query, mode: 'insensitive' as const } },
          ],
        },
        dto.area ? { area: dto.area } : {},
        dto.tribunalSigla ? { tribunal: { sigla: dto.tribunalSigla } } : {},
      ],
    };

    const resultados = await this.prisma.precedente.findMany({
      where,
      include: { tribunal: true },
      take: 20,
      orderBy: { dataJulgamento: 'desc' },
    });

    await this.prisma.buscaLog.create({
      data: { apiClientId, query: dto.query, resultados: resultados.length },
    });

    return resultados;
  }
}
