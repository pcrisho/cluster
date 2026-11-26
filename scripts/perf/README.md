# Load scripts

Scripts to measure how much CPU, memory and latency Cluster needs for a given number of people, and where it breaks first. They are the starting point for sizing a deployment and for checking, after a change, that a bottleneck really moved. The first run and the capacity run (how many people fit in 1 CPU / 2 GB and in 2 CPU / 4 GB), what they found and how the first attempts went wrong are in [`BASELINE.md`](./BASELINE.md).

They are plain Node (>= 22) and shell, with no dependencies of their own, outside the pnpm workspace (no lint, typecheck or CI). Linux only: they read `/proc` and cgroups, and `stack.sh` uses `systemd-run --user` and `taskset`, and the infrastructure runs in Docker.

## What they do

| Script | Measures | Typical question |
|--------|----------|------------------|
| `db.sh` | Starts the perf Postgres and creates the `cluster_perf` database with synthetic data (`seed.sql`); `orgs` adds four organizations (`seed-orgs.sql`); `teardown` removes the containers and their data | |
| `stack.sh` | The load-test box: Postgres, Redis and storage (`docker-compose.perf.yml`) plus API, collab and web, pinned to the same cores and under memory caps, in a profile (`min` or `rec`) | "Does it fit in 1 CPU / 2 GB?" |
| `endpoints.mjs` | One endpoint at a time, as fast as it goes: throughput, latency and **CPU per request** (API and Postgres) | "Which endpoint is the most expensive?" |
| `mix.mjs` | N people doing what people do (live-editing and Socket.IO connections, open a page, feed, learning, search...), the CPU and memory of the whole box and a verdict against latency limits; optionally a login storm | "What does an ordinary or a busy hour cost?" |
| `capacity.mjs` | Runs `mix.mjs` with more and more people at two intensities until the box stops coping | "How many people fit?" |
| `login.mjs` | N people signing in at the same instant | "What happens on go-live morning?" |
| `collab-load.mjs` | Realtime editing: many connections, a few people typing | "How many live sessions fit?" |
| `upload.mjs` | N simultaneous uploads of a given size | "Does an upload burst kill the API?" |
| `uploads.mjs` | 5 documents of 50 MB at once, 3 videos of 250 MB (and a 4th refused), 30 learners seeking in a video; memory peak, status codes and latency of each | "Does 1 GB hold the uploads and the playback?" |
| `web-load.mjs` | The Next server (server-rendered pages, static files) | |
| `cleanup.mjs` | Removes the files the scripts stored in the bucket | |
| `plans.mjs` | The Postgres plans of each critical read, as the API runs them under row-level security (`auto_explain`); with `db.sh orgs` | "Does this read need an index?" |

## Run it

Needs Docker and a build (`pnpm build`; the web is skipped without `apps/web/.next/standalone`). The box has its own Postgres, Redis and storage (`docker-compose.perf.yml`), so the dev compose is not needed and is not touched.

```sh
scripts/perf/db.sh setup          # perf Postgres :55432, cluster_perf: app role + migrations + normal seed + synthetic data (~1 min)
scripts/perf/stack.sh start [min|rec]   # API :3011, collab :3012, web :3013, Redis :56379, storage :59000 (the dev stack is untouched)

cd scripts/perf
node endpoints.mjs                # per-endpoint cost            (args: workers=16 seconds=8 filter)
node mix.mjs 15 60                # ordinary hour                (args: action-every-s duration-s users=100 storm-logins)
node mix.mjs 3 60 100 30          # aggressive: an action every 3 s + 30 logins at t=20 s
taskset -c 8-11 node capacity.mjs # how many fit (args: intensities=15,5 steps=25,50,...,300 seconds=60)
node login.mjs 100                # 100 simultaneous sign-ins
node collab-load.mjs              # 100 connections, 10 typing    (args: readers editors docs seconds)
node upload.mjs 5 15              # 5 uploads of 15 MB at once
PERF_API_URL=http://localhost:3101/api/v1 node uploads.mjs   # against any running API with the dev seed (args: docs docMB videos videoMB learners seconds; see its header and BASELINE.md)
node web-load.mjs /login

node plans.mjs <out-dir>          # query plans of the critical reads (see "Query plans" below)

node cleanup.mjs                  # BEFORE teardown: removes uploaded files from the bucket
scripts/perf/stack.sh stop
scripts/perf/db.sh teardown        # removes the perf containers AND their data
```

Run the load generator on other cores than the box (`taskset -c 8-11 node mix.mjs ...`), or it steals CPU from what it measures.

### Query plans

`plans.mjs` writes, per critical read, the plans Postgres logged while the API answered it. It needs more than one organization in the database (`db.sh orgs`, `seed-orgs.sql`: four organizations of 400 people, and areas, positions, courses, enrolments and 20 000 audit entries for every organization) and `auto_explain` on for the app role, before `stack.sh start`:

```sh
scripts/perf/db.sh setup && scripts/perf/db.sh orgs
for s in "session_preload_libraries = 'auto_explain'" "auto_explain.log_min_duration = 0" \
         "auto_explain.log_analyze = on" "auto_explain.log_buffers = on"; do
  docker exec perf-postgres psql -U cluster -d cluster_perf -c "ALTER ROLE cluster_app IN DATABASE cluster_perf SET $s"
done
scripts/perf/stack.sh start min
cd scripts/perf && node plans.mjs ../../docs/specs/org/rls/evidence/indexes/after
```

