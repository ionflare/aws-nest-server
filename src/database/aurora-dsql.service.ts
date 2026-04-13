import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import { AuroraDSQLPool } from '@aws/aurora-dsql-node-postgres-connector';
import type { QueryResult, QueryResultRow } from 'pg';

@Injectable()
export class AuroraDsqlService implements OnModuleDestroy {
  private readonly pool: AuroraDSQLPool;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('AURORA_DSQL_HOST');
    const user = this.configService.get<string>('AURORA_DSQL_USER');
    const database =
      this.configService.get<string>('AURORA_DSQL_DATABASE') ?? 'postgres';
    const max =
      Number(this.configService.get<string>('AURORA_DSQL_POOL_MAX')) || 10;

    if (!host) {
      throw new Error('Missing AURORA_DSQL_HOST');
    }
    if (!user) {
      throw new Error('Missing AURORA_DSQL_USER');
    }

    this.pool = new AuroraDSQLPool({
      host,
      user,
      database,
      max,
      idleTimeoutMillis: 60_000,
      ssl: true,
      customCredentialsProvider: fromNodeProviderChain(),
      application_name: 'boardgame-api',
    });
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params: readonly unknown[] = [],
  ): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, params as unknown[]);
  }

  getPool(): AuroraDSQLPool {
    return this.pool;
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
