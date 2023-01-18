import { Ok } from 'ts-results';
import { AsyncResult } from 'ts-async-results';
import { getRedisMockClient } from './redisMock';
import { createMockStore } from '../mockStoreFactory';
import { Store } from '../Store';
import { silentLogger } from './testUtils';

type CollectionMap = {
  simpleItems: {
    id: string;
    name: string;
    age: number;
  };
  complexItems: {
    id: string;
    val: {
      type: string;
      recordCount: number;
    };
    subscribers: {
      [k in string]: {
        id: string;
        subscribedAt: number;
      };
    };
  };
};

let store: Store<CollectionMap>;

beforeAll(() => {
  store = createMockStore<CollectionMap, {}>({
    namespace: 'test',
    logger: silentLogger,
  });
});

beforeEach(() => {
  store.flush();
});

describe('Atomic: Lock', () => {
  test('Concurrent Additions to same collection does NOT overwrite', async () => {
    // The first transaction has a very high latency
    getRedisMockClient.DELAY = 1000;
    store.addItemToCollection(
      'simpleItems',
      {
        name: 'Gigi',
        age: 23,
      },
      'g1',
      { foreignKeys: {} }
    );

    // The second one has a lower one, which thus would allow the 2nd to be created before the first in a naive (unlocking) system
    getRedisMockClient.DELAY = 100;
    store
      .addItemToCollection(
        'simpleItems',
        {
          name: 'Jack',
          age: 28,
        },
        'g2',
        { foreignKeys: {} }
      )
      .resolve();

    getRedisMockClient.DELAY = 50;
    // The third one is the same as the 2nd
    // With the addition that we wait for it to resolve, which in turn waits for the first two as well
    await store
      .addItemToCollection(
        'simpleItems',
        {
          name: 'John',
          age: 30,
        },
        'g3',
        { foreignKeys: {} }
      )
      .resolve();

    const actual = await AsyncResult.all(
      store.getItemInCollection('simpleItems', 'g1'),
      store.getItemInCollection('simpleItems', 'g2')
    ).resolve();

    expect(actual).toEqual(
      new Ok([
        {
          name: 'Gigi',
          id: 'g1',
          age: 23,
        },
        {
          name: 'Jack',
          id: 'g2',
          age: 28,
        },
      ])
    );
  });

  // TODO: Bring back after!
  test('Multiple Updates are processed in order', async () => {
    await store
      .addItemToCollection(
        'simpleItems',
        {
          name: 'John',
          age: 23,
        },
        'g1',
        { foreignKeys: {} }
      )
      .resolve();

    // Set a higher delay
    getRedisMockClient.DELAY = 500;
    store.updateItemInCollection(
      'simpleItems',
      'g1',
      {
        name: 'Jack',
        age: 34,
      },
      { foreignKeys: {} }
    );

    // Set a lower delay to simulate network differences
    getRedisMockClient.DELAY = 50;
    await store
      .updateItemInCollection(
        'simpleItems',
        'g1',
        { name: 'Arnold' },
        { foreignKeys: {} }
      )
      .resolve();

    const actual = await store
      .getItemInCollection('simpleItems', 'g1')
      .resolve();

    expect(actual).toEqual(
      new Ok({
        id: 'g1',
        name: 'Arnold',
        age: 34,
      })
    );
  });

  test('Concurrent Updates are processed in order and waited for the updated version', async () => {
    await store
      .addItemToCollection(
        'complexItems',
        {
          val: {
            type: 'test-A',
            recordCount: 0,
          },
          subscribers: {},
        },
        'g1',
        { foreignKeys: {} }
      )
      .resolve();

    await AsyncResult.all(
      store.updateItemInCollection(
        'complexItems',
        'g1',
        (prev) => ({
          subscribers: {
            ...prev.subscribers,
            a: {
              id: 'a',
              subscribedAt: 1,
            },
          },
        }),
        { foreignKeys: {} }
      ),
      store.updateItemInCollection(
        'complexItems',
        'g1',
        (prev) => ({
          subscribers: {
            ...prev.subscribers,
            b: {
              id: 'b',
              subscribedAt: 2,
            },
          },
        }),
        { foreignKeys: {} }
      )
    ).resolve();

    getRedisMockClient.DELAY = 100;

    const actual = await store
      .getItemInCollection('complexItems', 'g1')
      .resolve();

    expect(actual).toEqual(
      new Ok({
        id: 'g1',
        val: {
          type: 'test-A',
          recordCount: 0,
        },
        subscribers: {
          a: {
            id: 'a',
            subscribedAt: 1,
          },
          b: {
            id: 'b',
            subscribedAt: 2,
          },
        },
      })
    );
  });

  test('A failed updated doesnt hold the Lock', async () => {
    await store
      .addItemToCollection(
        'simpleItems',
        {
          name: 'John',
          age: 23,
        },
        'g1',
        { foreignKeys: {} }
      )
      .resolve();

    // Set a higher delay
    getRedisMockClient.DELAY = 500;
    store.updateItemInCollection(
      'simpleItems',
      'g12',
      {
        name: 'Jack',
        age: 34,
      },
      { foreignKeys: {} }
    );

    // Set a lower delay to simulate network differences
    getRedisMockClient.DELAY = 50;
    await store
      .updateItemInCollection(
        'simpleItems',
        'g1',
        { name: 'Arnold' },
        { foreignKeys: {} }
      )
      .resolve();

    const actual = await store
      .getItemInCollection('simpleItems', 'g1')
      .resolve();

    expect(actual).toEqual(
      new Ok({
        id: 'g1',
        name: 'Arnold',
        age: 23,
      })
    );
  });
});
