import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HorariosController } from './horarios.controller';
import { HorariosService } from './horarios.service';
import { Horario } from '../../entities/horario.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Horario])],
  controllers: [HorariosController],
  providers: [HorariosService],
  exports: [HorariosService],
})
export class HorariosModule {}

