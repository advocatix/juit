import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';

class TermoTjrjDto {
  @IsString()
  termo: string;

  @IsOptional()
  @IsString()
  area?: string;
}

export class ExecutarCrawlTjrjDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TermoTjrjDto)
  termos?: TermoTjrjDto[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  maxPaginasPorTermo?: number;
}
