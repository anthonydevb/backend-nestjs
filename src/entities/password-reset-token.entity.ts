import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('password_reset_tokens')
@Index('IDX_password_reset_token_email', ['email']) // Índice para búsquedas por email
// No necesitamos @Index(['token']) porque unique: true ya crea un índice automáticamente
export class PasswordResetToken {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  email: string;

  @Column({ unique: true })
  token: string; // Token hasheado

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @Column({ default: false })
  used: boolean; // Indica si el token ya fue usado

  @CreateDateColumn()
  createdAt: Date;
}

