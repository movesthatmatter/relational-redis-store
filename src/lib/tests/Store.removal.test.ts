import { createMockStore } from '../mockStoreFactory';
import { Store } from '../Store';
import { CollectionMap, QueueMap, silentLogger } from './testUtils';
import { Ok } from 'ts-results';
import { AsyncResult } from 'ts-async-results';

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

// TODO: Bring back after fix!
describe('Removal', () => {
  test('Removes a Simple Item', async () => {
    const input = {
      hasJoinedRoom: false,
      joinedRoomId: null,
      joinedRoomAt: null,
      user: {
        avatarId: '2',
        name: 'Johnny',
        id: '1',
        isGuest: true,
      },
    } as const;

    const actualAfterAddition = await store
      .addItemToCollection('peers', input, undefined, { foreignKeys: {} })
      .resolve();

    expect(actualAfterAddition).toEqual(
      new Ok({
        item: {
          ...input,
          id: '1',
        },
        index: 1,
        length: 1,
      })
    );

    const removeRes = await store
      .removeItemInCollection('peers', '1')
      .resolve();

    expect(removeRes).toEqual(
      new Ok({
        index: 1,
        item: undefined,
        length: 0,
      })
    );

    const actualAfterRemoval = await store
      .getItemInCollection('peers', '1')
      .resolve();

    expect(actualAfterRemoval.ok).toBe(false);
    expect(actualAfterRemoval.val).toBe('CollectionFieldInexistent');
  });

  test('Removing an Item with one IndexBy also removes the index', async () => {
    const input = {
      createdBy: 'u1',
      createdByUser: {
        id: '1',
        firstName: 'Gari',
        lastName: 'Kasarov',
        name: 'Gari Kasparov',
        avatarId: '23',
        isGuest: true,
      },
      createdAt: String(new Date()),
      type: 'private',
      gameSpecs: {
        timeLimit: 'blitz5',
        preferredColor: 'random',
      },
      slug: 'asda',
    } as const;

    await store
      .addItemToCollection('challenges', input, 'c1', {
        foreignKeys: {},
        indexBy: ['createdBy'],
      })
      .resolve();

    const addedItemByIndex = await store
      .getItemInCollectionBy('challenges', 'createdBy', 'u1')
      .resolve();

    expect(addedItemByIndex).toEqual(
      new Ok({
        ...input,
        id: 'c1',
      })
    );

    // // Remove the item
    await store.removeItemInCollection('challenges', 'c1').resolve();

    const actualItemAfterRemoval = await store
      .getItemInCollection('challenges', 'c1')
      .resolve();

    expect(actualItemAfterRemoval.ok).toBe(false);
    expect(actualItemAfterRemoval.val).toBe('CollectionFieldInexistent');

    // Instead of testig the implementation of the indexBy at the DB leve,
    //  simulate a Use Case that could create a bug with not removing the indexes

    // Add the same Item again, with the same ID, but w/o the indexBy
    await store
      .addItemToCollection('challenges', input, 'c1', {
        foreignKeys: {},
      })
      .resolve();

    const newItemByPreviousIndex = await store
      .getItemInCollectionBy('challenges', 'createdBy', 'u1')
      .resolve();

    expect(newItemByPreviousIndex.ok).toBe(false);
    expect(newItemByPreviousIndex.val).toBe('CollectionFieldInexistent');
  });

  test('Removing an Item with multiple IndexBy', async () => {
    const createdAt = String(new Date());
    const type = 'private';
    const createdBy = 'u1';
    const input = {
      createdBy,
      createdByUser: {
        id: '1',
        firstName: 'Gari',
        lastName: 'Kasarov',
        name: 'Gari Kasparov',
        avatarId: '23',
        isGuest: true,
      },
      createdAt,
      type,
      gameSpecs: {
        timeLimit: 'blitz5',
        preferredColor: 'random',
      },
      slug: 'asda',
    } as const;

    await store
      .addItemToCollection('challenges', input, 'c1', {
        foreignKeys: {},
        indexBy: ['createdBy', 'type', 'createdAt'],
      })
      .resolve();

    const actualItemByCreatedByIndex = await store
      .getItemInCollectionBy('challenges', 'createdBy', createdBy)
      .resolve();

    expect(actualItemByCreatedByIndex).toEqual(
      new Ok({
        ...input,
        id: 'c1',
      })
    );

    const actualItemByCreatedAtIndex = await store
      .getItemInCollectionBy('challenges', 'createdAt', createdAt)
      .resolve();

    expect(actualItemByCreatedAtIndex).toEqual(
      new Ok({
        ...input,
        id: 'c1',
      })
    );

    const actualItemByTypeIndex = await store
      .getItemInCollectionBy('challenges', 'type', type)
      .resolve();

    expect(actualItemByTypeIndex).toEqual(
      new Ok({
        ...input,
        id: 'c1',
      })
    );

    // Remove the item
    await store.removeItemInCollection('challenges', 'c1').resolve();

    const actualItemAfterRemoval = await store
      .getItemInCollection('challenges', 'c1')
      .resolve();

    expect(actualItemAfterRemoval.ok).toBe(false);

    // Instead of testig the implementation of the indexBy at the DB leve,
    //  simulate a Use Case that could create a bug with not removing the indexes

    // Add the same Item again, with the same ID, but w/o the indexBy
    await store
      .addItemToCollection('challenges', input, 'c1', {
        foreignKeys: {},
      })
      .resolve();

    // Attempt to get by createdBy
    const newItemByPreviousCreatedByIndex = await store
      .getItemInCollectionBy('challenges', 'createdBy', createdBy)
      .resolve();

    expect(newItemByPreviousCreatedByIndex.ok).toBe(false);
    expect(newItemByPreviousCreatedByIndex.val).toBe(
      'CollectionFieldInexistent'
    );

    // Attempt to get by createdAt
    const newItemByPreviousCreatedAtIndex = await store
      .getItemInCollectionBy('challenges', 'createdBy', createdAt)
      .resolve();

    expect(newItemByPreviousCreatedAtIndex.ok).toBe(false);
    expect(newItemByPreviousCreatedAtIndex.val).toBe(
      'CollectionFieldInexistent'
    );

    // Attempt to get by type
    const newItemByPreviousTypeIndex = await store
      .getItemInCollectionBy('challenges', 'type', createdAt)
      .resolve();

    expect(newItemByPreviousTypeIndex.ok).toBe(false);
    expect(newItemByPreviousTypeIndex.val).toBe('CollectionFieldInexistent');
  });

  test('Remove Item by Index', async () => {
    const input = {
      createdBy: 'u1',
      createdAt: String(new Date()),
      createdByUser: {
        id: '1',
        firstName: 'Gari',
        lastName: 'Kasarov',
        name: 'Gari Kasparov',
        avatarId: '23',
        isGuest: true,
      },
      type: 'private',
      gameSpecs: {
        timeLimit: 'blitz5',
        preferredColor: 'random',
      },
      slug: 'asda',
    } as const;

    await store
      .addItemToCollection('challenges', input, 'c1', {
        foreignKeys: {},
        indexBy: ['createdBy'],
      })
      .resolve();

    const addedItemByIndex = await store
      .getItemInCollectionBy('challenges', 'createdBy', 'u1')
      .resolve();

    expect(addedItemByIndex).toEqual(
      new Ok({
        ...input,
        id: 'c1',
      })
    );

    // // Remove the item
    await store
      .removeItemInCollectionBy('challenges', 'createdBy', 'u1')
      .resolve();

    const actualItemAfterRemoval = await store
      .getItemInCollection('challenges', 'c1')
      .resolve();

    expect(actualItemAfterRemoval.ok).toBe(false);
    expect(actualItemAfterRemoval.val).toBe('CollectionFieldInexistent');

    // Instead of testing the implementation of the indexBy at the DB leve,
    //  simulate a Use Case that could create a bug with not removing the indexes

    // Add the same Item again, with the same ID, but w/o the indexBy
    await store
      .addItemToCollection('challenges', input, 'c1', {
        foreignKeys: {},
      })
      .resolve();

    const newItemByPreviousIndex = await store
      .getItemInCollectionBy('challenges', 'createdBy', 'u1')
      .resolve();

    expect(newItemByPreviousIndex.ok).toBe(false);
    expect(newItemByPreviousIndex.val).toBe('CollectionFieldInexistent');
  });

  test('Remove Entire Collection', async () => {
    await AsyncResult.all(
      store.addItemToCollection(
        'simpleItems',
        {
          name: 'test 1',
          age: 23,
        },
        't1',
        {
          foreignKeys: {},
        }
      ),
      store.addItemToCollection(
        'simpleItems',
        {
          name: 'test 2',
          age: 26,
        },
        't2',
        {
          foreignKeys: {},
        }
      ),
      store.addItemToCollection(
        'simpleItems',
        {
          name: 'test 3',
          age: 36,
        },
        't3',
        {
          foreignKeys: {},
        }
      )
    ).resolve();

    const readItems = await store
      .getAllItemsInCollection('simpleItems')
      .resolve();

    expect(readItems).toEqual(
      new Ok([
        {
          id: 't1',
          name: 'test 1',
          age: 23,
        },
        {
          id: 't2',
          name: 'test 2',
          age: 26,
        },
        {
          id: 't3',
          name: 'test 3',
          age: 36,
        },
      ])
    );

    await store.removeCollection('simpleItems').resolve();

    const actual = await store.getAllItemsInCollection('simpleItems').resolve();

    expect(actual).toEqual(new Ok([]));
  });
});
