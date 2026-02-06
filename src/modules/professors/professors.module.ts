import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { ProfessorsService } from './professors.service';
import { ProfessorsController } from './professors.controller';
import { Professor } from '../../entities/professors.entity';
import { UsersModule } from '../users/users.module';
import { EventsModule } from '../../gateways/events.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Professor]),
    forwardRef(() => UsersModule), // 🔹 necesario para inyectar UsersService
    HttpModule, // 🔹 para hacer peticiones HTTP a la API externa
    EventsModule, // 🔹 para emitir eventos en tiempo real
  ],
  controllers: [ProfessorsController],
  providers: [ProfessorsService],
  exports: [ProfessorsService],
})
export class ProfessorsModule {}
