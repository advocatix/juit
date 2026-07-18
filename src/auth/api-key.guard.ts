import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Autenticação por API key (header `x-api-key`), não por JWT de tenant do
 * advocatix. O advocatix consome esta API como mais um ApiClient — o mesmo
 * caminho que um cliente externo usaria.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const apiKey = req.headers['x-api-key'];

    if (!apiKey || typeof apiKey !== 'string') {
      throw new UnauthorizedException('API key ausente');
    }

    const apiKeyHash = createHash('sha256').update(apiKey).digest('hex');
    const client = await this.prisma.apiClient.findUnique({ where: { apiKeyHash } });

    if (!client || !client.ativo) {
      throw new UnauthorizedException('API key inválida');
    }

    req.apiClient = client;
    return true;
  }
}
