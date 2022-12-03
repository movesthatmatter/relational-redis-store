import redisMock from 'redis-mock';
import { getRedisMockClient } from './redisMock';
import { Store } from './Store';
import { CollectionMapBase, QueueMapBase } from './util';

export const createMockStore = <
  CollectionMap extends CollectionMapBase,
  QueueMap extends QueueMapBase = {}
>() =>
  new Store<CollectionMap, QueueMap>(
    getRedisMockClient(redisMock.createClient()) as any
  );
