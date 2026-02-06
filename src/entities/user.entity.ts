import { Entity, Column, PrimaryGeneratedColumn, ManyToOne } from 'typeorm';
import { Professor } from './professors.entity';

export enum UserRole {
  ADMIN = 'admin',
  PROFESSOR = 'professor',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string;

  @Column({ type: 'enum', enum: UserRole })
  role: UserRole;

  @ManyToOne(() => Professor, (professor) => professor.users, {
    nullable: true,
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE',
    createForeignKeyConstraints: false // NO crear restricción FK automáticamente (evita errores con datos existentes)
  })
  professor: Professor | null;
}
