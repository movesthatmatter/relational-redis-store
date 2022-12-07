import flatten from 'flatten';
import deepEqual from 'deep-equal';
import deepmerge from 'deepmerge';
import {
  AsyncResult,
  AsyncResultWrapper,
  AsyncErr,
  AsyncOk,
} from 'ts-async-results';
import { Result, Ok, Err } from 'ts-results';
import { IHandyRedis } from 'handy-redis';
import jsonStableStringify from 'json-stable-stringify';
import {
  UnidentifiableModel,
  OnlyKeysOfType,
  CollectionItemOrReply,
  CollectionItem,
  CollectionItemMetadata,
  CollectionItemMetadataReply,
  CollectionItemRemovalReply,
  ForeignKeys,
  toCollectionId,
  toQueueName,
  CollectionMapBase,
  QueueMapBase,
  getByFieldNameFromIndexedCollection,
  toIndexedCollectionName,
  objectKeys,
  CollectionItemWithoutForeignKeys,
  UpdateableCollectionPropsGetter,
} from './util';
import redisLock from 'redis-lock';
import { promisify } from 'util';
import { RedisClient } from 'redis';
import { logger } from './logger';

export type StoreErrors =
  | 'CollectionFieldInexistent'
  | 'CollectionAdditionFailure'
  | 'CollectionDeletionFailure'
  | 'CollectionUpdateFailure'
  | 'CollectionUpdateFailure:MismatchingForeignKeys'
  | 'CollectionOrFieldInexistent'
  | 'QueueItemNotFound'
  | 'GenericRedisFailure';

export class Store<
  CollectionMap extends CollectionMapBase,
  QueueMap extends QueueMapBase = {},
  CollectionKey extends keyof CollectionMap & string = keyof CollectionMap &
    string,
  QueueKey extends keyof QueueMap & string = keyof QueueMap & string
