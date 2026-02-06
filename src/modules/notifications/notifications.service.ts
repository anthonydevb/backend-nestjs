import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Notification, NotificationType, NotificationPriority } from '../../entities/notification.entity';
import { User } from '../../entities/user.entity';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { SendBulkNotificationDto } from './dto/send-bulk-notification.dto';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private notificationsRepository: Repository<Notification>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  // Crear una notificación individual
  async create(createNotificationDto: CreateNotificationDto): Promise<Notification> {
    const destinatario = await this.usersRepository.findOne({
      where: { id: createNotificationDto.destinatarioId },
    });

    if (!destinatario) {
      throw new NotFoundException('Destinatario no encontrado');
    }

    let remitente: User | null = null;
    if (createNotificationDto.remitenteId) {
      remitente = await this.usersRepository.findOne({
        where: { id: createNotificationDto.remitenteId },
      });
    }

    const notification = this.notificationsRepository.create({
      destinatario,
      tipo: createNotificationDto.tipo || NotificationType.INFO,
      titulo: createNotificationDto.titulo,
      mensaje: createNotificationDto.mensaje,
      prioridad: createNotificationDto.prioridad || NotificationPriority.MEDIUM,
      remitente,
    });

    return await this.notificationsRepository.save(notification);
  }

  // Enviar notificación a múltiples usuarios
  async sendBulk(sendBulkDto: SendBulkNotificationDto): Promise<Notification[]> {
    const users = await this.usersRepository.find({
      where: { id: In(sendBulkDto.destinatariosIds) },
    });

    if (users.length === 0) {
      throw new NotFoundException('No se encontraron destinatarios');
    }

    let remitente: User | null = null;
    if (sendBulkDto.remitenteId) {
      remitente = await this.usersRepository.findOne({
        where: { id: sendBulkDto.remitenteId },
      });
    }

    const notifications = users.map(user =>
      this.notificationsRepository.create({
        destinatario: user,
        tipo: sendBulkDto.tipo || NotificationType.INFO,
        titulo: sendBulkDto.titulo,
        mensaje: sendBulkDto.mensaje,
        prioridad: sendBulkDto.prioridad || NotificationPriority.MEDIUM,
        remitente,
      }),
    );

    return await this.notificationsRepository.save(notifications);
  }

  // Obtener todas las notificaciones de un usuario
  async findByUser(userId: number, unreadOnly: boolean = false): Promise<Notification[]> {
    const where: any = { destinatario: { id: userId } };
    if (unreadOnly) {
      where.leido = false;
    }

    return await this.notificationsRepository.find({
      where,
      order: { fecha_envio: 'DESC' },
      relations: ['destinatario', 'remitente'],
    });
  }

  // Obtener el conteo de notificaciones no leídas
  async getUnreadCount(userId: number): Promise<number> {
    return await this.notificationsRepository.count({
      where: {
        destinatario: { id: userId },
        leido: false,
      },
    });
  }

  // Marcar una notificación como leída
  async markAsRead(id: number, userId: number): Promise<Notification> {
    const notification = await this.notificationsRepository.findOne({
      where: { id, destinatario: { id: userId } },
      relations: ['destinatario', 'remitente'],
    });

    if (!notification) {
      throw new NotFoundException('Notificación no encontrada');
    }

    notification.leido = true;
    notification.fecha_leido = new Date();

    return await this.notificationsRepository.save(notification);
  }

  // Marcar todas las notificaciones como leídas
  async markAllAsRead(userId: number): Promise<void> {
    await this.notificationsRepository.update(
      { destinatario: { id: userId }, leido: false },
      { leido: true, fecha_leido: new Date() },
    );
  }

  // Eliminar una notificación
  async remove(id: number, userId: number): Promise<void> {
    const notification = await this.notificationsRepository.findOne({
      where: { id, destinatario: { id: userId } },
    });

    if (!notification) {
      throw new NotFoundException('Notificación no encontrada');
    }

    await this.notificationsRepository.remove(notification);
  }

  // Eliminar todas las notificaciones leídas de un usuario
  async removeAllRead(userId: number): Promise<void> {
    await this.notificationsRepository.delete({
      destinatario: { id: userId },
      leido: true,
    });
  }

  // Obtener todas las notificaciones (para admin)
  async findAll(): Promise<Notification[]> {
    return await this.notificationsRepository.find({
      order: { fecha_envio: 'DESC' },
      relations: ['destinatario', 'remitente'],
    });
  }
}

