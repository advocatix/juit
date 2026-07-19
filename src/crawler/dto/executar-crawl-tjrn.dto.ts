import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';

class TermoTjrnDto {
  @IsString()
  termo: string;

  @IsOptional()
  @IsString()
  area?: string;
}

export class ExecutarCrawlTjrnDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TermoTjrnDto)
  termos?: TermoTjrnDto[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  maxPaginasPorTermo?: number;
}
