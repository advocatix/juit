import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';

class TermoTjpeDto {
  @IsString()
  termo: string;

  @IsOptional()
  @IsString()
  area?: string;
}

export class ExecutarCrawlTjpeDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TermoTjpeDto)
  termos?: TermoTjpeDto[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  maxPaginas?: number;
}
