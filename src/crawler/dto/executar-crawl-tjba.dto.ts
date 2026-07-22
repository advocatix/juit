import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';

class TermoTjbaDto {
  @IsString()
  termo: string;

  @IsOptional()
  @IsString()
  area?: string;
}

export class ExecutarCrawlTjbaDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TermoTjbaDto)
  termos?: TermoTjbaDto[];

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
