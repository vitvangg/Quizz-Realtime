import { createAdapter } from '@socket.io/redis-adapter';
import { createClient, RedisClientType } from 'redis';
import { Server } from 'socket.io';
import { Logger } from '@nestjs/common';

const logger = new Logger('RedisAdapter');

let pubClient: RedisClientType;
let subClient: RedisClientType;
let isInitialized = false;
let currentIo: Server | null = null;

export async function setupRedisAdapter(
  io: Server,
  redisConfig: {
    host: string;
    port: number;
    password?: string;
  }
): Promise<void> {
  // If already initialized with the same server, skip
  if (isInitialized && currentIo === io) {
    logger.log('Redis Adapter already initialized for this server, skipping');
    return;
  }

  // If already initialized with a different server, cleanup first
  if (isInitialized && currentIo !== io) {
    logger.warn('Redis Adapter was initialized with a different server, reinitializing');
    await teardownRedisAdapter();
  }

  const { host, port, password } = redisConfig;

  // Build Redis URL
  let url: string;
  if (password) {
    url = `redis://:${password}@${host}:${port}`;
  } else {
    url = `redis://${host}:${port}`;
  }

  // Create two Redis clients: one for publishing, one for subscribing
  pubClient = createClient({ url });
  subClient = pubClient.duplicate();

  // Handle errors
  pubClient.on('error', (err) => logger.error('Redis Pub Client Error', err));
  subClient.on('error', (err) => logger.error('Redis Sub Client Error', err));

  // Connect both clients
  await Promise.all([
    pubClient.connect(),
    subClient.connect(),
  ]);

  // Get raw Socket.IO server from NestJS wrapper
  const rawIo = (io as unknown as { server: Server }).server;

  // Setup Redis Adapter on raw Socket.IO server
  rawIo.adapter(createAdapter(pubClient, subClient));

  isInitialized = true;
  currentIo = io;

  logger.log('Socket.IO Redis Adapter initialized');
  logger.log(`Connected to Redis at ${host}:${port}`);
}

export async function teardownRedisAdapter(): Promise<void> {
  if (pubClient) {
    await pubClient.quit();
    pubClient = undefined as any;
  }
  if (subClient) {
    await subClient.quit();
    subClient = undefined as any;
  }
  isInitialized = false;
  currentIo = null;
  logger.log('Redis Adapter connections closed');
}

export function getPubClient(): RedisClientType | undefined {
  return pubClient;
}

export function isRedisAdapterInitialized(): boolean {
  return isInitialized;
}
