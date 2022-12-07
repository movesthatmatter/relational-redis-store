import { Err, Ok } from 'ts-results';
import { AsyncResult, AsyncResultWrapper } from 'ts-async-results';
import { getRedisMockClient } from './redisMock';
import { loggerUtil } from './logger';
import { createMockStore } from './mockStoreFactory';

type Guest = {
  avatarId: string;
  name: string;
  id: string;
  isGuest: true;
};
type Peer = {
  id: string;
  hasJoinedRoom: boolean;
  joinedRoomId: null | string;
  joinedRoomAt: null | string;
  user: Guest;
};

type ChallengeRecord = {
  id: string;
  gameSpecs: {
    timeLimit: 'bullet30' | 'bullet1' | 'blitz2' | 'blitz3' | 'blitz5';
    preferredColor?: 'white' | 'black' | 'random';
    gameType?: 'chess';
  };
  createdBy: string;
  createdAt: string;
  slug: string;
  type: 'public' | 'private';
};

type CollectionMap = {
  peers: Peer;
  guests: Guest;
  challenges: ChallengeRecord;
  simpleItems: {
    id: string;
    name: string;
    age: number;
  };
  itemWithMultipleForeignCollections: {
    id: string;
    user: Guest;
    peer: Peer;
  };
  simpleIndexableItems: {
    id: string;
    name: string;
    type: 'pending' | 'started' | 'ended';
  };
};

type QueueMap = {
  quickPairings: {
    challengeId: string;
  };
  queueWithManyKeys: {
    simpleStringKey: string;
    nestedKey: {
      simpleNummberKey: number;
      arrayOfNumber: number[];
    };
    arrayOfString: string[];
  };
};

let store = createMockStore<CollectionMap, QueueMap>();

beforeEach(() => {
  store.flush();
});

beforeAll(() => {
  loggerUtil.disable();
});

