import { Provider } from '@nestjs/common';
import { AuroraDSQLPool } from '@aws/aurora-dsql-node-postgres-connector';
import { DSQL_POOL } from './dsql.constants';

export const dsqlProvider: Provider = {
  provide: DSQL_POOL,
  useFactory: async () => {
    const pool = new AuroraDSQLPool({
      host: process.env.DSQL_HOST!,       // e.g. abc123.dsql.us-east-1.on.aws
      user: 'admin',
      database: 'postgres',
      max: 3,
      idleTimeoutMillis: 60000,
      // region is optional; AWS says it can auto-detect from hostname
      // region: process.env.AWS_REGION,
    });

    // optional health check at startup
    await pool.query('SELECT NOW()');

    return pool;
  },
};
