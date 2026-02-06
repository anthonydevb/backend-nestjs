import { Controller, Post, Get, Param, Body, Patch, Delete, BadRequestException } from '@nestjs/common';
import { QrService } from './qr.service';
import { QrCode } from '../../entities/qr-code.entity';

@Controller('qr')
export class QrController {
  constructor(private readonly qrService: QrService) {}

  // Crear un nuevo QR
  @Post('create')
  async create(
    @Body('newQrName') newQrName?: string,
    @Body('deactivateOldId') deactivateOldId?: number,
  ): Promise<QrCode> {
    try {
      return await this.qrService.create(newQrName, deactivateOldId);
    } catch (err) {
      throw new BadRequestException(err.message);
    }
  }

  // Listar todos los QR
  @Get('all')
  async findAll(): Promise<QrCode[]> {
    return this.qrService.findAll();
  }

  // Buscar un QR activo por token
  @Get(':token')
  async findActive(@Param('token') token: string): Promise<QrCode | null> {
    return this.qrService.findActiveByToken(token);
  }

  // 🔴 Desactivar un QR
  @Patch('deactivate/:id')
  async deactivate(@Param('id') id: number): Promise<{ message: string }> {
    try {
      await this.qrService.deactivate(id);
      return { message: 'QR desactivado correctamente' };
    } catch (err) {
      throw new BadRequestException(err.message);
    }
  }

  // 🗑️ Eliminar un QR (solo si está desactivado y no tiene registros relacionados)
  @Delete('delete/:id')
  async delete(@Param('id') id: number): Promise<{ message: string }> {
    try {
      await this.qrService.delete(id);
      return { message: 'QR eliminado correctamente' };
    } catch (err) {
      // Las excepciones HTTP ya están bien formateadas por el servicio
      throw err;
    }
  }
}
