import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn } from 'typeorm';
import { User } from './user.entity';

export enum NotificationType {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  SUCCESS = 'success',
  MESSAGE = 'message',
  REMINDER = 'reminder',
}

export enum NotificationPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { eager: true, onDelete: 'CASCADE' })
  destinatario: User;

  @Column({ type: 'enum', enum: NotificationType, default: NotificationType.INFO })
  tipo: NotificationType;

  @Column()
  titulo: string;

  @Column('text')
  mensaje: string;

  @Column({ default: false })
  leido: boolean;

  @CreateDateColumn()
  fecha_envio: Date;

  @Column({ type: 'enum', enum: NotificationPriority, default: NotificationPriority.MEDIUM })
  prioridad: NotificationPriority;

  @ManyToOne(() => User, { nullable: true, eager: true })
  remitente: User | null;

  @Column({ type: 'timestamp', nullable: true })
  fecha_leido: Date | null;
}

