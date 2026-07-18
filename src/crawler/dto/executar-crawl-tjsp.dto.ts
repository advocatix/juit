import { IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export class ExecutarCrawlTjspDto {
  /** dd/mm/aaaa — default: ontem */
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}\/\d{2}\/\d{4}$/)
  dataInicio?: string;

  /** dd/mm/aaaa — default: hoje */
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}\/\d{2}\/\d{4}$/)
  dataFim?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  maxPaginas?: number;
}
