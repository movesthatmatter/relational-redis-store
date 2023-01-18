import { createMockStore } from '../mockStoreFactory';
import { Store } from '../Store';
import { CollectionMap, QueueMap, silentLogger } from './testUtils';
import { Ok } from 'ts-results';

let store: Store<CollectionMap, QueueMap>;

beforeAll(() => {
  store = createMockStore<CollectionMap, QueueMap>({
    namespace: 'test',
    logger: silentLogger,
  });
});

beforeEach(() => {
  store.flush();
});

describe('Queue', () => {
  describe('removal', () => {
    test('removes an existent item', async () => {
      const qpInput1 = {
        challengeId: 'qp1',
      };

      await store.enqueue('quickPairings', qpInput1).resolve();

      const actualBeforeRemoval = await store
        .getQueueSize('quickPairings')
        .resolve();

      expect(actualBeforeRemoval).toEqual(new Ok(1));

      const removalResponse = await store
        .removeFromQueue('quickPairings', qpInput1)
        .resolve();

      expect(removalResponse).toEqual(new Ok(undefined));

      const actualAfterRemoval = await store
        .getQueueSize('quickPairings')
        .resolve();

      expect(actualAfterRemoval).toEqual(new Ok(0));
    });

    test('returns error when item not exactly the same', async () => {
      const qpInput1 = {
        challengeId: 'qp1',
      };

      await store.enqueue('quickPairings', qpInput1).resolve();

      const actualBeforeRemoval = await store
        .getQueueSize('quickPairings')
        .resolve();

      expect(actualBeforeRemoval).toEqual(new Ok(1));

      const removalResponse = await store
        .removeFromQueue('quickPairings', {
          ...qpInput1,
          challengeId: 'qp2',
        })
        .resolve();

      expect(removalResponse.ok).toBe(false);
      expect(removalResponse.val).toBe('QueueItemNotFound');

      const actualAfterRemoval = await store
        .getQueueSize('quickPairings')
        .resolve();

      expect(actualAfterRemoval).toEqual(new Ok(1));
    });

    test('finds and removes the correct item even if its data structure is complicated/scrambled and could trip the JSON.stringify()', async () => {
      const qpInput1: QueueMap['queueWithManyKeys'] = {
        simpleStringKey: 'asd',
        nestedKey: {
          simpleNummberKey: 2,
          arrayOfNumber: [4, 5],
        },
        arrayOfString: ['hey', 'yo'],
      };

      await store.enqueue('queueWithManyKeys', qpInput1).resolve();

      const actualBeforeRemoval = await store
        .getQueueSize('queueWithManyKeys')
        .resolve();

      expect(actualBeforeRemoval).toEqual(new Ok(1));

      // This is scrambled on purpose
      const removalResponse = await store
        .removeFromQueue('queueWithManyKeys', {
          nestedKey: {
            arrayOfNumber: [4, 5],
            simpleNummberKey: 2,
          },
          arrayOfString: ['hey', 'yo'],
          simpleStringKey: 'asd',
        })
        .resolve();

      expect(removalResponse).toEqual(new Ok(undefined));

      const actualAfterRemoval = await store
        .getQueueSize('quickPairings')
        .resolve();

      expect(actualAfterRemoval).toEqual(new Ok(0));
    });
  });
});