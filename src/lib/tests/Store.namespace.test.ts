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

describe('namespace', () => {
  store = createMockStore<CollectionMap, {}>({
    namespace: 'test-namespace',
  });

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
});
