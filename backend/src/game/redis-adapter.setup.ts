import { createAdapter } from '@socket.io/redis-adapter';
import { createClient, RedisClientType } from 'redis';
import { Server } from 'socket.io';
import { Logger } from '@nestjs/common';

const logger = new Logger('RedisAdapter');

// Singleton state - shared across all gateways
let pubClient: RedisClientType | null = null;
let subClient: RedisClientType | null = null;
let isInitialized = false;
let initPromise: Promise<void> | null = null;

function getRedisUrl(config: { host: string; port: number; password?: string }): string {
  if (config.password) {
    return `redis://:${config.password}@${config.host}:${config.port}`;
  }
  return `redis://${config.host}:${config.port}`;
}

/**
 * Setup Redis Adapter for Socket.IO server.
 * This is a singleton - calling multiple times will skip re-initialization.
 * The adapter is applied globally to the server, which means all namespaces
 * (/lobby, /game, etc.) will share the same Redis adapter for cross-namespace messaging.
 * 
 * @param io - The NestJS Socket.IO server instance
 * @param redisConfig - Redis connection configuration
 */
export async function setupRedisAdapter(
  io: Server,
  redisConfig: {
    host: string;
    port: number;
    password?: string;
  }
): Promise<void> {
  // If already initialized, skip
  if (isInitialized && pubClient && subClient) {
    logger.log('Redis Adapter already initialized, skipping');
    return;
  }

  // If initialization is in progress, wait for it
  if (initPromise) {
    logger.log('Redis Adapter initialization in progress, waiting...');
    await initPromise;
    return;
  }

  // Start initialization
  initPromise = (async () => {
    const url = getRedisUrl(redisConfig);

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

    // Get raw Socket.IO server and set adapter globally
    // This applies to ALL namespaces including /lobby and /game
    const rawIo = (io as unknown as { server: Server }).server;
    rawIo.adapter(createAdapter(pubClient, subClient));

    isInitialized = true;
    logger.log('Socket.IO Redis Adapter initialized');
    logger.log(`Connected to Redis at ${redisConfig.host}:${redisConfig.port}`);
  })();

  await initPromise;
}

/**
 * Teardown Redis Adapter connections.
 * Should be called on application shutdown.
 */
export async function teardownRedisAdapter(): Promise<void> {
  if (pubClient) {
    await pubClient.quit();
    pubClient = null;
  }
  if (subClient) {
    await subClient.quit();
    subClient = null;
  }
  isInitialized = false;
  initPromise = null;
  logger.log('Redis Adapter connections closed');
}

export function isRedisAdapterInitialized(): boolean {
  return isInitialized;
}
