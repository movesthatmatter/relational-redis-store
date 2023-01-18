import { createMockStore } from '../mockStoreFactory';
import { Store } from '../Store';
import { CollectionMap, silentLogger } from './testUtils';
import { Ok } from 'ts-results';

let store: Store<CollectionMap, {}>;

beforeAll(() => {
  store = createMockStore<CollectionMap, {}>({
    namespace: 'test',
    logger: silentLogger,
  });
});

beforeEach(() => {
  store.flush();
});

describe('Addition', () => {
  test('Simple Addition', async () => {
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

    const actual = await store
      .addItemToCollection('peers', input, undefined, { foreignKeys: {} })
      .resolve();

    expect(actual).toEqual(
      new Ok({
        item: {
          ...input,
          id: '1',
        },
        index: 1,
        length: 1,
      })
    );
  });

  test('Addition with "oneToMany" ForeignKeys', async () => {
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
    const actual = await store
      .addItemToCollection('peers', input, 'p3', {
        foreignKeys: {
          user: {
            type: 'oneToMany',
            collection: 'guests',
          },
        },
      })
      .resolve();

    expect(actual).toEqual(
      new Ok({
        item: {
          ...input,
          id: 'p3',
          user: {
            g5: {
              ...guestInput,
              id: 'g5',
            },
          },
        },
        index: 1,
        length: 1,
      })
    );
  });

  test('Addition with "oneToMany" ForeignKeys but empty ForeignValues', async () => {
    const input = {
      hasJoinedRoom: false,
      joinedRoomId: null,
      joinedRoomAt: null,
      user: {},
    } as const;
    const actual = await store
      .addItemToCollection('peers', input, 'p3', {
        foreignKeys: {
          user: {
            type: 'oneToMany',
            collection: 'guests',
          },
        },
      })
      .resolve();

    expect(actual).toEqual(
      new Ok({
        item: {
          ...input,
          id: 'p3',
          user: {},
        },
        index: 1,
        length: 1,
      })
    );
  });

  test('Addition with ForeignKey as Single Value (one to one relationship)', async () => {
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
      user: 'g5',
    } as const;
    const actual = await store
      .addItemToCollection('peers', input, 'p3', {
        foreignKeys: {
          user: {
            type: 'oneToOne',
            collection: 'guests',
          },
        },
      })
      .resolve();

    expect(actual).toEqual(
      new Ok({
        item: {
          ...input,
          id: 'p3',
          user: {
            ...guestInput,
            id: 'g5',
          },
        },
        index: 1,
        length: 1,
      })
    );
  });

  test('Addition with with multiple ForeignKeys and multiple Values', async () => {
    const guestInput1 = {
      avatarId: '12',
      name: 'Travolta',
      isGuest: true,
    } as const;
    const guestInput2 = {
      avatarId: '3',
      name: 'Beckham',
      isGuest: true,
    } as const;

    await store
      .addItemToCollection('guests', guestInput1, 'g5', { foreignKeys: {} })
      .resolve();

    await store
      .addItemToCollection('guests', guestInput2, 'g7', { foreignKeys: {} })
      .resolve();

    const input = {
      hasJoinedRoom: false,
      joinedRoomId: null,
      joinedRoomAt: null,
      user: {
        g5: null,
        g7: null,
      },
    } as const;
    const actual = await store
      .addItemToCollection('peers', input, 'p3', {
        foreignKeys: {
          user: {
            type: 'oneToMany',
            collection: 'guests',
          },
        },
      })
      .resolve();

    expect(actual).toEqual(
      new Ok({
        item: {
          ...input,
          id: 'p3',
          user: {
            g5: {
              ...guestInput1,
              id: 'g5',
            },
            g7: {
              ...guestInput2,
              id: 'g7',
            },
          },
        },
        index: 1,
        length: 1,
      })
    );
  });

  test('Addition with with a "oneToOne" & "oneToMany" ForeignKeys Collections', async () => {
    const guestInput = {
      avatarId: '12',
      name: 'Travolta',
      isGuest: true,
    } as const;

    const peerInput = {
      avatarId: '3',
      name: 'Beckham',
      hasJoinedRoom: false,
      joinedRoomId: null,
      joinedRoomAt: null,
      isGuest: true,
      user: {
        id: 'g1',
        ...guestInput,
      },
    } as const;

    await store
      .addItemToCollection('guests', guestInput, 'g1', { foreignKeys: {} })
      .resolve();

    await store
      .addItemToCollection('peers', peerInput, 'p1', { foreignKeys: {} })
      .resolve();

    const input = {
      user: 'g1',
      peer: {
        p1: null,
      },
    } as const;

    const actual = await store
      .addItemToCollection('itemWithMultipleForeignCollections', input, 'p3', {
        foreignKeys: {
          peer: {
            type: 'oneToMany',
            collection: 'peers',
          },
          user: {
            type: 'oneToOne',
            collection: 'guests',
          },
        },
      })
      .resolve();

    expect(actual).toEqual(
      new Ok({
        item: {
          ...input,
          id: 'p3',
          user: {
            id: 'g1',
            ...guestInput,
          },
          peer: {
            p1: {
              id: 'p1',
              ...peerInput,
            },
          },
        },
        index: 1,
        length: 1,
      })
    );
  });

  test('Test Former Bug – Addition with with a "oneToOne" and "oneToMany" ForeignKeys Collections but the "oneToMany" values dont exist yet"', async () => {
    const guestInput = {
      avatarId: '12',
      name: 'Travolta',
      isGuest: true,
    } as const;

    await store
      .addItemToCollection('guests', guestInput, 'g1', { foreignKeys: {} })
      .resolve();

    const input = {
      user: 'g1',
      peer: {},
    } as const;

    const actual = await store
      .addItemToCollection('itemWithMultipleForeignCollections', input, 'p3', {
        foreignKeys: {
          peer: {
            type: 'oneToMany',
            collection: 'peers',
          },
          user: {
            type: 'oneToOne',
            collection: 'guests',
          },
        },
      })
      .resolve();

    expect(actual).toEqual(
      new Ok({
        item: {
          ...input,
          id: 'p3',
          user: {
            id: 'g1',
            ...guestInput,
          },
          peer: {},
        },
        index: 1,
        length: 1,
      })
    );
  });
});
