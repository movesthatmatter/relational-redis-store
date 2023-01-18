import { AsyncResult } from 'ts-async-results';

export type UnidentifiableModel<T extends {}> = Omit<T, 'id'>;
export type ModelWithoutTimestamps<T extends {}> = Omit<T, 'createdAt' | 'updatedAt'>;

export type UnknownRecord = Record<string, unknown>;

export type CollectionItemOrReply<T> = {
  index: number;
  length: number;
  item: T;
};

export type ForeignKeys<T extends {}, CollectionsMap extends {}> = {
  [k in keyof Partial<UnidentifiableModel<T>>]:
    | ForeignOneToOneKeys<CollectionsMap>
    | ForeignOneToManyKeys<CollectionsMap>;
};

type ForeignOneToOneKeys<CollectionsMap extends {}> = {
  type: 'oneToOne';
  collection: keyof CollectionsMap;
};

type ForeignOneToManyKeys<CollectionsMap extends {}> = {
  type: 'oneToMany';
  collection: keyof CollectionsMap;
};

export type CollectionMapBase = {
  [key: string]: { id: string } & object;
};

export type QueueMapBase = {
  [key: string]: object;
};

export type CollectionItemRemovalReply = CollectionItemOrReply<void>;

export type CollectionItemMetadata<T, CollectionMap extends CollectionMapBase> = {
  val: CollectionItem<UnidentifiableModel<T>>;
  id: string;
  foreignKeys?: ForeignKeys<T, CollectionMap>;
  indexedIn?: {
    [collection: string]: string;
  };
};

export type CollectionItemMetadataReply<
  T extends {},
  CollectionMap extends CollectionMapBase
> = CollectionItemMetadata<T, CollectionMap> & {
  foreignItems: Partial<{
    oneToOne: {
      [index in keyof OnlyKeysOfType<
        ForeignOneToOneKeys<CollectionMap>,
        NonNullable<CollectionItemMetadata<T, CollectionMap>['foreignKeys']>
      >]: CollectionItemMetadataReply<CollectionMap[keyof CollectionMap], CollectionMap>;
    };
    oneToMany: {
      [index in keyof OnlyKeysOfType<
        ForeignOneToManyKeys<CollectionMap>,
        NonNullable<CollectionItemMetadata<T, CollectionMap>['foreignKeys']>
      >]: CollectionItemMetadataReply<CollectionMap[keyof CollectionMap], CollectionMap>;
    };
  }>;
};

type NewObjKeysMap<Obj extends {}> = {
  [F in keyof Obj]: {
    [key: string]: null;
  };
};

type NewObjSingleKey<Obj extends {}> = {
  [F in keyof Obj]: string;
};

type NewObjKeysFromForeignKeys<
  T extends {},
  CollectionMap extends CollectionMapBase,
  FKs extends ForeignKeys<T, CollectionMap>
> = Omit<
  T,
  | keyof ObjectWithOnlyKeysOfType<ForeignOneToManyKeys<CollectionMap>, FKs>
  | keyof ObjectWithOnlyKeysOfType<ForeignOneToOneKeys<CollectionMap>, FKs>
> &
  NewObjKeysMap<ObjectWithOnlyKeysOfType<ForeignOneToManyKeys<CollectionMap>, FKs>> &
  NewObjSingleKey<ObjectWithOnlyKeysOfType<ForeignOneToOneKeys<CollectionMap>, FKs>>;

export type CollectionItemWithForeignKeys<
  T extends {},
  CollectionsMap extends {},
  FKs extends ForeignKeys<T, CollectionsMap>
> = NewObjKeysFromForeignKeys<T, CollectionsMap, FKs>;

export type CollectionItemWithoutForeignKeys<
  T extends {}
> = T;

export type CollectionItem<
  T extends {},
  CollectionsMap extends CollectionMapBase = {},
  FKs extends ForeignKeys<T, CollectionsMap> = any
> = CollectionItemWithForeignKeys<T, CollectionsMap, FKs>;

export type IsOfType<U, T, K> = T extends U ? K : never;
export type OnlyKeysOfType<T, O extends {}> = { [K in keyof O]: IsOfType<T, O[K], K> }[keyof O];

type ObjectWithOnlyKeysOfType<T, O extends {}> = Pick<O, OnlyKeysOfType<T, O>>;

export type CollectionItemUpdateableProps<T extends {}> = Partial<
  CollectionItemWithoutForeignKeys<UnidentifiableModel<T>>
>;

export type CollectionItemUpdateablePrev<T extends {}> =
  CollectionItemWithoutForeignKeys<UnidentifiableModel<T>>;

export type UpdateableCollectionPropsGetter<T extends {}> =
  | CollectionItemUpdateableProps<T>
  | ((
      prev: CollectionItemUpdateablePrev<T>
    ) =>
      | CollectionItemUpdateableProps<T>
      | AsyncResult<CollectionItemUpdateableProps<T>, unknown>);

export const toCollectionId = (collection: string, id: string) => id;
export const toQueueName = (queue: string) => `queue:${queue}`;

export const toIndexedCollectionName = (collection: string, byField: string | number) => `${collection}:by:${byField}`;
export const getByFieldNameFromIndexedCollection = (indexedCollection: string) => indexedCollection.split(':by:')[1];

export const objectKeys = <O extends object>(o: O) => Object.keys(o) as (keyof O)[];

export const delay = (ms: number) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});