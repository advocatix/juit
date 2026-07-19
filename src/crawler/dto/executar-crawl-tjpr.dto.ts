import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';

class TermoTjprDto {
  @IsString()
  termo: string;

  @IsOptional()
  @IsString()
  area?: string;
}

export class ExecutarCrawlTjprDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TermoTjprDto)
  termos?: TermoTjprDto[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxPaginasPorTermo?: number;
}
