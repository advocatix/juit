import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';

class TermoTjgoDto {
  @IsString()
  termo: string;

  @IsOptional()
  @IsString()
  area?: string;
}

export class ExecutarCrawlTjgoDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TermoTjgoDto)
  termos?: TermoTjgoDto[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  maxPaginas?: number;
}
