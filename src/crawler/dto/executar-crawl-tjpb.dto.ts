import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';

class TermoTjpbDto {
  @IsString()
  termo: string;

  @IsOptional()
  @IsString()
  area?: string;
}

export class ExecutarCrawlTjpbDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TermoTjpbDto)
  termos?: TermoTjpbDto[];

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
