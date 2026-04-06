
import Redis from 'ioredis';

export const RedisProvider = {
  provide: 'REDIS',
  useFactory: () => {
    return new Redis.Cluster(
  [
    {
     	host: process.env.REDIS_HOST!,   // MemoryDB cluster endpoint
      	port: Number(process.env.REDIS_PORT || 6379),
    },
  ],
  {
    dnsLookup: (address, callback) => callback(null, address),
    enableReadyCheck: true,
    slotsRefreshTimeout: 10000,
    clusterRetryStrategy: (times) => Math.min(times * 100, 2000),
    redisOptions: {
      tls: {},
      username: process.env.REDIS_USERNAME || 'default',
      password: process.env.REDIS_PASSWORD || undefined,
    },
  },
);
  },
};
