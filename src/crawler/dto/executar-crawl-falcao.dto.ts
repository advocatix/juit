import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';

class TermoFalcaoDto {
  @IsString()
  termo: string;

  @IsOptional()
  @IsString()
  area?: string;
}

export class ExecutarCrawlFalcaoDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TermoFalcaoDto)
  termos?: TermoFalcaoDto[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  maxPaginasPorTermo?: number;
}
