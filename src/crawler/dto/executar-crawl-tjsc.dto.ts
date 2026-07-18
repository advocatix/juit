import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';

class TermoTjscDto {
  @IsString()
  termo: string;

  @IsOptional()
  @IsString()
  area?: string;
}

export class ExecutarCrawlTjscDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TermoTjscDto)
  termos?: TermoTjscDto[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  maxPaginasPorTermo?: number;
}
