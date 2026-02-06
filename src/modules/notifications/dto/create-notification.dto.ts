import { IsString, IsEnum, IsOptional, IsNumber } from 'class-validator';
import { NotificationType, NotificationPriority } from '../../../entities/notification.entity';

export class CreateNotificationDto {
  @IsNumber()
  destinatarioId: number;

  @IsEnum(NotificationType)
  @IsOptional()
  tipo?: NotificationType;

  @IsString()
  titulo: string;

  @IsString()
  mensaje: string;

  @IsEnum(NotificationPriority)
  @IsOptional()
  prioridad?: NotificationPriority;

  @IsNumber()
  @IsOptional()
  remitenteId?: number;
}

