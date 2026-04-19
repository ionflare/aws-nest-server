import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { WsAdapter } from '@nestjs/platform-ws';
import cookieParser from 'cookie-parser';
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.useWebSocketAdapter(new WsAdapter(app));
  app.enableCors({
    origin: ['http://localhost:3000','https://localhost:3000','http://127.0.0.1:3000'], // Replace with your actual frontend origins
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true, // Set to true if you are sending credentials (cookies, auth headers)
  });
  await app.listen(process.env.PORT ?? 4000);
}
bootstrap();
