import Redis from 'ioredis';

const url = process.env.REDIS_URL || 'redis://localhost:6379';

export const redisClient = new Redis(url);

redisClient.on('connect', () => {
  console.log('Connected to Redis');
});

redisClient.on('error', (err) => {
  console.error('Redis connection error:', err);
});