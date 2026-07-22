import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';

class TermoTjdfDto {
  @IsString()
  termo: string;

  @IsOptional()
  @IsString()
  area?: string;
}

export class ExecutarCrawlTjdfDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TermoTjdfDto)
  termos?: TermoTjdfDto[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  maxPaginasPorTermo?: number;

  /** Ignora `termos` e varre o acervo inteiro (backfill real, sem termo de busca). */
  @IsOptional()
  @IsBoolean()
  varrerTudo?: boolean;
}
