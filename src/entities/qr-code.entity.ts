import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('qr_codes')
export class QrCode {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  token: string; // JWT o código único que viaja en el QR

  @CreateDateColumn()
  fecha_generacion: Date;

  @Column({ type: 'timestamp' })
  fecha_expiracion: Date;

  @Column({ default: true })
  activo: boolean;
}
