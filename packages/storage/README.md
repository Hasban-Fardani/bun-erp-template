# `@bun-erp/storage`

One storage package for every platform, with a subpath per runtime so a bundler only sees the code
it needs. The package root is a runtime-neutral key/value store for the web and mobile apps; the
server object store lives on its own subpath.

```ts
import { getDefaultKeyValueStore } from "@bun-erp/storage";
import { createCapacitorSqliteAdapter } from "@bun-erp/storage/mobile";

const store = await getDefaultKeyValueStore({
  native: () => createCapacitorSqliteAdapter({ databaseName: "bun_erp_offline" }),
});
await store.put("drafts", "draft-1", { title: "Untitled" });
const draft = await store.get<{ title: string }>("drafts", "draft-1");
```

`createKeyValueStore(adapter)` stores namespaced JSON records with an `updatedAt`; the generic
`get<T>`/`put<T>`/`list<T>` methods keep the payload typed, and `delete`/`clear` scope to a
namespace. `getDefaultKeyValueStore()` resolves the backend in order: injected native SQLite on a
Capacitor platform, IndexedDB, Web Storage, then memory. Feature code never picks a backend itself.

```ts
import { createObjectStorage } from "@bun-erp/storage/server";

const storage = createObjectStorage({
  config: { driver: "s3", s3: { bucket: "uploads", region: "auto" } },
});
await storage.putJson("config/app.json", { theme: "dark" });
const config = await storage.getJson<{ theme: string }>("config/app.json");
```

The server driver is resolved by name — `local` (Bun filesystem), `s3` (`Bun.S3Client`), `r2`
(Worker binding), or `memory`. The name is validated at creation, but the transport is built on
first use, so a runtime-specific driver never crashes startup. Keys are normalized and reject
traversal before any driver touches a path or bucket. `put`/`get`/`delete`/`exists`/`url` plus the
`putJson`/`getJson` conveniences cover the surface; `get` always returns `Uint8Array` bytes.

## Exports

- `@bun-erp/storage`: `createKeyValueStore`, `getDefaultKeyValueStore`, `createMemoryAdapter`,
  `createIndexedDbAdapter`, `createLocalStorageAdapter`, and the `KeyValueStore`/`KeyValueAdapter`/
  `StoredRecord`/`StringStorage`/`DefaultStoreOptions` types.
- `@bun-erp/storage/browser`: IndexedDB and Web Storage adapters only.
- `@bun-erp/storage/mobile`: `createCapacitorSqliteAdapter` for encrypted SQLite; the native plugin
  is imported lazily, so a web bundle that skips this subpath stays free of it.
- `@bun-erp/storage/server`: `createObjectStorage`, `createStorageRegistry`, key helpers, and the
  server storage types.
- `@bun-erp/storage/llms.txt`: concise model-oriented package map.

## Limits

The key/value store holds small structured records, not large blobs or query workloads; the
`localStorage` adapter rewrites a namespace on `clear` and is bounded by the browser quota. The
server object store is a thin driver seam — it does not add listing, versioning, or lifecycle rules.
