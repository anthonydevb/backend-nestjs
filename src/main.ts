import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const port = process.env.PORT || 3000; // Render asigna un puerto dinámico
  await app.listen(port);

  console.log(`Servidor corriendo en puerto ${port}`);
}
bootstrap();
