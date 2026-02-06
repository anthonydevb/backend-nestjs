import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, Index } from 'typeorm';
import { Professor } from './professors.entity';

@Entity('attendance_reports')
@Index(['year', 'month']) // Índice para búsquedas por año y mes
@Index(['professor']) // Índice para búsquedas por profesor
@Index(['fecha']) // Índice para búsquedas por fecha
export class AttendanceReport {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Professor)
  professor: Professor;

  @Column({ type: 'date' })
  fecha: Date; // Fecha del día de asistencia

  @Column({ type: 'int' })
  year: number; // Año para filtrado rápido

  @Column({ type: 'int' })
  month: number; // Mes para filtrado rápido (1-12)

  @Column({ type: 'timestamp', nullable: true })
  entryTime: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  exitTime: Date | null;

  @Column({ type: 'text', nullable: true })
  activity: string | null;

  @Column({ default: false })
  isManual: boolean; // Indica si fue marcado manualmente

  @Column({ type: 'varchar', length: 255, nullable: true })
  markedBy: string | null; // Nombre del admin que marcó manualmente o 'QR' o 'Sistema'

  @Column({ type: 'text', nullable: true })
  justification: string | null; // Justificación del marcado manual

  @Column({ type: 'int', nullable: true })
  attendanceId: number | null; // ID del registro original en attendances (para referencia)

  @Column({ default: false })
  isLate: boolean; // Indica si el profesor llegó tarde

  @CreateDateColumn()
  createdAt: Date; // Fecha en que se guardó este reporte
}

