import { createMockStore } from '../mockStoreFactory';
import { Store } from '../Store';
import { CollectionMap, QueueMap, silentLogger } from './testUtils';
import { Ok, Err } from 'ts-results';
import { AsyncResultWrapper } from 'ts-async-results';

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

describe('Update', () => {
  test('Trying to update an inexistent item return ERR("CollectionItemInexistent")', async () => {
    const now = String(new Date());

    const actual = await store
      .updateItemInCollection(
        'peers',
        '1',
        {
          hasJoinedRoom: true,
          joinedRoomAt: now,
          joinedRoomId: '3',
        },
        {
          foreignKeys: {},
        }
      )
      .resolve();

    expect(actual.ok).toBe(false);
    expect(actual.val).toBe('CollectionFieldInexistent');
  });

  test('Updates simple item', async () => {
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

    await store
      .addItemToCollection('peers', input, 'p1', { foreignKeys: {} })
      .resolve();

    const now = String(new Date());

    const actual = await store
      .updateItemInCollection(
        'peers',
        'p1',
        {
          hasJoinedRoom: true,
          joinedRoomAt: now,
          joinedRoomId: '3',
        },
        {
          foreignKeys: {},
        }
      )
      .resolve();

    expect(actual).toEqual(
      new Ok({
        ...input,
        id: 'p1',
        hasJoinedRoom: true,
        joinedRoomAt: now,
        joinedRoomId: '3',
      })
    );
  });

  test('Trying to Update Item with Mismatching Foreign Keys throw Error', async () => {
    const guestInput = {
      avatarId: '12',
      name: 'Travolta',
      isGuest: true,
    } as const;
    await store
      .addItemToCollection('guests', guestInput, 'g5', { foreignKeys: {} })
      .resolve();

    const input = {
      hasJoinedRoom: false,
      joinedRoomId: null,
      joinedRoomAt: null,
      user: {
        g5: null,
      },
    } as const;

    await store
      .addItemToCollection('peers', input, 'p1', {
        foreignKeys: {
          user: {
            type: 'oneToMany',
            collection: 'guests',
          },
        },
      })
      .resolve();

    const now = String(new Date());

    const actual = await store
      .updateItemInCollection(
        'peers',
        'p1',
        {
          hasJoinedRoom: true,
          joinedRoomAt: now,
          joinedRoomId: '3',
        },
        {
          foreignKeys: {},
        }
      )
      .resolve();

    expect(actual.ok).toBe(false);
    expect(actual.val).toBe('CollectionUpdateFailure:MismatchingForeignKeys');
  });

  test('Updates with getter function for easy merging w/o ForeignKeys', async () => {
    const guestInput = {
      avatarId: '12',
      name: 'Travolta',
      isGuest: true,
    } as const;
    await store
      .addItemToCollection('guests', guestInput, 'g5', { foreignKeys: {} })
      .resolve();

    // const updateGetterSpy = jest.fn();

    const actual = await store
      .updateItemInCollection(
        'guests',
        'g5',
        (prev) => ({
          name: 'John ' + prev.name,
        }),
        {
          foreignKeys: {},
        }
      )
      .resolve();

    expect(actual).toEqual(
      new Ok({
        ...guestInput,
        id: 'g5',
        name: 'John Travolta',
      })
    );
  });

  test('Updates with getter function for easy merging WITH ForeignKeys', async () => {
    const guestInput = {
      avatarId: '12',
      name: 'Travolta',
      isGuest: true,
    } as const;

    await store
      .addItemToCollection('guests', guestInput, 'g5', { foreignKeys: {} })
      .resolve();

    const input = {
      hasJoinedRoom: false,
      joinedRoomId: null,
      joinedRoomAt: null,
      user: {
        g5: null,
      },
    } as const;

    await store
      .addItemToCollection('peers', input, 'p1', {
        foreignKeys: {
          user: {
            type: 'oneToMany',
            collection: 'guests',
          },
        },
      })
      .resolve();

    const updateGetterSpy = jest.fn();

    const actual = await store
      .updateItemInCollection(
        'peers',
        'p1',
        (prev) => {
          updateGetterSpy(prev);

          return {
            hasJoinedRoom: true,
          };
        },
        {
          foreignKeys: {
            user: {
              type: 'oneToMany',
              collection: 'guests',
            },
          },
        }
      )
      .resolve();

    expect(updateGetterSpy).toHaveBeenCalledWith(input);
    expect(actual).toEqual(
      new Ok({
        ...input,
        hasJoinedRoom: true,
        id: 'p1',
        user: {
          g5: {
            ...guestInput,
            id: 'g5',
          },
        },
      })
    );
  });

  test('Updates with getter function that returns an AsyncOk Result for easy merging w/o ForeignKeys', async () => {
    const guestInput = {
      avatarId: '12',
      name: 'Travolta',
      isGuest: true,
    } as const;
    await store
      .addItemToCollection('guests', guestInput, 'g5', { foreignKeys: {} })
      .resolve();

    // const updateGetterSpy = jest.fn();

    const actual = await store
      .updateItemInCollection(
        'guests',
        'g5',
        (prev) => {
          return new AsyncResultWrapper(() => {
            return new Promise((resolve) => {
              resolve(
                new Ok({
                  name: 'John ' + prev.name + ' 2nd',
                })
              );
            });
          });
        },
        {
          foreignKeys: {},
        }
      )
      .resolve();

    expect(actual).toEqual(
      new Ok({
        ...guestInput,
        id: 'g5',
        name: 'John Travolta 2nd',
      })
    );
  });

  test('Attempting to Update using getter function that returns an AsyncErr Result w/o ForeignKeys throws an Err', async () => {
    const guestInput = {
      avatarId: '12',
      name: 'Travolta',
      isGuest: true,
    } as const;
    await store
      .addItemToCollection('guests', guestInput, 'g5', { foreignKeys: {} })
      .resolve();

    // const updateGetterSpy = jest.fn();

    const actual = await store
      .updateItemInCollection(
        'guests',
        'g5',
        (prev) => {
          return new AsyncResultWrapper(() => {
            return new Promise((resolve) => {
              resolve(new Err('Cant work'));
            });
          });
        },
        {
          foreignKeys: {},
        }
      )
      .resolve();

    expect(actual.ok).toBe(false);
    expect(actual.val).toEqual('CollectionUpdateFailure');
  });

  test('Updating using getter function that returns an AsyncOk Result WITH ForeignKeys', async () => {
    const guestInput = {
      avatarId: '12',
      name: 'Travolta',
      isGuest: true,
    } as const;
    await store
      .addItemToCollection('guests', guestInput, 'g5', { foreignKeys: {} })
      .resolve();

    const input = {
      hasJoinedRoom: false,
      joinedRoomId: null,
      joinedRoomAt: null,
      user: {
        g5: null,
      },
    } as const;

    await store
      .addItemToCollection('peers', input, 'p1', {
        foreignKeys: {
          user: {
            type: 'oneToMany',
            collection: 'guests',
          },
        },
      })
      .resolve();

    const updateGetterSpy = jest.fn();

    const actual = await store
      .updateItemInCollection(
        'peers',
        'p1',
        (prev) => {
          return new AsyncResultWrapper(() => {
            return new Promise((resolve) => {
              updateGetterSpy(prev);

              resolve(
                new Ok({
                  hasJoinedRoom: true,
                })
              );
            });
          });
        },
        {
          foreignKeys: {
            user: {
              type: 'oneToMany',
              collection: 'guests',
            },
          },
        }
      )
      .resolve();

    expect(updateGetterSpy).toHaveBeenCalledWith(input);
    expect(actual).toEqual(
      new Ok({
        ...input,
        id: 'p1',
        hasJoinedRoom: true,
        user: {
          g5: {
            ...guestInput,
            id: 'g5',
          },
        },
      })
    );
  });

  test('Attempting to Update using getter function that returns an AsyncErr Result WITH ForeignKeys throws an Err', async () => {
    const guestInput = {
      avatarId: '12',
      name: 'Travolta',
      isGuest: true,
    } as const;
    await store
      .addItemToCollection('guests', guestInput, 'g5', { foreignKeys: {} })
      .resolve();

    const input = {
      hasJoinedRoom: false,
      joinedRoomId: null,
      joinedRoomAt: null,
      user: {
        g5: null,
      },
    } as const;

    await store
      .addItemToCollection('peers', input, 'p1', {
        foreignKeys: {
          user: {
            type: 'oneToMany',
            collection: 'guests',
          },
        },
      })
      .resolve();

    const updateGetterSpy = jest.fn();

    const actual = await store
      .updateItemInCollection(
        'peers',
        'p1',
        (prev) => {
          return new AsyncResultWrapper(() => {
            return new Promise((resolve) => {
              updateGetterSpy(prev);

              resolve(
                new Err({
                  hasJoinedRoom: true,
                })
              );
            });
          });
        },
        {
          foreignKeys: {
            user: {
              type: 'oneToMany',
              collection: 'guests',
            },
          },
        }
      )
      .resolve();

    expect(actual.ok).toBe(false);
    expect(updateGetterSpy).toHaveBeenCalledWith(input);
    expect(actual.val).toEqual('CollectionUpdateFailure');
  });

  test('Updating an Item with one IndexBy, also updates the index value if it changed', async () => {
    const now = String(new Date());

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
      createdAt: now,
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

    expect(addedItemByIndex.ok).toBe(true);
    expect(addedItemByIndex.val).toEqual({
      ...input,
      id: 'c1',
    });

    // Update the item
    await store
      .updateItemInCollection(
        'challenges',
        'c1',
        { createdBy: 'u222' },
        { foreignKeys: {} }
      )
      .resolve();

    const actualItemAfterUpdate = await store
      .getItemInCollection('challenges', 'c1')
      .resolve();

    expect(actualItemAfterUpdate).toEqual(
      new Ok({
        ...input,
        id: 'c1',
        createdBy: 'u222',
      })
    );

    const updatedItemByUpdatedByOldCreatedBy = await store
      .getItemInCollectionBy('challenges', 'createdBy', 'u1')
      .resolve();

    expect(updatedItemByUpdatedByOldCreatedBy.ok).toBe(false);

    const updatedItemByUpdatedCreatedBy = await store
      .getItemInCollectionBy('challenges', 'createdBy', 'u222')
      .resolve();

    expect(updatedItemByUpdatedCreatedBy).toEqual(
      new Ok({
        ...input,
        createdBy: 'u222',
        id: 'c1',
      })
    );
  });

  test('Updating an Item with one IndexBy multiple times back and forth between the value', async () => {
    const now = String(new Date());

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
      createdAt: now,
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

    // Update the item to a new Index Vlaue (createdBy)
    await store
      .updateItemInCollection(
        'challenges',
        'c1',
        { createdBy: 'u2' },
        { foreignKeys: {} }
      )
      .resolve();

    const actualItemAfterUpdateToNewValue = await store
      .getItemInCollectionBy('challenges', 'createdBy', 'u2')
      .resolve();

    expect(actualItemAfterUpdateToNewValue).toEqual(
      new Ok({
        ...input,
        id: 'c1',
        createdBy: 'u2',
      })
    );

    // Update the item to another new Index Vlaue (createdBy)
    await store
      .updateItemInCollection(
        'challenges',
        'c1',
        { createdBy: 'u3' },
        { foreignKeys: {} }
      )
      .resolve();

    const actualItemAfterUpdateToNewerValue = await store
      .getItemInCollectionBy('challenges', 'createdBy', 'u3')
      .resolve();

    expect(actualItemAfterUpdateToNewerValue).toEqual(
      new Ok({
        ...input,
        id: 'c1',
        createdBy: 'u3',
      })
    );

    // Update the item to the previous Index Value (createdBy)
    await store
      .updateItemInCollection(
        'challenges',
        'c1',
        { createdBy: 'u1' },
        { foreignKeys: {} }
      )
      .resolve();

    const actualItemAfterUpdateToOldValue = await store
      .getItemInCollectionBy('challenges', 'createdBy', 'u1')
      .resolve();

    expect(actualItemAfterUpdateToOldValue).toEqual(
      new Ok({
        ...input,
        id: 'c1',
        createdBy: 'u1',
      })
    );
  });

  test('an Item updated with an IndexBy cannot be retrieved by old IndexBy', async () => {
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

    // Update the item to a new Index Vlaue (createdBy)
    await store
      .updateItemInCollection(
        'challenges',
        'c1',
        { createdBy: 'u2' },
        { foreignKeys: {} }
      )
      .resolve();

    const actualItemAfterUpdateToNewValue = await store
      .getItemInCollectionBy('challenges', 'createdBy', 'u2')
      .resolve();

    expect(actualItemAfterUpdateToNewValue).toEqual(
      new Ok({
        ...input,
        id: 'c1',
        createdBy: 'u2',
      })
    );

    const actualItemReferenceByOldindexByValue = await store
      .getItemInCollectionBy('challenges', 'createdBy', 'u1')
      .resolve();

    expect(actualItemReferenceByOldindexByValue.ok).toBe(false);
  });

  test('Updating an Item with multiple IndexBy, also updates the all index value if they changed', async () => {
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
        indexBy: ['createdBy', 'type', 'slug'],
      })
      .resolve();

    const itemByCreatedBy = await store
      .getItemInCollectionBy('challenges', 'createdBy', 'u1')
      .resolve();

    expect(itemByCreatedBy).toEqual(
      new Ok({
        ...input,
        id: 'c1',
      })
    );

    const itemByType = await store
      .getItemInCollectionBy('challenges', 'type', 'private')
      .resolve();

    expect(itemByType).toEqual(
      new Ok({
        ...input,
        id: 'c1',
      })
    );

    const itemBySlug = await store
      .getItemInCollectionBy('challenges', 'slug', 'asda')
      .resolve();

    expect(itemBySlug).toEqual(
      new Ok({
        ...input,
        id: 'c1',
      })
    );

    // Update the item
    await store
      .updateItemInCollection(
        'challenges',
        'c1',
        { createdBy: 'u222', slug: '123' },
        { foreignKeys: {} }
      )
      .resolve();

    const actualItemAfterUpdate = await store
      .getItemInCollection('challenges', 'c1')
      .resolve();

    expect(actualItemAfterUpdate).toEqual(
      new Ok({
        ...input,
        id: 'c1',
        createdBy: 'u222',
        slug: '123',
      })
    );

    const updatedItemByUpdatedNewCreatedBy = await store
      .getItemInCollectionBy('challenges', 'createdBy', 'u222')
      .resolve();

    expect(updatedItemByUpdatedNewCreatedBy).toEqual(
      new Ok({
        ...input,
        createdBy: 'u222',
        id: 'c1',
        slug: '123',
      })
    );

    const updatedItemByUpdatedByNewSlug = await store
      .getItemInCollectionBy('challenges', 'slug', '123')
      .resolve();

    expect(updatedItemByUpdatedByNewSlug).toEqual(
      new Ok({
        ...input,
        createdBy: 'u222',
        id: 'c1',
        slug: '123',
      })
    );

    const updatedItemByUpdatedByOldType = await store
      .getItemInCollectionBy('challenges', 'type', 'private')
      .resolve();

    expect(updatedItemByUpdatedByOldType).toEqual(
      new Ok({
        ...input,
        createdBy: 'u222',
        id: 'c1',
        slug: '123',
      })
    );
  });
});
