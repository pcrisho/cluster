# Baseline — 2026-10-29

First sizing run, before the first deployment (KNOW + GROW, 50–100 people using it at once). Repeat it with the scripts here after fixing any item below, and on the target machine before choosing hardware.

## Conditions

- Machine: 12-core desktop (fast CPU), 16 GB. API, collab and web ran under the limits of `docker-compose.yml` (1 CPU, 512 MB each; API pinned to one core). Postgres, Redis and SeaweedFS ran in the dev compose, **without limits**.
- Data: `seed.sql` (100 users, 3 000 pages of ~4 KB, 1 500 posts, 6 000 notifications). Database of ~20 MB: it fits in memory, so disk reads are not represented.
- Reads, collab typing and uploads. GROW only with the seed course.
- Numbers below are rounded ranges from several runs.

## Result: steady load fits in one core, spikes do not

| 100 virtual users | Requests/s | API CPU | Postgres CPU | p95 |
|-------------------|-----------|---------|--------------|-----|
| Ordinary use (action every 15 s) | 11 | 6 % of a core | 5 % | < 25 ms |
| Aggressive use (action every 3 s) | 62 | 25 % | 24 % | < 25 ms |
| Aggressive + 30 simultaneous logins | 61 | 36 % | 23 % | **0.2–1.2 s** (p99 up to 1.9 s) |
| Collab: 100 connections, 10 typing | | collab 2 % | 1 % | sync 40–90 ms |

### Memory observed

| Component | Observed |
|-----------|----------|
| API | 225–340 MB under load (cgroup peak ~316 MB with a 512 MB limit) |
| Web (Next standalone) | ~180 MB; server-rendered `/login` costs 12–13 ms CPU, ~75–85 req/s per core |
| Collab | ~100 MB with 100 connections on 20 documents |
| Postgres | ~57 MB after the run (20 MB database); `shared_buffers` defaults to 128 MB |
| Redis | 5 MB |
| SeaweedFS | 52 MB idle, **648 MB** after ~12 uploads of 15 MB, and it did not go down after deleting them |

Resident total ≈ 1.5–2 GB plus the OS. Sum of the caps proposed below ≈ 3.6 GB.

### Cost per request (API + Postgres, ms of CPU)

| Endpoint | API | Postgres | Notes |
|----------|-----|----------|-------|
| `notifications/unread-count` | 1.3–2.3 | ~1 | Floor of any authenticated request (JWT + user + instance settings) |
| `know/pages/:id` | 2–3 | ~2.5 | |
| `files/:key` (an image) | 2–3.5 | ~0.7 | Same floor plus the access check |
| `connect/feed` | 3–5 | 8–9 | |
| `grow/learning` | 3–5.5 | ~4 | |
| `know/spaces/:id/pages` (1 000 pages) | 15–26 | 7–8 | 529 KB of JSON; 40–67 req/s ceiling per core |
| `know/search` (3 000 pages) | 4–8 | **130–150** | Unindexed `ILIKE` over `searchText`; grows with the corpus |
| Sign-in | **~190** | small | bcrypt cost 12 |

## Findings

Ordered by how soon they would hurt. "Measured" means reproduced with these scripts; the rest comes from reading the code and should be measured before acting.

### Measured

