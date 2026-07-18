import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class BuscarPrecedentesDto {
  @IsString()
  @MaxLength(500)
  query: string;

  @IsOptional()
  @IsString()
  tribunalSigla?: string;

  @IsOptional()
  @IsIn(['PREVIDENCIARIO', 'TRABALHISTA', 'CIVIL', 'FAMILIA', 'CRIMINAL', 'TRIBUTARIO', 'OUTRO'])
  area?: string;
}
