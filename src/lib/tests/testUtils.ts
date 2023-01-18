export type Guest = {
  avatarId: string;
  name: string;
  id: string;
  isGuest: true;
};

export type Peer = {
  id: string;
  hasJoinedRoom: boolean;
  joinedRoomId: null | string;
  joinedRoomAt: null | string;
  user: Guest;
};

export type ChallengeRecord = {
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

export type CollectionMap = {
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

export type QueueMap = {
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

export const noop = () => {};

export const silentLogger = {
  ...console,
  info: noop,
  log: noop,
  warn: noop,
  error: noop,
};
