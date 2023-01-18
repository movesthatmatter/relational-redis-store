import { createMockStore } from '../mockStoreFactory';
import { Store } from '../Store';
import { CollectionMap, silentLogger } from './testUtils';
import { Ok, Err } from 'ts-results';
import { AsyncResult } from 'ts-async-results';

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
    const store = createMockStore<CollectionMap, {}>({
      logger: silentLogger,
    });

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
    const store = createMockStore<any>({ logger: silentLogger });

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
    const store = createMockStore<any>({ logger: silentLogger });

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
    const store = createMockStore({ logger: silentLogger });

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
    const store = createMockStore({ logger: silentLogger });

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
