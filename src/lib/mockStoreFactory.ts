import redisMock from 'redis-mock';
import { getRedisMockClient } from './tests/redisMock';
import { Store, StoreConfig } from './Store';
import { CollectionMapBase, QueueMapBase } from './util';

export const createMockStore = <
  CollectionMap extends CollectionMapBase,
  QueueMap extends QueueMapBase = {}
>(
  config?: StoreConfig
) =>
  new Store<CollectionMap, QueueMap>(
    getRedisMockClient(redisMock.createClient()) as any,
    config
  );
