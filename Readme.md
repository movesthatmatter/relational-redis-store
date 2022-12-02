# relational-redis-store

Fully Typed Relational Redis store that supports Foreign Keys, Indexes. This allows queries to combine multiple records into the result out of the box.

# Usage

```
import * as redisSDK from 'handy-redis';
import Store from 'relational-redis-store';

type User = {
  id: string;
  name: string;
}

type Game = {
  id: string;
  players: [User[id], User[id]];
  winner?: User[id];
}

type CollectionMap = {
  users: User;
  games: Game;
};

const store = new Store<CollectionMap>(redisSDK.createHandyClient({
  url: {REDIS_URL},
}))

// Create a Game

store.addItemToCollection('games', {
  players: ['a', 'b'],
}, id, {
  foreignKeys: {},
});

// Retrieve a Game

store.getItemInCollection('games', id);

```

# To Do

- Atomicity
- Transactions
