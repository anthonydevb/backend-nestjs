import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Query,
  Patch,
  ParseIntPipe,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { SendBulkNotificationDto } from './dto/send-bulk-notification.dto';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  // Crear una notificación individual
  @Post()
  create(@Body() createNotificationDto: CreateNotificationDto) {
    return this.notificationsService.create(createNotificationDto);
  }

  // Enviar notificación a múltiples usuarios
  @Post('bulk')
  sendBulk(@Body() sendBulkDto: SendBulkNotificationDto) {
    return this.notificationsService.sendBulk(sendBulkDto);
  }

  // Obtener todas las notificaciones (admin)
  @Get()
  findAll() {
    return this.notificationsService.findAll();
  }

  // Obtener notificaciones de un usuario
  @Get('user/:userId')
  findByUser(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    return this.notificationsService.findByUser(
      userId,
      unreadOnly === 'true',
    );
  }

  // Obtener conteo de no leídas
  @Get('user/:userId/unread-count')
  getUnreadCount(@Param('userId', ParseIntPipe) userId: number) {
    return this.notificationsService.getUnreadCount(userId);
  }

  // Marcar como leída
  @Patch(':id/read/:userId')
  markAsRead(
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.notificationsService.markAsRead(id, userId);
  }

  // Marcar todas como leídas
  @Patch('user/:userId/read-all')
  markAllAsRead(@Param('userId', ParseIntPipe) userId: number) {
    return this.notificationsService.markAllAsRead(userId);
  }

  // Eliminar una notificación
  @Delete(':id/user/:userId')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.notificationsService.remove(id, userId);
  }

  // Eliminar todas las leídas
  @Delete('user/:userId/read')
  removeAllRead(@Param('userId', ParseIntPipe) userId: number) {
    return this.notificationsService.removeAllRead(userId);
  }
}

