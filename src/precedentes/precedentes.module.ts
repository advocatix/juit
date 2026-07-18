import { Module } from '@nestjs/common';
import { PrecedentesService } from './precedentes.service';
import { PrecedentesController } from './precedentes.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [PrecedentesService],
  controllers: [PrecedentesController],
  exports: [PrecedentesService],
})
export class PrecedentesModule {}