Plan as `cluster_app`, not as the owner: the owner skips the policies, and an index it uses may be one the app role cannot (see `docs/specs/org/rls/evidence/indexes/README.md`).

The synthetic users are `perf1@cluster.example`…`perf100@cluster.example` (password `Cluster-team-2026`, role COLLABORATOR); editors in `collab-load.mjs` use `admin@cluster.example`. Tokens are cached in `$TMPDIR/cluster-perf` for 8 minutes (they expire after 15).

### Settings (environment)

| Variable | Default | Effect |
|----------|---------|--------|
| `PERF_API_URL` / `PERF_COLLAB_URL` / `PERF_WEB_URL` | `localhost` ports 3011 / 3012 / 3013 | Target of the scripts |
| `PERF_CPUSET` | `2` (`min`), `4,6` (`rec`) | Cores the whole box is pinned to (`taskset` for API, collab and web; `cpuset` for the containers). Pick physical cores and keep their hyper-threading siblings, and the load generator, elsewhere |
| `PERF_CORES` | `1` | Cores the box has, for the CPU verdict of `mix.mjs` |
| `PERF_P95_MS`, `PERF_P99_MS`, `PERF_SEARCH_P95_MS`, `PERF_SEARCH_P99_MS` | `500`, `1500`, `2000`, `4000` | Latency limits of the verdict (search has more room: it scans every page) |
| `PERF_NO_SEARCH` | unset | Set to `1` to drop the search action from `mix.mjs` and see how much of the load it explains |
| `PERF_SEARCH_Q` | `202cb9` | The search term `mix.mjs` uses: one that appears in a handful of pages, like a real query (`lorem` is in all of them) |
| `PERF_PG_CONTAINER` | `perf-postgres` | Container whose CPU is reported as `pg` (shows `n/a` if it cannot be read) |
| `PERF_USERS`, `PERF_PASSWORD`, `PERF_ADMIN_EMAIL`, `PERF_ADMIN_PASSWORD`, `PERF_ORIGIN` | 100, seed passwords, `http://localhost:3000` | Users and the WebSocket origin (must be in `COLLAB_ALLOWED_ORIGINS`) |
| `PERF_TMP` | `$TMPDIR/cluster-perf` | Tokens and service logs |

## Reading the results

- **`api=` / `pg=` ms per request** is the number to size with: requests per second × CPU per request = cores. Postgres, Redis and storage are pinned to the same cores as the API, so they compete for the CPU like on one small server: what has to fit in the cores is the sum of the whole box.
- **Closed loop.** Each virtual user waits for its answer before the next action, so latencies under saturation are honest but the tool does not overload the server beyond its capacity. `mix.mjs` adds think time, which is what separates "a busy hour" from "a stress test".
- **The machine matters.** Numbers from a fast desktop CPU are optimistic for a cloud vCPU (assume up to 2× the CPU time). Measure on the target machine before deciding.
- **Data matters.** `seed.sql` is a year of use for ~100 people. Its text is highly compressible, so searches on real prose cost at least as much. GROW is not scaled (only the seed course): reports, assignments and enrolments need their own dataset before sizing a company that lives in the LMS.
- **Noise.** `mix.mjs` prints `other CPU use on the box's cores`: what else ran on them (other programs, plus the kernel work of the box). On a shared desktop it can be 10–35 %; discard or repeat a step with a high value, and keep the hyper-threading siblings of the pinned cores idle. It also prints the generator's event-loop lag and rejects the run above 100 ms.
- **Reads dominate.** The scripts are read-heavy, plus typing in collab and uploads. Writes (posts, likes, saving pages) are light next to them, but they are not measured.

## Safety

- The API runs as `cluster_app` (so row-level security applies, as in production); migrations, seed and the system client use the owner (`cluster`). `db.sh` creates the role with `src/db-roles.ts`.
- The perf box has its own Postgres, Redis and storage (ports 55432, 56379, 59000); `db.sh` never touches `cluster` (dev) or `cluster_test` (e2e). `db.sh teardown` deletes the perf data.
- Never run the seed or the scripts against a production database: they create users with a known password and fill the organization with fake content. For a staging VM, restore into a dedicated database and point `PERF_API_URL` to it.
- `upload.mjs` is designed to be able to kill the API (an OOM at the API's memory cap is a valid result). It writes to the bucket the API is configured with: use `cleanup.mjs`.
- `login.mjs` and `mix.mjs ... <storm>` deliberately create a CPU spike.

## Extending it

- Add endpoints to the `endpoints` map in `endpoints.mjs` and actions to `actions` in `mix.mjs` (weights are relative).
- GROW at scale: extend `seed.sql` with courses, steps, assignments and enrolments, then measure `/grow/reports/compliance` (loaded entirely in memory per request; see BASELINE.md).
- Write paths: posts with an announcement (notifies everyone), likes, saving pages through collab.
- Next steps worth automating: run the set on a schedule or in CI against a fixed machine and keep the numbers over time; export results as JSON instead of console lines.