1. **Sign-in storm.** 99 simultaneous logins took 18 s of CPU on one core (p95 17 s). With 30 at once during a busy hour, everyone else's p95 went from ~20 ms to 0.2–1.2 s. It happens the day everyone first signs in and whenever refresh tokens (7 days) expire together. Options: more cores, limit bcrypt concurrency (a semaphore of 1–2 around `bcrypt.compare`/`hash` in `auth.service.ts`), or a lower cost (security trade-off; keep ≥ 10).
2. **Uploads are buffered in memory.** `FileInterceptor` in `storage/file-rules.ts` keeps each file in RAM and `StorageService.putObject` takes that buffer. 5 simultaneous 15 MB uploads took the API to 423 MB (from ~340 MB); 12 got it killed by the 512 MB limit. Documents go up to 50 MB, and uploaded video (T18) will make it worse. Needs streaming uploads (disk storage or a stream straight to storage, sniffing only the first bytes for the content check); until then, at least 1 GB for the API.
3. **Search has no index.** `SearchService.pages` does `contains` + `insensitive` on `title` and `searchText`: a sequential scan, 130–150 ms of Postgres CPU per query at 3 000 pages (and it parallelizes, so ten searches in a second use several cores). A `pg_trgm` GIN index fixes it; AGENTS.md warns that `migrate dev` drops indexes Prisma cannot model, so check how Prisma 7 declares one. The route also inherits the global limit (1 200 requests/min per person): give it its own `@Throttle`.
4. **Page tree is unpaginated.** One call returns every page of the space with author and last editor; 529 KB at 1 000 pages. The web loads it once per space visit (`space-context.tsx`) and the API does not compress. Compression in a reverse proxy (there is none in the compose today) and fewer fields would help; lazy children if wikis grow.
5. **Fixed cost per request.** Every authenticated request reads the user (with organization and capabilities) and the single `instanceSettings` row. Irrelevant at 100 people; `loadInstanceSettings` could be cached for a few seconds if it ever matters.

### From reading the code (not measured)

6. `NotificationService.notifyMany` runs one insert and one socket emit per member inside the request that creates an announcement (`Promise.all`, N = everyone). `createMany` plus one emit, and not awaited in the request, would avoid a burst against the connection pool.
7. The Prisma pool is not configured (`prisma.service.ts` passes only `connectionString`): the `pg` default (10 connections, no connection timeout) applies. Set `max`, `connectionTimeoutMillis` and a `statement_timeout` on purpose.
8. `ReportsService.rows` loads members, courses, enrolments with progress and attempts into memory on every request (list page, filters, dashboard). Fine for ~100 people × tens of courses; the code itself says "fewer than 500 people". Measure with a GROW dataset; later aggregate in SQL or cache per organization.
9. `use-notifications.ts` polls every 30 s (also in hidden tabs) although it has a socket, and gives the socket one token (`auth: { token }`, not a function like `use-feed-socket.ts`): after 15 minutes a reconnect sends an expired token.
10. `GET /files/*` has no `Range` support (video seeking, large PDFs) and does not stop the storage stream if the client leaves.
11. Collab: one instance (scaling out needs the Redis extension, already noted in the realtime spec); every save sends the whole Yjs state through the API, fine for text pages. Every page view, including readers, opens one WebSocket; 100 of them cost ~100 MB and ~2 % CPU.
12. The compose gives no limits or tuning to Postgres, Redis and SeaweedFS (Postgres `shared_buffers` 128 MB, `max_connections` 100; Redis without `maxmemory`). There are no metrics, no `pg_stat_statements` and no slow-query log: add them before go-live so these numbers can be checked against real use.

## Sizing from this run (first estimate, superseded by the capacity run below)

| | Minimum | Comfortable |
|---|---------|-------------|
| CPU / RAM | 2 vCPU / 4 GB | 4 vCPU / 8 GB |
| Caps | API 1 GB, web 384 MB, collab 256 MB, Postgres 1 GB (`shared_buffers` 256 MB, `max_connections` ~50), Redis 128 MB (`maxmemory` 64 MB), SeaweedFS 768 MB | the same, with room for Postgres cache |

One CPU and 2 GB is workable only for a pilot of a few dozen people: the steady CPU fits, but memory has no margin, uploads can kill the API, and a login wave stalls everything.

## Next run

After each fix, repeat `login.mjs 100`, `mix.mjs 3 60 30`, `endpoints.mjs 16 8 search,tree` and `upload.mjs 12 15` and compare with the table above. Then do the full set on the target machine with a GROW dataset.

# Capacity run — 2026-10-30

