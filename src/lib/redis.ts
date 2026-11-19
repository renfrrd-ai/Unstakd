import { Redis } from "ioredis";
import { env } from "./env";

// BullMQ requires maxRetriesPerRequest: null on connections used by workers.
export function createRedis() {
  return new Redis(env().REDIS_URL, { maxRetriesPerRequest: null });
}

const globalForRedis = globalThis as unknown as { unstakdRedis?: Redis };

export function redis(): Redis {
  globalForRedis.unstakdRedis ??= createRedis();
  return globalForRedis.unstakdRedis;
}
