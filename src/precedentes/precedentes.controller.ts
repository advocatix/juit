import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { PrecedentesService } from './precedentes.service';
import { BuscarPrecedentesDto } from './dto/buscar-precedentes.dto';

@Controller('precedentes')
@UseGuards(ApiKeyGuard)
export class PrecedentesController {
  constructor(private readonly precedentes: PrecedentesService) {}

  @Post('buscar')
  async buscar(@Body() dto: BuscarPrecedentesDto, @Req() req: any) {
    return this.precedentes.buscar(dto, req.apiClient.id);
  }
}