How many people fit in a whole server, not in one process. Run with `stack.sh` (`min` = 1 CPU, `rec` = 2 CPU) and `capacity.mjs`: API, collab, web, Postgres, Redis and storage pinned to the same cores and under memory caps, 100 synthetic users reused as needed, 45–60 s per step. A "person" holds 2 Socket.IO connections and 1 live-editing connection, polls notifications every 30 s and acts every 15 s (ordinary) or every 5 s (intensive): open a page (tree + page + 2 images), feed, learning, catalog, directory, or search (5 % of actions, one term that matches a few pages).

**Copes** = every action under p95 500 ms / p99 1.5 s (search: 2 s / 4 s), no failed request, all connections up, generator healthy.

## Result (this machine: a fast 4.8 GHz core; assume a cloud vCPU is up to 2× slower)

| Profile | Ordinary use (action / 15 s) | Intensive use (action / 5 s) | Box CPU at the limit |
|---------|------------------------------|------------------------------|----------------------|
| `min`: 1 CPU, 2 GB | 150 (200 with the search index) | 75–100 | 45–60 % |
| `rec`: 2 CPU, 4 GB | 500 and still coping (box at 34–39 %) | 150–200 | 50–55 % of both cores |

The steps are noisy near the limit (a step can fail while the next one passes), so each figure is the highest step that passed in the cleanest runs and the lower of the two variants (with and without the trigram index). Memory peak of the whole box: 570–930 MB in every run, far below the caps.

Cost per person (CPU of the whole box, one core): ~3.75 % divided by the seconds between actions, so 0.25 % at 15 s and 0.75 % at 5 s. Latency stays flat until the box reaches ~50–60 % of its cores and then collapses within one or two steps: do not plan above that.

## What decides the limit

- **Search.** It is 5 % of the actions and, unindexed, 200–240 ms of Postgres CPU each; it scans every page in parallel and the whole box queues behind it. With `lorem` (matches everything) 400 people at 15 s collapsed at 39 % CPU; **the same load without the search action coped at 37 %**. A `pg_trgm` index cut a selective search from 231 ms to 3.4 ms of Postgres CPU (226 searches/s instead of ~9). With a selective term and 3 000 pages the end-to-end capacity changed little (within the noise); the index matters when the corpus or the search share grows.
- **Sign-in.** bcrypt (cost 12) cost ~400 ms of CPU per login on a pinned thread (190 ms on a free core). Simultaneous logins: `min` 10 → 4.6 s, 25 → 11.6 s, 50 → 22 s; `rec` 25 → 5.3 s, 50 → 10.4 s, 100 → 20 s. The sustained rate is ~2.5 logins/s (`min`) and ~5/s (`rec`), so 100 people signing in during one minute is fine; 100 in the same second is not.
- **Uploads.** The storage service (SeaweedFS) needs roughly 100 MB plus ~80 MB per simultaneous 15 MB upload, and it is OOM-killed above its cap (compose `restart` brings it back; those uploads answer 500). With 256 MB (`min`) 2 simultaneous 15 MB uploads killed it; with 768 MB (`rec`) 8 passed and 10 killed it. The API held 5 simultaneous 15 MB uploads at 515 MB and 12 at 745 MB (with 1 GB). Limit concurrent large uploads in the API, or give storage more memory.

## Disk

Measured: 3 000 pages and 6 000 notifications = 20 MB of database (highly compressible text, so real prose weighs more, but pages are small either way); 25 test uploads = 466 MB of storage volume; images `postgres:16-alpine` 420 MB, SeaweedFS 725 MB, Redis 59 MB, the whole workspace `node_modules` 1.4 GB (the API and collab images ship their dependencies, ~0.5–1 GB each; web standalone 74 MB). Files are what grows: images up to 20 MB, documents up to 50 MB, and uploaded video (T18) will multiply it. Estimates, not measured: first-year database for ~100 people under 1 GB; files 5–10 GB without video.

## How this run went wrong first (so the next one does not)

