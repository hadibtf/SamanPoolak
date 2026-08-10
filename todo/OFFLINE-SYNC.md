# Offline support & sync engine

## Goal
The Signit app must keep working when the network drops. Users should be able to view recently‑loaded data and create/edit records offline; anything created or changed offline is **flagged pending** and held locally until connectivity returns, then pushed to the server — without losing data or creating conflicts. This turns the online‑first People pilot from [`todo/BACKEND-API.md`](./BACKEND-API.md) into a true offline‑first client backed by IndexedDB as a local cache + outbox.

This todo depends on the backend existing (the sync‑ready API: `updatedAt`/`deletedAt` columns and `GET /people?updatedAfter=` deltas defined in BACKEND-API). With ~10 users and low concurrency, conflict handling is intentionally simple (last‑write‑wins by `updatedAt`), not a full CRDT.

> ASSUMPTION: We keep Dexie as the local store and treat it as (a) a read cache mirroring the server and (b) an outbox of pending changes — rather than ripping IndexedDB out. This reuses the existing `syncStatus` fields already in [src/db.js](../src/db.js).
> OPEN: When two people edit the same record while one is offline, is "last write wins" acceptable, or do you want the app to warn about a conflict and let the user choose? (Recommended: last‑write‑wins for now, revisit if it bites.)

---

## Tasks

### 1. Local cache + outbox model
- [ ] Reuse the `syncStatus` field on records (`pending_insert` / `pending_update` / `pending_delete` / `synced`) already present in [src/db.js](../src/db.js).
- [ ] Add a per‑record `localUpdatedAt` and keep the server `updatedAt` so the engine can tell local‑ahead from server‑ahead.
- [ ] For offline creates, assign a temporary local ID; record that it needs a real server ID on push.
- **Files:** `src/db.js`
- **Acceptance:** an offline create/edit/delete is persisted in IndexedDB and marked with the right pending status.
- **Status:** TODO

### 2. Connectivity detection
- [ ] A small `useOnline` hook around `navigator.onLine` + `online`/`offline` events, surfaced as an app‑wide indicator (e.g. a banner/badge in [src/components/BottomNav.jsx](../src/components/BottomNav.jsx)).
- **Files:** `src/hooks/useOnline.js`, `src/components/BottomNav.jsx`
- **Acceptance:** toggling the browser/devtools offline flips the indicator within a second.
- **Status:** TODO

### 3. Push engine (outbox → server)
- [ ] Replace the mock [src/hooks/useSyncEngine.js](../src/hooks/useSyncEngine.js) with a real engine: when online, drain pending records in order — `pending_insert`→POST, `pending_update`→PUT, `pending_delete`→DELETE.
- [ ] On a successful insert, swap the temporary local ID for the server‑assigned ID across related references; mark `synced`.
- [ ] Retry with backoff on network failure; never lose a pending change.
- **Files:** `src/hooks/useSyncEngine.js`, `src/api/client.js`
- **Acceptance:** make 3 offline changes, go online → all three appear on the server in order and flip to `synced`; killing the network mid‑drain resumes cleanly later.
- **Status:** TODO

### 4. Pull engine (server deltas → local cache)
- [ ] Periodically (and on reconnect) call `GET /people?updatedAfter=<lastPulledAt>`; upsert changes, remove rows whose `deletedAt` is set; advance `lastPulledAt`.
- [ ] Don't clobber local records that still have a pending change (local wins until pushed).
- **Files:** `src/hooks/useSyncEngine.js`, `src/db.js`
- **Acceptance:** a change made on Device A shows on Device B within the poll interval without a manual refresh; a record deleted on A disappears on B.
- **Status:** TODO

### 5. Conflict policy (last‑write‑wins)
- [ ] On push, if the server's `updatedAt` is newer than the base the local edit was made from, apply the agreed policy (default: client overwrite = last‑write‑wins) and log it.
- **Files:** `src/hooks/useSyncEngine.js`
- **Acceptance:** concurrent edits resolve deterministically with no crash and no duplicate rows.
- **Status:** TODO
> OPEN: confirm the policy from the goal section before this is built.

### 6. Pending UI affordances
- [ ] Show a "pending" badge on records not yet synced (reuse the existing badge in [src/pages/People.jsx](../src/pages/People.jsx)) and a global "x changes waiting to sync" hint when offline.
- **Files:** `src/pages/People.jsx`, `src/components/BottomNav.jsx`
- **Acceptance:** offline‑created records are visibly marked pending and clear once synced.
- **Status:** TODO

---

## Verification (end‑to‑end)
1. Load People online (populates the local cache).
2. Go offline (devtools), create + edit + delete people → all show pending and remain usable.
3. Go online → the engine pushes everything; badges flip to synced; the server reflects the changes.
4. From a second device, confirm the changes arrived (pull engine).
5. Force a concurrent edit to confirm the conflict policy behaves as agreed.

## Notes
- Once People is proven offline‑first here, the same cache+outbox+delta pattern generalises to orders/markings/counters when those move server‑side.
