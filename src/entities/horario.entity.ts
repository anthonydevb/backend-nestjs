import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('horarios')
export class Horario {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'time' })
  hora_entrada: string; // Formato HH:mm

  @Column({ type: 'time' })
  hora_salida: string; // Formato HH:mm

  @Column({ type: 'int', default: 30, nullable: false })
  tolerancia_entrada: number; // Tolerancia en minutos para considerar tardanza (por defecto 30 minutos)

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}