afterAll(() => {
  loggerUtil.enable();
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

describe('Getting Single Item', () => {
  test('Get Item newly added Item', async () => {
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
      .addItemToCollection('peers', input, undefined, { foreignKeys: {} })
      .resolve();

    const actual = await store.getItemInCollection('peers', '1').resolve();

    expect(actual).toEqual(
      new Ok({
        ...input,
        id: '1',
      })
    );
  });

  test('Get Item with 1Level Foreign Keys', async () => {
    // This is needed here for the spies to be accurate
    const store = createMockStore<CollectionMap, QueueMap>();

    const guestInput = {
      avatarId: '12',
      name: 'Travolta',
      isGuest: true,
    } as const;

    await store
      .addItemToCollection('guests', guestInput, 'g5', { foreignKeys: {} })
      .resolve();

    const peerInput = {
      hasJoinedRoom: false,
      joinedRoomId: null,
      joinedRoomAt: null,
      user: {
        g5: null,
      },
    } as const;

    await store
      .addItemToCollection('peers', peerInput, 'p2', {
        foreignKeys: {
          user: {
            type: 'oneToMany',
            collection: 'guests',
          },
        },
      })
      .resolve();

    // Note: The spy has to be set after the addItemToCollection has been called
    //  otherwise the number goes up!
    const redisExecMultiSpy = jest.spyOn(store.redisClient, 'execMulti');

    const actual = await store.getItemInCollection('peers', 'p2').resolve();

    expect(redisExecMultiSpy).toHaveBeenCalledTimes(1);
    expect(actual).toEqual(
      new Ok({
        ...peerInput,
        id: 'p2',
        user: {
          g5: {
            ...guestInput,
            id: 'g5',
          },
        },
      })
    );
  });

  //   // TODO: Add test for a nested foreign key value inexistent

  test('Get Item with Nested Foreign Keys', async () => {
    // This is needed here for the spies to be accurate
    const store = createMockStore<any>();

    const guestInput = {
      avatarId: '12',
      name: 'Travolta',
      isGuest: true,
    } as const;
    await store
      .addItemToCollection('guests', guestInput, 'g5', { foreignKeys: {} })
      .resolve();

    const peerInput = {
      hasJoinedRoom: false,
      joinedRoomId: null,
      joinedRoomAt: null,
      user: {
        g5: null,
      },
    } as const;
    await store
      .addItemToCollection('peers', peerInput, 'p3', {
        foreignKeys: {
          user: {
            type: 'oneToMany',
            collection: 'guests',
          },
        },
      })
      .resolve();

    const now = String(new Date());

    const roomInput = {
      createdBy: 'p1',
      name: 'Blue Romania',
      createdAt: now,
      type: 'public',
      code: null,
      game: {} as any,
      gameOffer: undefined,
      activity: {
        type: 'none',
      },
      peers: {
        p3: null,
      },
    } as const;
    await store
      .addItemToCollection('rooms', roomInput, 'r7', {
        foreignKeys: {
          peers: {
            type: 'oneToMany',
            collection: 'peers',
          },
        },
      })
      .mapErr((s) => {
        console.error('Error', s);
      })
      .resolve();

    // Note: The spy has to be set after the addItemToCollection has been called
    //  otherwise the number goes up!
    const redisExecMultiSpy = jest.spyOn(store.redisClient, 'execMulti');

    const actual = await store.getItemInCollection('rooms', 'r7').resolve();

    // expect(actual.ok).toBe(true);
    expect(redisExecMultiSpy).toHaveBeenCalledTimes(2);
    expect(actual).toEqual(
      new Ok({
        ...roomInput,
        id: 'r7',
        peers: {
          p3: {
            ...peerInput,
            id: 'p3',
            user: {
              g5: {
                ...guestInput,
                id: 'g5',
              },
            },
          },
        },
      })
    );
  });

  test('Get Item with Many Many Nested Foreign Keys', async () => {
    // This is needed here for the spies to be accurate
    const store = createMockStore<any>();

    const guestInputG5 = {
      avatarId: '12',
      name: 'Travolta',
      isGuest: true,
    } as const;

    const guestInputG6 = {
      avatarId: '13',
      name: 'Cage',
      isGuest: true,
    } as const;

    const guestInputG7 = {
      avatarId: '14',
      name: 'Chan',
      isGuest: true,
    } as const;

    await AsyncResult.all(
      store.addItemToCollection('guests', guestInputG5, 'g5', {
        foreignKeys: {},
      }),
      store.addItemToCollection('guests', guestInputG6, 'g6', {
        foreignKeys: {},
      }),
      store.addItemToCollection('guests', guestInputG7, 'g7', {
        foreignKeys: {},
      })
    ).resolve();

    const peerInputP2 = {
      hasJoinedRoom: false,
      joinedRoomId: null,
      joinedRoomAt: null,
      user: {
        g5: null,
        g6: null,
      },
    } as const;
    const peerInputP3 = {
      hasJoinedRoom: false,
      joinedRoomId: null,
      joinedRoomAt: null,
      user: {
        g7: null,
        g6: null,
      },
    } as const;
    const peerInputP4 = {
      hasJoinedRoom: false,
      joinedRoomId: null,
      joinedRoomAt: null,
      user: {
        g7: null,
        g6: null,
        g5: null,
      },
    } as const;

    await AsyncResult.all(
      store.addItemToCollection('peers', peerInputP2, 'p2', {
        foreignKeys: {
          user: {
            type: 'oneToMany',
            collection: 'guests',
          },
        },
      }),
      store.addItemToCollection('peers', peerInputP3, 'p3', {
        foreignKeys: {
          user: {
            type: 'oneToMany',
            collection: 'guests',
          },
        },
      }),
      store.addItemToCollection('peers', peerInputP4, 'p4', {
        foreignKeys: {
          user: {
            type: 'oneToMany',
            collection: 'guests',
          },
        },
      })
    ).resolve();

    const now = String(new Date());

    const roomInput = {
      createdBy: 'p1',
      name: 'Blue Romania',
      createdAt: now,
      type: 'public',
      code: null,
      game: {} as any,
      gameOffer: undefined,
      peers: {
        p3: null,
        p2: null,
        p4: null,
      },
      activity: {
        type: 'none',
      },
    } as const;
    await store
      .addItemToCollection('rooms', roomInput, 'r7', {
        foreignKeys: {
          peers: {
            type: 'oneToMany',
            collection: 'peers',
          },
        },
      })
      .resolve();

    // Note: The spy has to be set after the addItemToCollection has been called
    //  otherwise the number goes up!
    const redisExecMultiSpy = jest.spyOn(store.redisClient, 'execMulti');

    const actual = await store.getItemInCollection('rooms', 'r7').resolve();

    // Test Trips to the DB
    expect(redisExecMultiSpy).toHaveBeenCalledTimes(2);
    expect(actual).toEqual(
      new Ok({
        ...roomInput,
        id: 'r7',
        peers: {
          p3: {
            ...peerInputP3,
            id: 'p3',
            user: {
              g6: {
                ...guestInputG6,
                id: 'g6',
              },
              g7: {
                ...guestInputG7,
                id: 'g7',
              },
            },
          },
          p2: {
            ...peerInputP2,
            id: 'p2',
            user: {
              g6: {
                ...guestInputG6,
                id: 'g6',
              },
              g5: {
                ...guestInputG5,
                id: 'g5',
              },
            },
          },
          p4: {
            ...peerInputP4,
            id: 'p4',
            user: {
              g6: {
                ...guestInputG6,
                id: 'g6',
              },
              g5: {
                ...guestInputG5,
                id: 'g5',
              },
              g7: {
                ...guestInputG7,
                id: 'g7',
              },
            },
          },
        },
      })
    );
  });
});

describe('Getting Multiple Items', () => {
  test('Get Newly Added Items W/O Foreign Keys', async () => {
    const input1 = {
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
      .addItemToCollection('peers', input1, undefined, { foreignKeys: {} })
      .resolve();

    const input2 = {
      hasJoinedRoom: false,
      joinedRoomId: null,
      joinedRoomAt: null,
      user: {
        avatarId: '1',
        name: 'max',
        id: '4',
        isGuest: true,
      },
    } as const;

    await store
      .addItemToCollection('peers', input2, undefined, { foreignKeys: {} })
      .resolve();

    const actual = await store
      .getItemsInCollection('peers', ['1', '2'])
      .resolve();

    expect(actual).toEqual(
      new Ok([
        {
          ...input1,
          id: '1',
        },
        {
          ...input2,
          id: '2',
        },
      ])
    );
  });

  const errWithoutStack = <E extends ReturnType<typeof Err>>(e: E) => {
    return {
      err: e.err,
      ok: e.ok,
      val: e.val,
    };
  };

  test('Attempting to get an Inexistent Items W/O Foreign Keys Throws an InexistentCollectionField  Error', async () => {
    const actual = await store.getItemsInCollection('peers', ['1']).resolve();

    expect(actual.err).toBe(true);
    expect(actual.val).toEqual('CollectionFieldInexistent');
  });

  test('Attempting to get an Item with Inexistent Foreign Items Throws an InexistentCollectionField Error', async () => {
    const input1 = {
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
      .addItemToCollection('peers', input1, undefined, { foreignKeys: {} })
      .resolve();

    const input2 = {
      hasJoinedRoom: false,
      joinedRoomId: null,
      joinedRoomAt: null,
      user: 'g55',
    } as const;

    await store
      .addItemToCollection('peers', input2, undefined, {
        foreignKeys: {
          user: {
            type: 'oneToOne',
            collection: 'guests',
          },
        },
      })
      .resolve();

    const actual = await store
      .getItemsInCollection('peers', ['1', '2'])
      .resolve();

    expect(actual.err).toBe(true);
    expect(actual.val).toBe('CollectionFieldInexistent');
  });

  test('Get Newly Added Items with Foreign Keys', async () => {
    // This is needed here for the spies to be accurate
    const store = createMockStore();

    const guestG4 = {
      isGuest: true,
      avatarId: '2',
      name: 'Lee',
    } as const;

    await store.addItemToCollection('guests', guestG4, 'g4', {
      foreignKeys: {},
    });

    const peer1 = {
      hasJoinedRoom: false,
      joinedRoomId: null,
      joinedRoomAt: null,
      user: 'g4',
    } as const;

    await store
      .addItemToCollection('peers', peer1, undefined, {
        foreignKeys: {
          user: {
            type: 'oneToOne',
            collection: 'guests',
          },
        },
      })
      .resolve();

    const peer2 = {
      hasJoinedRoom: false,
      joinedRoomId: null,
      joinedRoomAt: null,
      user: 'g4',
    } as const;

    await store
      .addItemToCollection('peers', peer2, undefined, {
        foreignKeys: {
          user: {
            type: 'oneToOne',
            collection: 'guests',
          },
        },
      })
      .resolve();

    // Note: The spy has to be set after the addItemToCollection has been called
    //  otherwise the number goes up!
    const redisHmgetSpy = jest.spyOn(store.redisClient, 'hmget');
    const redisExecMultiSpy = jest.spyOn(store.redisClient, 'execMulti');

    const actual = await store
      .getItemsInCollection('peers', ['1', '2'])
      .resolve();

    // Test Trips to the DB
    expect(redisExecMultiSpy).toHaveBeenCalledTimes(1);
    expect(redisHmgetSpy).toHaveBeenCalledTimes(1);

    expect(actual).toEqual(
      new Ok([
        {
          ...peer1,
          id: '1',
          user: {
            ...guestG4,
            id: 'g4',
          },
        },
        {
          ...peer1,
          id: '2',
          user: {
            ...guestG4,
            id: 'g4',
          },
        },
      ])
    );
  });
});

describe('Retrieve All Items in collection', () => {
  test('All Items W/O Foreign Keys', async () => {
    const guestG1 = {
      isGuest: true,
      avatarId: '2',
      name: 'Lee',
    } as const;

    await store
      .addItemToCollection('guests', guestG1, 'g1', { foreignKeys: {} })
      .resolve();

    const guestG2 = {
      isGuest: true,
      avatarId: '2',
      name: 'Lee',
    } as const;

    await store
      .addItemToCollection('guests', guestG2, 'g2', { foreignKeys: {} })
      .resolve();

    const guestG3 = {
      isGuest: true,
      avatarId: '2',
      name: 'Lee',
    } as const;

    await store
      .addItemToCollection('guests', guestG3, 'g3', { foreignKeys: {} })
      .resolve();

    const actual = await store.getAllItemsInCollection('guests').resolve();

    expect(actual).toEqual(
      new Ok([
        {
          ...guestG1,
          id: 'g1',
        },
        {
          ...guestG2,
          id: 'g2',
        },
        {
          ...guestG3,
          id: 'g3',
        },
      ])
    );
  });

  test('All Items With Foreign Keys', async () => {
    // This is needed here for the spies to be accurate
    const store = createMockStore();

    const guestG1 = {
      isGuest: true,
      avatarId: '2',
      name: 'Lee',
    } as const;

    await store
      .addItemToCollection('guests', guestG1, 'g1', { foreignKeys: {} })
      .resolve();

    const guestG2 = {
      isGuest: true,
      avatarId: '22',
      name: 'Chan',
    } as const;

    await store
      .addItemToCollection('guests', guestG2, 'g2', { foreignKeys: {} })
      .resolve();

    const guestG3 = {
      isGuest: true,
      avatarId: '12',
      name: 'Keanu',
    } as const;

    await store
      .addItemToCollection('guests', guestG3, 'g3', { foreignKeys: {} })
      .resolve();

    const peerP1 = {
      hasJoinedRoom: false,
      joinedRoomAt: null,
      joinedRoomId: null,
      user: 'g1',
    } as const;

    await store
      .addItemToCollection('peers', peerP1, 'p1', {
        foreignKeys: {
          user: {
            type: 'oneToOne',
            collection: 'guests',
          },
        },
      })
      .resolve();

    const peerP2 = {
      hasJoinedRoom: false,
      joinedRoomAt: null,
      joinedRoomId: null,
      user: {
        g2: null,
        g3: null,
      },
    } as const;

    await store
      .addItemToCollection('peers', peerP2, 'p2', {
        foreignKeys: {
          user: {
            type: 'oneToMany',
            collection: 'guests',
          },
        },
      })
      .resolve();

    // Note: The spy has to be set after the addItemToCollection has been called
    //  otherwise the number goes up!
    const redisHgetAllSpy = jest.spyOn(store.redisClient, 'hgetall');
    const redisExecMultiSpy = jest.spyOn(store.redisClient, 'execMulti');

    const actual = await store.getAllItemsInCollection('peers').resolve();

    expect(redisHgetAllSpy).toHaveBeenCalledTimes(1);
    expect(redisExecMultiSpy).toHaveBeenCalledTimes(1);

    expect(actual).toEqual(
      new Ok([
        {
          ...peerP1,
          id: 'p1',
          user: {
            ...guestG1,
            id: 'g1',
          },
        },
        {
          ...peerP2,
          id: 'p2',
          user: {
            g3: {
              ...guestG3,
              id: 'g3',
            },
            g2: {
              ...guestG2,
              id: 'g2',
            },
          },
        },
      ])
    );
  });

  // describe('All Items In Collection By', () => {
  //   test('Retrieve all Items in Collection Indexed By', async () => {
  //     const endedItem1 = {
  //       name: 'ended item 1',
  //       type: 'ended',
  //     } as const;

  //     await store.addItemToCollection('simpleIndexableItems', endedItem1, 'ended1Id', {
  //       foreignKeys: {},
  //       indexBy: ['type'],
  //     }).resolve();

  //     const endedItem2 = {
  //       name: 'ended item 2',
  //       type: 'ended',
  //     } as const;

  //     await store.addItemToCollection('simpleIndexableItems', endedItem2, 'ended2Id', {
  //       foreignKeys: {},
  //       indexBy: ['type'],
  //     }).resolve();

  //     const pendingItem1 = {
  //       name: 'pending item 1',
  //       type: 'pending',
  //     } as const;

  //     await store.addItemToCollection('simpleIndexableItems', pendingItem1, 'pending1Id', {
  //       foreignKeys: {},
  //       indexBy: ['type'],
  //     }).resolve();

  //     const startedItem1 = {
  //       name: 'started item 1',
  //       type: 'started',
  //     } as const;

  //     await store.addItemToCollection('simpleIndexableItems', startedItem1, 'started1Id', {
  //       foreignKeys: {},
  //       indexBy: ['type'],
  //     }).resolve();

  //     const allItemsResult = await store.getAllItemsInCollection('simpleIndexableItems').resolve();

  //     // expect(2).toEqual(3);
  //     expect(allItemsResult.ok).toBe(true);
  //     expect(allItemsResult.val[0]).toEqual({
  //       id: 'ended1Id',
  //       ...endedItem1
  //     });
  //     expect(allItemsResult.val.length).toEqual(4);

  //     const onlyPendingItemsResult = await store.getAllItemsInCollectionBy('simpleIndexableItems', 'type').resolve();

  //     expect(onlyPendingItemsResult.ok).toBe(true);
  //   });
  // });
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
