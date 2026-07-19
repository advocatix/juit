import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';

class TermoTjmgDto {
  @IsString()
  termo: string;

  @IsOptional()
  @IsString()
  area?: string;
}

export class ExecutarCrawlTjmgDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TermoTjmgDto)
  termos?: TermoTjmgDto[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  maxPaginas?: number;
}