- `systemd-run --user -p AllowedCPUs=` is **ignored silently**: the user manager does not delegate the `cpuset` controller. The first "1 CPU" run had the API on 12 cores (box CPU reported above 100 %). `stack.sh` now uses `taskset` and fails if any service is not on the cores of the profile.
- `GOMEMLIMIT=200MiB` on SeaweedFS made it burn 13 % of a core doing nothing (garbage collection against the limit). It is not set any more.
- The desktop is noisy (browsers, indexers: 10–35 % of every core). `mix.mjs` reports "other CPU use on the box's cores" per step: discard or repeat steps with a high value. A hyper-threading sibling of a pinned core that is busy is not measured; keep both quiet.
- The verdict used to fail a whole step because of search alone (few samples, heavy by nature): search is judged separately now. `PERF_NO_SEARCH=1` removes it to see its share.
- The generator can be the bottleneck: `mix.mjs` reports its event-loop lag and invalidates the run above 100 ms (it measured 13–15 ms here).

## Next

Repeat on the target machine with the same profiles, then add a GROW dataset (reports, assignments, enrolments are not in `seed.sql`). Fixes that move the numbers: the search index, a concurrency limit on uploads and on bcrypt, and more memory for storage.

# Uploads and video playback — 2026-11-02

Light load test for finding N4 (issue #22): documents up to 50 MB still go through multer **in memory**, videos are streamed to disk (T18), and nobody had measured them together or with viewers. Script: `uploads.mjs`.

## Conditions

- Machine: the same 12-core desktop. The API (`node dist/main.js`, built) ran alone in a `systemd-run --user --scope` with `MemoryMax=1G`, `MemorySwapMax=0` and `CPUQuota=200%` (the client's box: `API_MEMORY_LIMIT=1G`, 2 vCPU). Dev Postgres, Redis and SeaweedFS without limits; the load generator on the same machine, not pinned. `UPLOAD_TMP_DIR` on disk (as in the container; on a tmpfs `/tmp` the video files would count as RAM, see below).
- Data: the dev seed (37 people, one organization). The admin uploaded; the learners are 30 seed employees. Files: PDF of 50 MiB minus 1 KiB (just under the limit) and MP4 of 250 MiB, both zeros after the magic bytes.
- Memory is the RSS of the API process, sampled every 250 ms (`$PERF_TMP/uploads-rss.csv`), and the scope's `memory.current` (what the limit counts: it includes the page cache). The API was restarted before each scenario (its heap does not shrink at once, a second scenario would inherit the first one's peak). Idle: **246 MB** RSS.

## Result

| Scenario | Status codes | Peak RSS | Latency (p50 / p95 / max) |
|----------|--------------|----------|---------------------------|
| 5 simultaneous documents of 50 MB | 5 × 201 (two runs) | **759 and 796 MB** | upload 3.1 / 3.4 / 3.4 s and 4.1 / 4.5 / 4.5 s |
| 8 simultaneous documents of 50 MB | 8 × 201 | **1 018 MB** (scope 984 MB) | upload 6.3 / 6.9 / 6.9 s |
| 3 simultaneous videos of 250 MB | 3 × 200 (two runs); the 4th, while they were in flight: **503 `UPLOAD_BUSY`** | 388 MB (anon 323) | upload 8.7 / 8.8 / 8.8 s and 8.8 / 9.0 / 9.0 s |
| 30 learners seeking in the stored video, 45 s | 5 977 × 206, no error | 350–411 MB | first byte 103 / 203 / 511 ms and 177 / 360 / 634 ms; the whole range (0.25–2 MB) 112 / 211 / 513 ms and 187 / 374 / 636 ms |

The seeking scenario ran twice (3 248 and 2 729 ranges, 2.5 and 2.1 GB served, ~50 MB/s in total). No scenario triggered an OOM kill (`memory.events`: `oom_kill 0`).

## What it says

- **Documents are the memory risk, not videos.** Each 50 MB document costs ~105 MB over the idle process (multer buffers it, then it is copied into one buffer and handed to the storage client), so memory grows linearly: 5 at once peak at ~800 MB, **8 reach the 1 GB limit** (1 018 MB, 40 MB of margin: one more upload, or a few viewers at the same time, is an OOM kill that cuts every request in flight). The memory is not given back at once: RSS stayed at its peak for the next seconds and came down to ~390 MB a little later. A route with no concurrency limit (`POST /know/{pages,spaces}/:id/documents`, `POST /grow/courses/:id/files`, throttled only per person: 30–60 per minute) means one administrator loading a course's material, or three or four people doing it, is enough. Not measured: documents together with a video upload and viewers (the peaks add up: ~140 MB more for the video).
- **1 GB is enough for videos and playback.** Three simultaneous 250 MB uploads peak at 388 MB (anon 323 MB) and the 4th is refused cleanly. Thirty learners seeking at once cost nothing in memory (350–411 MB) and answer in ~100–200 ms to the first byte, p95 under 400 ms. At 1 GB the video files are not a risk: they wait on disk.
- **Page cache counts against the limit.** The scope's `memory.current` reached the 1 GB cap during the video uploads (the three 250 MB temp files, 305 times `memory.events max`) and stayed alive: the kernel reclaims cache before killing. It is a different thing from the documents' memory, which is anonymous and cannot be reclaimed. If `UPLOAD_TMP_DIR` (or `/tmp`) were a tmpfs, those 750 MB would be RAM and would not be reclaimable; the gate checks the free space for that reason (507 `UPLOAD_NO_SPACE`).
- ~~**Recommendation: move documents to the streamed path** (`receiveFile` to a temporary file and `putFile`, with the same `UploadGate` or its own) so memory stops growing with the size and the number of uploads. Not done here (this run only measures). Until then, give the API 1 GB and expect at most ~5 documents at once.~~ Done the same day, see "After: documents to disk" below.

## How this run went wrong first (so the next one does not)

- `pnpm exec` (and `lowcpu`) start the process in **their own** `systemd-run --user --scope`, a sibling of the one you asked for: `MemoryMax=1G` did not apply (`memory.max` read `max`, CPU 300 %). Start `node dist/main.js` directly inside your scope (it loads `.env` itself) and check `memory.max` and `cpu.max` of the process's cgroup before measuring.
- A video scenario run after the documents one inherits their RSS (the heap does not shrink at once): the "video" peak was 757 MB, the documents'. Restart the API between scenarios (`docs=0`, `videos=0` skip a scenario).
- A published course cannot be deleted (`COURSE_PUBLISHED`, archive only), and learners can read a lesson video only in a published course, so the seeking scenario leaves an empty archived course ("Perf video test (delete me)"); the script deletes its steps (and so the videos) and archives it. Delete the course by hand if it bothers.

## After: documents to disk (2026-11-02)

Documents now go to the temporary folder (multer `diskStorage`, `storage/file-rules.ts`) behind the `UploadGate` (10 at once, separate from the 3 videos; the free room is shared) and are stored from the file. Same conditions as above (built API alone in a 1 GB / 2 CPU scope, restarted before each run), `node uploads.mjs <docs> 50 0`:

| Scenario | Status codes | Peak RSS | Latency (p50 / p95 / max) |
|----------|--------------|----------|---------------------------|
| 8 simultaneous documents of 50 MB | 8 × 201 | **441 MB** (anon 375, scope 785 incl. page cache) | upload 3.5 / 3.7 / 3.7 s |
| 12 simultaneous documents of 50 MB | 10 × 201, 2 refused by the gate (503 before reading the body; the script sees `EPIPE` because it was still writing) | **453 MB** (anon 388, scope 890) | upload 4.5 / 4.5 / 4.5 s |

Memory no longer grows with the size of the documents (1 018 MB before for 8, now 441 MB) and the uploads are faster. No OOM kill, and the temporary folder was empty after each run. Images (up to 20 MB) are still read in memory: they are not gated and were not measured.

