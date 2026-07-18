import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
// Client gerado num output privado (ver prisma/schema.prisma) — não usar
// '@prisma/client' aqui, esse import resolveria para o client hoisted do
// schema principal do advocatix (packages/database), não o do Juit.
import { PrismaClient } from '../../node_modules/.prisma-juit/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
