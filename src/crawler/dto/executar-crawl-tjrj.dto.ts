import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ExecutarCrawlTjrjDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  termo?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxPaginas?: number;
}
