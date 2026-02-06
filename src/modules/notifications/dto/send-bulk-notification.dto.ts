import { IsString, IsEnum, IsOptional, IsArray, IsNumber } from 'class-validator';
import { NotificationType, NotificationPriority } from '../../../entities/notification.entity';

export class SendBulkNotificationDto {
  @IsArray()
  @IsNumber({}, { each: true })
  destinatariosIds: number[];

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

