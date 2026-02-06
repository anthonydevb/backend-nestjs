import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: ['http://localhost:4200', 'http://localhost:8100'],
    credentials: true,
  },
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    console.log(`Cliente conectado: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Cliente desconectado: ${client.id}`);
  }

  // Emitir evento cuando se crea/actualiza un profesor
  emitProfessorUpdate(professor: any) {
    this.server.emit('professor:updated', professor);
  }

  // Emitir evento cuando se crea un profesor
  emitProfessorCreated(professor: any) {
    this.server.emit('professor:created', professor);
  }

  // Emitir evento cuando se elimina un profesor
  emitProfessorDeleted(professorId: number) {
    this.server.emit('professor:deleted', { id: professorId });
  }

  // Emitir evento cuando se marca una asistencia
  emitAttendanceCreated(attendance: any) {
    this.server.emit('attendance:created', attendance);
  }

  // Emitir evento cuando se actualiza una asistencia
  emitAttendanceUpdated(attendance: any) {
    this.server.emit('attendance:updated', attendance);
  }

  // Emitir evento cuando se crea una notificación
  emitNotificationCreated(notification: any) {
    this.server.emit('notification:created', notification);
  }

  // Emitir evento para actualizar lista de profesores
  emitProfessorsListUpdate() {
    this.server.emit('professors:list-updated');
  }

  // Emitir evento para actualizar lista de asistencias
  emitAttendancesListUpdate() {
    this.server.emit('attendances:list-updated');
  }
}

