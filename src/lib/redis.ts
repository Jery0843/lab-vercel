import { Redis } from '@upstash/redis';
import { createClient } from 'redis';

let redisCloudClient: any = null;

if (process.env.REDIS_CLOUD_HOST) {
  redisCloudClient = createClient({
    socket: {
      host: process.env.REDIS_CLOUD_HOST,
      port: parseInt(process.env.REDIS_CLOUD_PORT || '13442'),
      connectTimeout: 5000,
      reconnectStrategy: false
    },
    password: process.env.REDIS_CLOUD_PASSWORD
  });
  
  redisCloudClient.connect().catch(() => {
    console.log('Redis Cloud connection failed, using Upstash');
    redisCloudClient = null;
  });
}

const upstashRedis = new Redis({
  url: process.env.UPSTASH_REDIS_URL || '',
  token: process.env.UPSTASH_REDIS_TOKEN || '',
});

export const redis = {
  async lpush(key: string, value: string) {
    if (redisCloudClient) {
      try {
        return await Promise.race([
          redisCloudClient.lPush(key, value),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
        ]);
      } catch (err) {
        console.log('Redis Cloud lpush failed, using Upstash');
      }
    }
    return await upstashRedis.lpush(key, value);
  },
  async ltrim(key: string, start: number, stop: number) {
    if (redisCloudClient) {
      try {
        return await Promise.race([
          redisCloudClient.lTrim(key, start, stop),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
        ]);
      } catch (err) {
        console.log('Redis Cloud ltrim failed, using Upstash');
      }
    }
    return await upstashRedis.ltrim(key, start, stop);
  },
  async lrange(key: string, start: number, stop: number) {
    if (redisCloudClient) {
      try {
        return await Promise.race([
          redisCloudClient.lRange(key, start, stop),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
        ]);
      } catch (err) {
        console.log('Redis Cloud lrange failed, using Upstash');
      }
    }
    return await upstashRedis.lrange(key, start, stop);
  }
};
