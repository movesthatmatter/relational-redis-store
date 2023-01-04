import { promisify } from 'util';
import { Multi, RedisClient } from 'redis';

export const getRedisMockClient = (redis: RedisClient) => ({
  redis,

  // Collection
  hget: (...args: any[]) =>
    delay().then(() => promisify(redis.hget).bind(redis, ...args)()),
  hmget: (...args: never[]) =>
    delay().then(() => promisify(redis.hmget).bind(redis, ...args)()),
  hgetall: (...args: any[]) =>
    delay().then(() => promisify(redis.hgetall).bind(redis, ...args)()),
  hset: (...args: any[]) =>
    delay().then(() => promisify(redis.hset).bind(redis, ...args)()),
  multi: redis.multi.bind(redis),
  execMulti: <T = {}>(multi: Multi) =>
    delay().then(
      () =>
        new Promise<T[]>((resolve, reject) =>
          multi.exec((err, data) => (err ? reject(err) : resolve(data)))
        )
    ),
  del: (key: string) => delay().then(
    () =>
      new Promise((resolve, reject) => {
        redis.del(key, (err, response) => {
          if (response === 1) {
            resolve(1);
          } else {
            reject(0);
          }
        });
      })
  ),

  // Queue
  rpush: promisify(redis.rpush).bind(redis),
  lpop: promisify(redis.lpop).bind(redis),
  lrem: promisify(redis.lrem).bind(redis),
  llen: promisify(redis.llen).bind(redis),
});

getRedisMockClient.DELAY = 10;

const delay = (ms = getRedisMockClient.DELAY) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
