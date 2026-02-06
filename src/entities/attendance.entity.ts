import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, Index } from 'typeorm';
import { Professor } from './professors.entity';
import { QrCode } from './qr-code.entity';

@Entity('attendances')
@Index(['entryTime']) // Índice para búsquedas por fecha de entrada
@Index(['exitTime']) // Índice para búsquedas por fecha de salida
@Index(['professor']) // Índice para búsquedas por profesor
export class Attendance {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Professor, professor => professor.attendances)
  professor: Professor;

  @ManyToOne(() => QrCode, { nullable: true })
  qr: QrCode | null;

  @Column({ type: 'timestamp', nullable: true })
  entryTime: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  exitTime: Date | null;

  @Column({ type: 'text', nullable: true })
  activity: string | null;

  @Column({ default: false })
  isManual: boolean; // Indica si fue marcado manualmente

  @Column({ type: 'varchar', length: 255, nullable: true })
  markedBy: string | null; // Nombre del admin que marcó manualmente

  @Column({ type: 'text', nullable: true })
  justification: string | null; // Justificación del marcado manual

  @Column({ default: false })
  isLate: boolean; // Indica si el profesor llegó tarde

  @CreateDateColumn()
  createdAt: Date;
}
