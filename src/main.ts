import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 🚀 Configurar CORS dinámicamente según el entorno
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : [
        'http://localhost:4200',  // Angular Web (desarrollo)
        'http://localhost:8100',   // Ionic Dev
        'http://localhost:5173',   // Vite (si usas)
        'capacitor://localhost',   // Capacitor iOS
        'ionic://localhost',       // Capacitor Android
      ];

  app.enableCors({
    origin: allowedOrigins,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  });

  const port = process.env.PORT || 3002;
  await app.listen(port);
  console.log(`✅ Backend corriendo en puerto ${port}`);
  console.log(`🌍 Entorno: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔒 CORS habilitado para: ${allowedOrigins.join(', ')}`);
}

bootstrap();
