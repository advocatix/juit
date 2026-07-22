import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';

class TermoTjrsDto {
  @IsString()
  termo: string;

  @IsOptional()
  @IsString()
  area?: string;
}

export class ExecutarCrawlTjrsDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TermoTjrsDto)
  termos?: TermoTjrsDto[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  maxPaginasPorTermo?: number;

  /** Ignora `termos` e varre o acervo inteiro, ano a ano (backfill real). */
  @IsOptional()
  @IsBoolean()
  varrerTudo?: boolean;
}
