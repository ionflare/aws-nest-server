import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: ['http://localhost:3000','https://localhost:3000'], // Replace with your actual frontend origins
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true, // Set to true if you are sending credentials (cookies, auth headers)
  });
  await app.listen(process.env.PORT ?? 4000);
}
bootstrap();
