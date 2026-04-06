import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class AppService {
  constructor(@Inject('DSQL_POOL') private readonly db: Pool) {}

  async testConnection() {
    const result = await this.db.query('SELECT NOW() AS now');
    return result.rows[0];
  }

  async getUsers() {
    const result = await this.db.query(
      'SELECT user_id, username, email FROM app_users ORDER BY created_at DESC LIMIT 10',
    );
    return result.rows;
  }
}
/*
import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }
}
*/
