import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';

class TermoCjfDto {
  @IsString()
  termo: string;

  @IsOptional()
  @IsString()
  area?: string;
}

export class ExecutarCrawlCjfDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TermoCjfDto)
  termos?: TermoCjfDto[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  maxPaginasPorTermo?: number;
}
