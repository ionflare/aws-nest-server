import { Controller, Get, Inject } from '@nestjs/common';
import { AppService } from './app.service';
import Redis, { Cluster } from 'ioredis';

@Controller()
export class AppController {
  constructor(@Inject('REDIS') private readonly redis: Cluster) {}

  @Get('set')
  async setValue() {
    await this.redis.set('hello', 'world');
    return { message: 'saved' };
  }

  @Get('get')
  async getValue() {
    const value = await this.redis.get('hello');
    return { value };
  }
}
/*
 import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
*/
