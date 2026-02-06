import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { AttendanceReport } from '../../entities/attendance-report.entity';
import { Attendance } from '../../entities/attendance.entity';
import { Professor } from '../../entities/professors.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([AttendanceReport, Attendance, Professor]),
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService], // Exportar para usar en otros módulos
})
export class ReportsModule {}

