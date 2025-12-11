import { Redis } from '@upstash/redis';
import { createClient } from 'redis';

let redisCloudClient: any = null;
let redisCloudConnected = false;

if (process.env.REDIS_CLOUD_HOST) {
  redisCloudClient = createClient({
    socket: {
      host: process.env.REDIS_CLOUD_HOST,
      port: parseInt(process.env.REDIS_CLOUD_PORT || '13442')
    },
    password: process.env.REDIS_CLOUD_PASSWORD
  });
  
  redisCloudClient.connect().then(() => {
    redisCloudConnected = true;
    console.log('✅ Redis Cloud connected');
  }).catch((err: any) => {
    console.log('❌ Redis Cloud failed:', err.message);
    redisCloudConnected = false;
  });
}

const upstashRedis = new Redis({
  url: process.env.UPSTASH_REDIS_URL || 'https://optimum-lobster-5918.upstash.io',
  token: process.env.UPSTASH_REDIS_TOKEN || '',
});

console.log('⚠️ Upstash Redis ready as fallback');

export async function GET(request: Request) {
  const url = new URL(request.url);
  const chatType = url.searchParams.get('type') || 'sudo';
  
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (data: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      send({ type: 'connected' });
      const channel = `chat:${chatType}`;
      let lastCheck = Date.now();
      let useUpstash = !redisCloudConnected;

      console.log(`Chat stream connected: ${chatType}, using ${useUpstash ? 'Upstash' : 'Redis Cloud'}`);

      const interval = setInterval(async () => {
        try {
          let messages: any[] = [];
          
          if (!useUpstash && redisCloudClient && redisCloudConnected) {
            try {
              messages = await Promise.race([
                redisCloudClient.lRange(`${channel}:messages`, 0, 4),
                new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
              ]);
            } catch (err) {
              console.log('❌ Redis Cloud failed, switching to Upstash');
              useUpstash = true;
            }
          }
          
          if (useUpstash) {
            messages = await upstashRedis.lrange(`${channel}:messages`, 0, 4);
          }
          
          const newMessages = messages
            .map((m: any) => typeof m === 'string' ? JSON.parse(m) : m)
            .filter((m: any) => {
              const msgTime = m.timestamp || new Date(m.created_at).getTime();
              return msgTime > lastCheck;
            });
          
          if (newMessages.length > 0) {
            send({ type: 'update', messages: newMessages });
            lastCheck = Date.now();
          }
        } catch (error) {
          console.error('SSE error:', error);
        }
      }, 2000);

      const cleanup = () => {
        clearInterval(interval);
        try {
          controller.close();
        } catch (e) {
          // Controller already closed
        }
      };

      request.signal?.addEventListener('abort', cleanup);
      setTimeout(cleanup, 300000); // 5 min timeout
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
