import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsInt, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';

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
  @Max(50)
  maxPaginas?: number;

  /** Backfill manual: sobrescreve o período padrão ("ontem", usado
   *  pelo cron diário). Formato YYYY-MM-DD. */
  @IsOptional()
  @IsDateString()
  dataJulgamentoInicio?: string;

  @IsOptional()
  @IsDateString()
  dataJulgamentoFim?: string;
}