> {
  public namespace;

  public redisClient: IHandyRedis;

  private redisLock: (resource: string) => Promise<(done?: () => void) => void>;

  constructor(
    private redis: IHandyRedis,
    config?: {
      namespace?: string;
    }
  ) {
    this.redisClient = this.redis;

    this.redis.redis.on('connect', () => {
      logger.info('[Store] Redis Connected', {
        connection: this.redis.redis.connection_id,
      });
    });

    // TODO: Make sure this works!
    this.redis.redis.off('connect', () => {
      logger.info('[Store] Redis Disonnected', {
        connection: this.redis.redis.connection_id,
      });
    });

    this.redisLock = promisify(redisLock(redis.redis));

    this.namespace = config?.namespace ? `${config?.namespace}::` : '';
  }

  lockCollection<K extends CollectionKey>(collection: K) {
    return this.redisLock(`locked:${collection}`);
  }

  lockCollectionItem<K extends CollectionKey>(collection: K, id: string) {
    return this.redisLock(`locked:${collection}:${id}`);
  }

  private toCollectionKey = <K extends CollectionKey>(collection: K) =>
    `${this.namespace}${collection}` as K;

  addItemToCollection<
    K extends CollectionKey,
    T extends CollectionMap[K],
    IndexBy extends OnlyKeysOfType<string | number, UnidentifiableModel<T>>,
    FKs extends ForeignKeys<T, CollectionMap>
  >(
    rawCollection: K,
    val: CollectionItem<UnidentifiableModel<T>, CollectionMap, FKs>,
    id?: string,
    opts: {
      indexBy?: IndexBy[];
      foreignKeys: FKs;
    } = {
      foreignKeys: {} as FKs,
    }
  ): AsyncResult<CollectionItemOrReply<T>, StoreErrors> {
    const collection = this.toCollectionKey(rawCollection);

    return new AsyncResultWrapper<CollectionItemOrReply<T>, StoreErrors>(
      async () => {
        // Lock the resource so only one addition happens at a time
        const unlock = await this.lockCollection(collection);

        const resolvedId = id
          ? id
          : await this.redis
              .hget(collection, '_index')
              .then((v) => (v !== null ? String(Number(v) + 1) : '1'));

        const field = toCollectionId(collection, resolvedId);

        let item: CollectionItemMetadata<T, CollectionMap> = {
          val: val as unknown as CollectionItemMetadata<
            T,
            CollectionMap
          >['val'],
          id: resolvedId,
          // Store only if any foreign keys present
          ...(opts.foreignKeys &&
            Object.keys(opts.foreignKeys).length > 0 && {
              foreignKeys: opts.foreignKeys as CollectionItemMetadata<
                T,
                CollectionMap
              >['foreignKeys'],
            }),
          ...(opts.indexBy &&
            opts.indexBy.length > 0 && {
              indexedIn: opts.indexBy.reduce(
                (prev, byField) => ({
                  ...prev,
                  [toIndexedCollectionName(collection, String(byField))]: (
                    val as any
                  )[byField],
                }),
                {}
              ),
            }),
        };

        let transactions = this.redis
          .multi()
          .hset(collection, [field, JSON.stringify(item)])
          .hincrby(collection, '_index', 1)
          .hlen(collection)
          .hget(collection, field);

        // If there is an indexBy, create the indexBy hashMaps
        opts.indexBy?.forEach((key) => {
          transactions = transactions.hset(
            toIndexedCollectionName(collection, String(key)),
            `${(val as any)[key]}`,
            resolvedId
          );
        });

        const res = await this.redis.execMulti(transactions);

        if (res === null) {
          unlock();
          return new Err('CollectionFieldInexistent');
        }

        // TODO: Add an optimization to only run another query if there are foreign keys
        //  or if the foregin keys have been updated not if there are no modification to that
        //  since this could be pretty expensive
        // But on the other hand it could also be ok since data will be always fresh!
        // if (nextItemWithMetadata.foreignKeys && ) {}
        const parsedResItem = JSON.parse(res[3] as string);

        return await this.getItemInCollection(collection, parsedResItem.id)
          .map((item) => ({
            index: Number(res[1]),
            length: Number(res[2]) - 1, // remove the index key
            item: item as T,
          }))
          .resolve()
          .finally(() => unlock());
      }
    ).map(
      AsyncResult.passThrough((next) => {
        logger.info('[Store] Item Added', {
          collection,
          id: next.item.id,
          length: next.index,
        });
      })
    );
  }

  getCollectionIndex<K extends CollectionKey>(
    rawCollection: K
  ): AsyncResult<number, StoreErrors> {
    const collection = this.toCollectionKey(rawCollection);

    return new AsyncResultWrapper(async () => {
      const v = await this.redis.hget(collection, '_index');

      if (v === null) {
        // If the index to a collection doesnt exist it means it's not instantiated yet
        return new Ok(0);
      }

      return new Ok(Number(v));
    });
  }

  getCollectionLength<K extends CollectionKey>(
    rawCollection: K
  ): AsyncResult<number, StoreErrors> {
    const collection = this.toCollectionKey(rawCollection);

    return new AsyncResultWrapper(async () => {
      try {
        const v = await this.redis.hlen(collection);

        return new Ok(Number(v));
      } catch (error) {
        logger.error('[Store] Get Collection Length', {
          collection,
          error,
        });
        return new Err('GenericRedisFailure');
      }
    });
  }

  private compactAllForeignKeys(
    itemsMetadata: CollectionItemMetadata<unknown, {}>[]
  ) {
    const allFKsToFIdsMap = itemsMetadata.reduce((prev, itemMetadata) => {
      const foreignKeysList = Object.keys(itemMetadata.foreignKeys || {});

      const valuesMap = foreignKeysList.reduce((p, k) => {
        const foreignKeyObject = (
          itemMetadata.foreignKeys as ForeignKeys<{ [k: string]: any }, {}>
        )[k];

        return {
          ...p,
          [foreignKeyObject.collection]: {
            ...p[k],
            ...(foreignKeyObject.type === 'oneToMany'
              ? (itemMetadata.val as any)[k]
              : { [itemMetadata.val[k]]: null }),
          },
        };
      }, {} as { [fCollection: string]: { [fid: string]: null } });

      return deepmerge(prev, valuesMap);
    }, {} as { [fk: string]: { [fid: string]: null } });

    const orderedAllFKs = Object.keys(allFKsToFIdsMap);

    return orderedAllFKs.reduce(
      (prev, next) => ({
        ...prev,
        [next]: Object.keys(allFKsToFIdsMap[next]),
      }),
      {} as { [k: string]: string[] }
    );
  }

  private resolveForeignItems(
    itemsMetadata: CollectionItemMetadata<unknown, CollectionMap>[]
  ): AsyncResultWrapper<
    CollectionItemMetadataReply<any, CollectionMap>[],
    any
  > {
    return new AsyncResultWrapper(async () => {
      const allForeignKeysByCollection =
        this.compactAllForeignKeys(itemsMetadata);
      const foreignCollectionsList = Object.keys(allForeignKeysByCollection);

      const foreignKeysWithValuesZip = foreignCollectionsList.reduce(
        (prev, foreignCollection) => {
          const fids = allForeignKeysByCollection[foreignCollection].map(
            (fid) => toCollectionId(foreignCollection, fid)
          );

          return [...prev, [foreignCollection, fids]] as [string, string[]][];
        },
        [] as [string, string[]][]
      );

      type RedisMulti = ReturnType<RedisClient['MULTI']>;

      const redisCollectionAndTransactionsGetteriZip =
        foreignKeysWithValuesZip.reduce((prev, [foreignCollection, fids]) => {
          if (fids.length === 0) {
            return prev;
          }

          return [
            ...prev,
            {
              collection: foreignCollection,
              getTransaction: (redis: RedisMulti) =>
                redis.hmget(foreignCollection, ...fids),
            },
          ];
        }, [] as { collection: string; getTransaction: (r: RedisMulti) => RedisMulti }[]);

      // Return Early if no Foreign Keys or no Foreign Values
      if (redisCollectionAndTransactionsGetteriZip.length === 0) {
        return new Ok(
          itemsMetadata.map((md) => ({
            ...md,
            foreignItems: {},
          }))
        );
      }

      const redisTransactions = redisCollectionAndTransactionsGetteriZip.reduce(
        (prev, { getTransaction }) => getTransaction(prev),
        this.redis.multi()
      );

      const redisReply = await this.redis.execMulti(redisTransactions);

      const allResults = redisReply.map(
        (resultArrayPerForeignCollection, collectionIndex) => {
          const results = (resultArrayPerForeignCollection as string[]).map(
            (v) => {
              if (v === null || v === undefined) {
                return new AsyncErr('CollectionFieldInexistent');
              }

              return new AsyncOk({
                collection:
                  redisCollectionAndTransactionsGetteriZip[collectionIndex]
                    .collection,
                itemMetadata: JSON.parse(v),
              });
            }
          );

          return AsyncResult.all(...results);
        }
      );

      return await AsyncResult.all(...allResults)
        .flatMap(
          (resultsNestedArrayPerForeignCollection) =>
            new Ok(
              flatten(resultsNestedArrayPerForeignCollection) as {
                collection: CollectionKey;
                itemMetadata: CollectionItemMetadata<unknown, {}>;
              }[]
            )
        )
        .flatMap((flattenResults) => {
          return this.resolveForeignItems(
            flattenResults.map((fr) => fr.itemMetadata)
          ).map((resolvedResults) => {
            return resolvedResults.map((resolvedMetadata, i) => ({
              collection: flattenResults[i].collection,
              itemMetadata: resolvedMetadata,
            }));
          });
        })
        .flatMap((flattenResults) => {
          const res = flattenResults.reduce(
            (prev, next) => {
              return {
                ...prev,
                [next.collection]: {
                  ...prev[next.collection],
                  [next.itemMetadata.id]: next.itemMetadata,
                },
              };
            },
            {} as {
              [fCollection: string]: {
                [fid: string]: CollectionItemMetadataReply<{}, {}>;
              };
            }
          );

          return new Ok(res);
        })
        .map((foreignItemsMetadataByFCollectionAndFId) => {
          return itemsMetadata.map((itemMetadata) => {
            const itemForeignKeys = Object.keys(itemMetadata.foreignKeys || {});

            const foreignItems = itemForeignKeys.reduce((prev, nextFk) => {
              const foreignKeyObj = (
                itemMetadata.foreignKeys as ForeignKeys<
                  { [k: string]: any },
                  {}
                >
              )[nextFk];

              if (foreignKeyObj.type === 'oneToMany') {
                const fids = Object.keys((itemMetadata.val as any)[nextFk]);

                const foreignItemsByIdInCollection = fids.reduce((p, fid) => {
                  return {
                    ...p,
                    [fid]:
                      foreignItemsMetadataByFCollectionAndFId[
                        foreignKeyObj.collection
                      ][fid],
                  };
                }, {} as CollectionItemMetadataReply<any, any>['foreignItems']);

                return {
                  ...prev,
                  oneToMany: {
                    ...prev.oneToMany,
                    [nextFk]: foreignItemsByIdInCollection,
                  },
                };
              }

              const fid = (itemMetadata.val as any)[nextFk];

              return {
                ...prev,
                oneToOne: {
                  ...prev.oneToOne,
                  [nextFk]:
                    foreignItemsMetadataByFCollectionAndFId[
                      foreignKeyObj.collection
                    ][fid],
                },
              };
            }, {} as CollectionItemMetadataReply<{}, {}>['foreignItems']);

            return {
              ...itemMetadata,
              foreignItems,
            } as unknown as CollectionItemMetadataReply<{}, {}>;
          });
        })
        .resolve();
    });
  }

  private getItemsInCollectionWithMetadata<
    K extends CollectionKey,
    T extends CollectionMap[K]
  >(
    rawCollection: K,
    ids: string[]
  ): AsyncResult<CollectionItemMetadataReply<T, CollectionMap>[], StoreErrors> {
    const collection = this.toCollectionKey(rawCollection);

    return this.getShallowItemsInCollectionWithMetadata(collection, ids)
      .flatMap(
        (itemsMetadata) =>
          this.resolveForeignItems(itemsMetadata) as AsyncResult<
            CollectionItemMetadataReply<T, CollectionMap>[],
            StoreErrors
          >
      )
      .mapErr(
        AsyncResult.passThrough((error) => {
          logger.error(`[Store] getItemsInCollectionWithMetadata`, {
            collection,
            error,
          });
        })
      );
  }

  private getShallowItemsInCollectionWithMetadata<
    K extends CollectionKey,
    T extends CollectionMap[K]
  >(
    rawCollection: K,
    ids: string[]
  ): AsyncResult<CollectionItemMetadata<T, CollectionMap>[], StoreErrors> {
    if (ids.length === 0) {
      return new AsyncOk([]);
    }

    const collection = this.toCollectionKey(rawCollection);

    return new AsyncResultWrapper(async () => {
      const redisReplies = await this.redis.hmget(
        collection,
        ...ids.map((id) => toCollectionId(collection, id))
      );

      const itemsMetadataResults = redisReplies.map((reply) => {
        if (reply === null || reply === undefined) {
          return new AsyncErr('CollectionFieldInexistent');
        }

        const metadata = JSON.parse(reply) as CollectionItemMetadata<
          T,
          CollectionMap
        >;

        return new AsyncOk(metadata);
      });

      return (await AsyncResult.all(
        ...itemsMetadataResults
      ).resolve()) as Result<
        CollectionItemMetadata<T, CollectionMap>[],
        StoreErrors
      >;
    }).mapErr(
      AsyncResult.passThrough((error) => {
        logger.error(
          '[Store] getShallowItemsInCollectionWithMetadata Collection:',
          {
            collection,
            ids,
            error,
          }
        );
      })
    );
  }

  getItemInCollection<K extends CollectionKey, T extends CollectionMap[K]>(
    rawCollection: K,
    id: string
  ): AsyncResult<T, StoreErrors> {
    const collection = this.toCollectionKey(rawCollection);

    return this.getItemsInCollectionWithMetadata<K, T>(collection, [id]).map(
      ([m]) => this.metadataReplyToCollectionItem(m)
    );
  }

  getItemInCollectionBy<
    K extends CollectionKey,
    T extends CollectionMap[K],
    F extends OnlyKeysOfType<string | number, UnidentifiableModel<T>>
  >(
    rawCollection: K,
    byKey: F,
    keyVal: string | number
  ): AsyncResult<T, StoreErrors> {
    const collection = this.toCollectionKey(rawCollection);

    return new AsyncResultWrapper(async () => {
      const referencedId = await this.redis.hget(
        toIndexedCollectionName(collection, String(byKey)),
        String(keyVal)
      );

      if (referencedId === null) {
        return new Err('CollectionFieldInexistent');
      }

      return (await this.getItemInCollection(
        collection,
        referencedId
      ).resolve()) as Result<T, StoreErrors>;
    });
  }

  private getIndexedItemReference<
    K extends CollectionKey,
    T extends CollectionMap[K],
    F extends OnlyKeysOfType<string | number, UnidentifiableModel<T>>
  >(
    rawCollection: K,
    byKey: F,
    keyVal: string | number
  ): AsyncResult<string, void> {
    const collection = this.toCollectionKey(rawCollection);

    return new AsyncResultWrapper(async () => {
      const referencedId = await this.redis.hget(
        toIndexedCollectionName(collection, String(byKey)),
        String(keyVal)
      );

      if (referencedId === null) {
        return Err.EMPTY;
      }

      return new Ok(referencedId);
    });
  }

  getItemsInCollection<K extends CollectionKey, T extends CollectionMap[K]>(
    rawCollection: K,
    ids: string[]
  ): AsyncResult<T[], StoreErrors> {
    const collection = this.toCollectionKey(rawCollection);

    return this.getItemsInCollectionWithMetadata<K, T>(collection, ids).map(
      (metadatas) => metadatas.map((m) => this.metadataReplyToCollectionItem(m))
    );
  }

  private metadataReplyToCollectionItem<T>(
    metadata: CollectionItemMetadataReply<T, CollectionMap>
  ): T {
    return {
      ...metadata.val,
      ...Object.keys(metadata.foreignItems.oneToMany || {}).reduce(
        (prev, fk) => {
          return {
            ...prev,
            [fk]: Object.keys(
              (metadata.foreignItems.oneToMany || ({} as any))[fk]
            ).reduce(
              (p, fid) => ({
                ...p,
                [fid]: this.metadataReplyToCollectionItem(
                  (metadata.foreignItems.oneToMany || ({} as any))[fk][fid]
                ),
              }),
              {} as { [fid: string]: unknown }
            ),
          };
        },
        {} as CollectionItemMetadataReply<T, CollectionMap>['foreignItems']
      ),
      ...Object.keys(metadata.foreignItems.oneToOne || {}).reduce(
        (prev, fk) => {
          return {
            ...prev,
            [fk]: this.metadataReplyToCollectionItem(
              (metadata.foreignItems.oneToOne || ({} as any))[fk]
            ),
          };
        },
        {} as CollectionItemMetadataReply<T, CollectionMap>['foreignItems']
      ),
      id: metadata.id,
    } as unknown as T;
  }

  getAllItemsInCollection<K extends CollectionKey, T extends CollectionMap[K]>(
    rawCollection: K
  ): AsyncResult<T[], StoreErrors> {
    const collection = this.toCollectionKey(rawCollection);

    return new AsyncResultWrapper(async () => {
      const resultHash = await this.redis.hgetall(collection);

      if (!resultHash) {
        return new Ok([]);
      }

      const itemsMetadata = Object.keys(resultHash)
        .filter((k) => k[0] !== '_')
        .map(
          (collectionId) =>
            JSON.parse(resultHash[collectionId]) as CollectionItemMetadata<
              T,
              CollectionMap
            >
        );

      return (await this.resolveForeignItems(itemsMetadata)
        .map((allMetadatas) =>
          allMetadatas.map((m) => this.metadataReplyToCollectionItem(m))
        )
        .resolve()) as Result<T[], StoreErrors>;
    });
  }

  // getItemInCollectionBy<
  //   K extends CollectionKey,
  //   T extends CollectionMap[K],
  //   F extends OnlyKeysOfType<string | number, UnidentifiableModel<T>>
  // >(collection: K, byKey: F, keyVal: string | number): AsyncResult<T, StoreErrors> {
  //   return new AsyncResultWrapper(async () => {
  //     const referencedId = await this.redis.hget(
  //       toIndexedCollectionName(collection, String(byKey)),
  //       String(keyVal)
  //     );

  //     if (referencedId === null) {
  //       return new Err('CollectionOrFieldInexistent');
  //     }

  //     return (await this.getItemInCollection(collection, referencedId).resolve()) as Result<
  //       T,
  //       StoreErrors
  //     >;
  //   });
  // }

  // getAllItemsInCollectionBy<
  //   K extends CollectionKey,
  //   T extends CollectionMap[K],
  //   F extends OnlyKeysOfType<string | number, UnidentifiableModel<T>>
  // >(
  //   collection: K,
  //   byKey: F
  //   // keyVal: string | number
  // ): AsyncResult<T[], StoreErrors> {
  //   return new AsyncResultWrapper(async () => {
  //     console.debug('getAllItemsInCollectionBy started');

  //     const indexCollection = toIndexedCollectionName(collection, String(byKey));
  //     const referencedIds = await this.redis.hgetall(
  //       indexCollection
  //     );

  //     console.debug('indexCollection', indexCollection);
  //     console.debug('referencedIds', referencedIds);

  //     if (referencedIds === null) {
  //       return new Err('CollectionOrFieldInexistent');
  //     }

  //     return new Ok(referencedIds);

  //     // if (referencedId === null) {
  //     //   return new Err('CollectionOrFieldInexistent');
  //     // }

  //     // return (await this.getItemInCollection(collection, referencedId).resolve()) as Result<
  //     //   T,
  //     //   StoreErrors
  //     // >;
  //   });
  //   // return this.getAllItemsInCollection('')
  //   // return this.getItemsInCollectionWithMetadata<K, T>(collection, ids).map((metadatas) =>
  //   //   metadatas.map((m) => this.metadataReplyToCollectionItem(m))
  //   // );
  // }

  isItemInCollection<K extends CollectionKey>(
    rawCollection: K,
    id: string
  ): AsyncResult<boolean, never> {
    const collection = this.toCollectionKey(rawCollection);

    return this.getShallowItemsInCollectionWithMetadata<K, any>(collection, [
      id,
    ])
      .map(() => true)
      .flatMapErr(() => new Ok(false));
  }

  isItemInCollectionBy<
    K extends CollectionKey,
    T extends CollectionMap[K],
    F extends OnlyKeysOfType<string | number, UnidentifiableModel<T>>
  >(
    rawCollection: K,
    byKey: F,
    keyVal: string | number
  ): AsyncResult<boolean, never> {
    const collection = this.toCollectionKey(rawCollection);

    return new AsyncResultWrapper<string, void>(async () => {
      const referencedId = await this.redis.hget(
        toIndexedCollectionName(collection, String(byKey)),
        String(keyVal)
      );

      if (referencedId === null) {
        return Err.EMPTY;
      }

      return new Ok(referencedId);
    })
      .flatMap((id) => this.isItemInCollection(collection, id))
      .flatMapErr(() => new Ok(false));
  }

  updateItemInCollection<
    K extends CollectionKey,
    T extends CollectionMap[K],
    FKs extends ForeignKeys<T, CollectionMap>
  >(
    rawCollection: K,
    id: string,
    itemModelGetter: UpdateableCollectionPropsGetter<T>,
    opts: {
      foreignKeys: FKs;
    }
  ): AsyncResult<T, StoreErrors> {
    const collection = this.toCollectionKey(rawCollection);

    return new AsyncResultWrapper(async () => {
      const unlock = await this.lockCollectionItem(collection, id);

      return (
        this.getShallowItemsInCollectionWithMetadata(collection, [id])
          .flatMap(([prev]) => {
            if (!deepEqual(opts.foreignKeys || {}, prev.foreignKeys || {})) {
              logger.error(
                '[Store] UpdateItemInCollection ForeignKeys Mismatch Error',
                {
                  forCollection: collection,
                  itemId: id,
                  prevForeignKeys: prev.foreignKeys,
                  nextForeignKeys: opts.foreignKeys,
                }
              );
              return new Err(
                'CollectionUpdateFailure:MismatchingForeignKeys' as const
              );
            }

            return new Ok(prev);
          })
          .flatMap(
            (prev) =>
              new AsyncResultWrapper(async () => {
                const field = toCollectionId(collection, id);

                const unresolvedItemModel =
                  typeof itemModelGetter === 'function'
                    ? itemModelGetter(
                        prev.val as unknown as CollectionItemWithoutForeignKeys<
                          UnidentifiableModel<T>
                        >
                      )
                    : itemModelGetter;

                const itemModelAsAsyncResult = AsyncResult.isAsyncResult(
                  unresolvedItemModel
                )
                  ? unresolvedItemModel
                  : new AsyncOk(unresolvedItemModel);

                const itemModelResult = await itemModelAsAsyncResult.resolve();

                if (!itemModelResult.ok) {
                  return new Err('CollectionUpdateFailure');
                }

                const itemModel = itemModelResult.val;

                const { id: removedId, ...itemModelWithoutId } =
                  itemModel as unknown as T;
                const nextItem = {
                  ...prev.val,
                  ...itemModelWithoutId,
                } as unknown as T;

                let transactions = this.redis.multi();

                const indexByCollectionWithUpdatedValueRecords =
                  this.getIndexedInValueRecords(prev, nextItem);

                if (indexByCollectionWithUpdatedValueRecords.length > 0) {
                  // If the indexBy value changed in this update, update the indexBy Collections as well
                  //  by removing the old and adding the new
                  transactions =
                    indexByCollectionWithUpdatedValueRecords.reduce(
                      (prev, record) =>
                        prev
                          .hset(record.indexedInCollection, [
                            record.nextValue,
                            id,
                          ])
                          .hdel(record.indexedInCollection, record.prevValue),
                      transactions
                    );
                }

                const nextItemWithMetadata: CollectionItemMetadata<
                  T,
                  CollectionMap
                > = {
                  val: nextItem as any,
                  id: prev.id,
                  ...(prev.foreignKeys && {
                    foreignKeys: prev.foreignKeys as CollectionItemMetadata<
                      T,
                      CollectionMap
                    >['foreignKeys'],
                  }),
                  ...(prev.indexedIn && {
                    indexedIn: indexByCollectionWithUpdatedValueRecords.reduce(
                      (accum, nextRecord) => ({
                        ...accum,
                        [nextRecord.indexedInCollection]: nextRecord.nextValue,
                      }),
                      prev.indexedIn
                    ),
                  }),
                };

                const payload = JSON.stringify(nextItemWithMetadata);

                transactions = transactions.hset(collection, [field, payload]);

                const res = await this.redis.execMulti(transactions);

                if (res === null) {
                  return new Err('CollectionUpdateFailure');
                }

                // TODO: Add an optimization to only run another query if there are foreign keys
                //  or if the foregin keys have been updated not if there are no modification to that
                //  since this could be pretty expensive
                // But on the other hand it could also be ok since data will be always fresh!
                // if (nextItemWithMetadata.foreignKeys && ) {}

                // Run another query so the all the foreign references work
                return await this.getItemInCollection<K, T>(
                  collection,
                  id
                ).resolve();
              })
          )
          .map(
            AsyncResult.passThrough((nextItem) => {
              logger.info('[Store] Item Updated', {
                collection,
                id: nextItem.id,
              });
            })
          )
          // Finally Unlock the resource
          .map(AsyncResult.passThrough(() => unlock()))
          .mapErr(AsyncResult.passThrough(() => unlock()))
          .resolve()
      );
    });
  }

  private getIndexedInValueRecords<
    K extends CollectionKey,
    T extends CollectionMap[K]
  >(
    prevItemWithMetadata: CollectionItemMetadata<T, CollectionMap>,
    nextItem: T
  ) {
    const indexedInHash = prevItemWithMetadata.indexedIn || {};
    const keysOfIndexedIn = objectKeys<Record<string, string>>(indexedInHash);

    return keysOfIndexedIn.reduce(
      (accum, indexedInCollection) => {
        const indexedByField =
          getByFieldNameFromIndexedCollection(indexedInCollection);
        const prevIndexedValue = indexedInHash[indexedInCollection];
        const nextIndexedValue = (nextItem as any)[indexedByField];

        if (prevIndexedValue === nextIndexedValue) {
          return accum;
        }

        return [
          ...accum,
          {
            indexedInCollection,
            indexedByField,
            nextValue: nextIndexedValue,
            prevValue: prevIndexedValue,
          },
        ];
      },
      [] as {
        indexedInCollection: string;
        indexedByField: string;
        prevValue: string;
        nextValue: string;
      }[]
    );
  }

  removeCollection<K extends CollectionKey>(
    rawCollection: K
  ): AsyncResult<void, StoreErrors> {
    const collection = this.toCollectionKey(rawCollection);

    return new AsyncResultWrapper(async () => {
      try {
        await this.redis.del(collection);

        return Ok.EMPTY;
      } catch (e) {
        return new Err('CollectionDeletionFailure');
      }
    });
  }

  removeItemInCollection<K extends CollectionKey>(
    rawCollection: K,
    id: string
  ): AsyncResult<CollectionItemRemovalReply, StoreErrors> {
    const collection = this.toCollectionKey(rawCollection);

    return new AsyncResultWrapper<CollectionItemRemovalReply, StoreErrors>(
      async () => {
        const field = toCollectionId(collection, id);

        const itemBeforeRemoval =
          await this.getShallowItemsInCollectionWithMetadata(collection, [
            id,
          ]).resolve();

        if (!itemBeforeRemoval.ok) {
          return new Err('CollectionFieldInexistent');
        }

        const transactions = this.redis
          .multi()
          .hdel(collection, field)
          .hget(collection, '_index')
          .hlen(collection);

        const res = await this.redis.execMulti(transactions);

        if (res === null) {
          return new Err('CollectionDeletionFailure');
        }

        // const parsedRemovedItem = JSON.parse(res[0] as string) as CollectionItemMetadata<CollectionMap[K], CollectionMap>;
        const parsedRemovedItem = itemBeforeRemoval.val[0];

        const indexByCollectionWithValuesZip = Object.keys(
          parsedRemovedItem.indexedIn || {}
        ).reduce((prev, nextIndexedInCollection) => {
          const indexedByField =
            parsedRemovedItem.indexedIn?.[nextIndexedInCollection];

          if (!indexedByField) {
            return prev;
          }

          return [...prev, [nextIndexedInCollection, indexedByField]] as [
            string,
            string
          ][];
        }, [] as [string, string][]);

        if (indexByCollectionWithValuesZip.length > 0) {
          const indexByRemovalTransactions =
            indexByCollectionWithValuesZip.reduce(
              (prev, [indexedInCollection, indexByField]) =>
                prev.hdel(indexedInCollection, indexByField),
              this.redis.multi()
            );

          await this.redis.execMulti(indexByRemovalTransactions);
        }

        const next = {
          index: Number(res[1]),
          length: Number(res[2]) - 1, // remove the index key
          item: undefined,
        };

        return new Ok(next);
      }
    ).map(
      AsyncResult.passThrough((next) => {
        logger.info('[Store] Item Removed', {
          collection,
          id,
          length: next.length,
        });
      })
    );
  }

  removeItemInCollectionBy<
    K extends CollectionKey,
    T extends CollectionMap[K],
    F extends OnlyKeysOfType<string | number, UnidentifiableModel<T>>
  >(
    rawCollection: K,
    byKey: F,
    keyVal: string | number
  ): AsyncResult<CollectionItemRemovalReply, StoreErrors> {
    const collection = this.toCollectionKey(rawCollection);

    return this.getIndexedItemReference<K, T, F>(collection, byKey, keyVal)
      .flatMap((id) => this.removeItemInCollection(collection, id))
      .flatMapErr(() => new Err('CollectionFieldInexistent'));
  }

  enqueue<Q extends QueueKey, T extends QueueMap[Q]>(
    q: Q,
    item: UnidentifiableModel<T>
  ): AsyncResult<void, StoreErrors> {
    return new AsyncResultWrapper(() => {
      return this.redis
        .rpush(toQueueName(q), jsonStableStringify(item))
        .then(() => Ok.EMPTY)
        .catch(() => new Err('GenericRedisFailure'));
    });
  }

  dequeue<Q extends QueueKey, T extends QueueMap[Q]>(
    q: Q
  ): AsyncResultWrapper<T | void, StoreErrors> {
    return new AsyncResultWrapper(() => {
      return this.redis
        .lpop(toQueueName(q))
        .then((v): Ok<T | void> => {
          if (v !== null) {
            return new Ok(JSON.parse(v) as T);
          }

          return Ok.EMPTY;
        })
        .catch(() => new Err('GenericRedisFailure'));
    });
  }

  removeFromQueue<Q extends QueueKey, T extends QueueMap[Q]>(q: Q, item: T) {
    return new AsyncResultWrapper<void, StoreErrors>(() => {
      return this.redis
        .lrem(toQueueName(q), 0, jsonStableStringify(item))
        .then((v) => {
          if (v > 0) {
            return Ok.EMPTY;
          }

          return new Err('QueueItemNotFound' as const);
        })
        .catch(() => new Err('GenericRedisFailure' as const));
    });
  }

  removeFromQueueIfExists<Q extends QueueKey, T extends QueueMap[Q]>(
    q: Q,
    item: T
  ) {
    return this.removeFromQueue<Q, T>(q, item).flatMapErr(() => AsyncOk.EMPTY);
  }

  getQueueSize<Q extends QueueKey>(
    q: Q
  ): AsyncResultWrapper<number, StoreErrors> {
    return new AsyncResultWrapper(() => {
      return this.redis
        .llen(toQueueName(q))
        .then((v) => new Ok(v))
        .catch(() => new Err('GenericRedisFailure'));
    });
  }

  flush() {
    return new AsyncResultWrapper(() => {
      return new Promise<Result<boolean, 'GenericRedisFailure'>>(() => {
        this.redis.redis.flushall();

        // Ensure this
        return Ok.EMPTY;
      });
    });
  }
}
