// Light load test of uploads and video playback (issue #22, finding N4). Against a running API, as the seed admin:
//   1. N simultaneous documents (default 5 x 50 MB) to a KNOW space: multer keeps each in memory.
//   2. M simultaneous lesson videos (default 3 x 250 MB, the UploadGate limit) plus a 4th, which must get 503 UPLOAD_BUSY.
//   3. L learners (default 30) seeking in the stored video with random Range requests for S seconds.
// It samples the API's RSS (and its cgroup's memory.current, which is what a memory limit counts) every 250 ms into
// $PERF_TMP/uploads-rss.csv, and deletes what it created. Needs no perf database: run it on the dev seed.
//   PERF_API_URL=http://localhost:3101/api/v1 PERF_TMP=<dir> UPLOAD_DIR=<dir> node uploads.mjs [docs=5] [docMB=50] [videos=3] [videoMB=250] [learners=30] [seconds=45]
// A count of 0 skips that scenario (videos=0 skips the learners too). Restart the API between runs: its heap does not shrink at once.
// The superadmin signs in with 2FA once (the dev TOTP secret, see lib.mjs); the learners are seed employees.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import {
  ADMIN,
  API,
  ROOT,
  TMP,
  bearer,
  login,
  pct,
  pick,
  pidOfPort,
  rssMB,
  sleep,
} from "./lib.mjs";

const [DOCS, DOC_MB, VIDEOS, VIDEO_MB, LEARNERS, SECONDS] = [
  5, 50, 3, 250, 30, 45,
].map((d, i) => Number(process.argv[2 + i] ?? d));
const DIR = process.env.UPLOAD_DIR ?? TMP;
fs.mkdirSync(DIR, { recursive: true });
const MiB = 1024 * 1024;

// Files with the magic bytes the content check wants, then zeros (sparse on disk).
function makeFile(name, head, bytes) {
  const file = path.join(DIR, name);
  fs.writeFileSync(file, head);
  fs.truncateSync(file, bytes);
  return file;
}
const PDF_HEAD = Buffer.from("%PDF-1.4\n");
const MP4_HEAD = Buffer.concat([
  Buffer.from([0, 0, 0, 20]),
  Buffer.from("ftypisom\0\0\0\0isom"),
]);

// ── memory sampler ──
const pid = pidOfPort(API);
const cg =
  "/sys/fs/cgroup" +
  fs.readFileSync(`/proc/${pid}/cgroup`, "utf8").trim().split("::")[1];
const cgMB = () =>
  Math.round(Number(fs.readFileSync(`${cg}/memory.current`, "utf8")) / MiB);
// memory.current also counts the page cache (the temp files of video uploads), which the kernel reclaims; anon is the process's own.
const cgAnonMB = () =>
  Math.round(
    Number(
      fs.readFileSync(`${cg}/memory.stat`, "utf8").match(/^anon (\d+)/m)[1],
    ) / MiB,
  );
let label = "idle";
const peaks = {};
const csv = fs.createWriteStream(path.join(TMP, "uploads-rss.csv"));
csv.write("t_s,scenario,rss_mb,cgroup_mb,cgroup_anon_mb\n");
const t0 = performance.now();
const sampler = setInterval(() => {
  try {
    const [r, c, a] = [rssMB(pid), cgMB(), cgAnonMB()];
    const p = (peaks[label] ??= { rss: 0, cg: 0, anon: 0 });
    p.rss = Math.max(p.rss, r);
    p.cg = Math.max(p.cg, c);
    p.anon = Math.max(p.anon, a);
    csv.write(
      `${((performance.now() - t0) / 1000).toFixed(2)},${label},${r},${c},${a}\n`,
    );
  } catch {
    // the API died: the statuses say so
  }
}, 250);

const json = async (method, route, token, body) => {
  const r = await fetch(API + route, {
    method,
    headers: {
      ...bearer(token),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body && JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok && method !== "DELETE")
    throw new Error(`${method} ${route} -> ${r.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : {};
};
const tally = (statuses) =>
  JSON.stringify(statuses.reduce((a, s) => ((a[s] = (a[s] ?? 0) + 1), a), {}));
const lat = (ms) =>
  `p50 ${pct(ms, 0.5)} / p95 ${pct(ms, 0.95)} / max ${pct(ms, 1)} ms`;
const results = [];
const report = (name, extra) => {
  const p = peaks[name] ?? { rss: 0, cg: 0, anon: 0 };
  results.push(
    `${name}: peak RSS ${p.rss} MB, cgroup ${p.cg} MB (anon ${p.anon}); ${extra}`,
  );
  console.log(results.at(-1));
};

// Streams a file as the request body with its Content-Length (the video route takes a raw body).
function putFile(route, token, file, size) {
  const t = performance.now();
  return new Promise((resolve) => {
    const u = new URL(API + route);
    const req = http.request(
      u,
      {
        method: "PUT",
        headers: {
          ...bearer(token),
          "content-type": "video/mp4",
          "content-length": size,
        },
      },
      (res) => {
        let text = "";
        res.on("data", (c) => (text += c));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            ms: performance.now() - t,
            body: text,
          }),
        );
      },
    );
    req.on("error", (e) =>
      resolve({
        status: `ERR ${e.code ?? e.message}`,
        ms: performance.now() - t,
        body: "",
      }),
    );
    fs.createReadStream(file).pipe(req);
  });
}

const created = { documents: [], course: null };
let admin;
try {
  // The superadmin signs in once; a token lasts 15 min, longer than this run.
  admin = (await login(ADMIN.email, ADMIN.password)).token;
  if (!admin)
    throw new Error(
      "The admin could not sign in (a TOTP code is accepted once per 30 s: wait and retry)",
    );
  const spaces = (await json("GET", "/know/spaces", admin)).data;
  if (!spaces?.length) throw new Error("No KNOW space to upload to");

  // ── 1. documents ──
  if (DOCS > 0) {
    const pdf = makeFile("doc.pdf", PDF_HEAD, DOC_MB * MiB - 1024);
    const blob = new Blob([fs.readFileSync(pdf)], { type: "application/pdf" });
    label = "documents";
    const docs = await Promise.all(
      Array.from({ length: DOCS }, async (_, i) => {
        const fd = new FormData();
        fd.append("file", blob, `perf-doc-${i}.pdf`);
        const t = performance.now();
        try {
          const r = await fetch(
            `${API}/know/spaces/${spaces[0].id}/documents`,
            { method: "POST", headers: bearer(admin), body: fd },
          );
          const j = await r.json().catch(() => ({}));
          if (j.data?.id) created.documents.push(j.data.id);
          return { status: r.status, ms: performance.now() - t };
        } catch (e) {
          return {
            status: `ERR ${e.cause?.code ?? e.message}`,
            ms: performance.now() - t,
          };
        }
      }),
    );
    report(
      "documents",
      `${DOCS} x ${DOC_MB} MB: ${tally(docs.map((d) => d.status))}; upload ${lat(docs.map((d) => d.ms))}`,
    );
    await sleep(2000);
    label = "idle";
  }

  // ── 2. videos ──
  if (VIDEOS > 0) {
    const course = (
      await json("POST", "/grow/courses", admin, {
        title: "Perf video test (delete me)",
      })
    ).id;
    created.course = course;
    const section = (
      await json("POST", `/grow/courses/${course}/sections`, admin, {
        title: "Videos",
      })
    ).id;
    const steps = [];
    for (let i = 0; i <= VIDEOS; i++)
      steps.push(
        (
          await json("POST", `/grow/sections/${section}/steps`, admin, {
            type: "LESSON",
            title: `Video ${i}`,
          })
        ).id,
      );
    const mp4 = makeFile("video.mp4", MP4_HEAD, VIDEO_MB * MiB);
    const small = makeFile("small.mp4", MP4_HEAD, 64 * 1024);
    const route = (s, name) => `/grow/steps/${s}/video?name=${name}.mp4`;
    label = "videos";
    const sends = steps
      .slice(0, VIDEOS)
      .map((s, i) => putFile(route(s, `perf${i}`), admin, mp4, VIDEO_MB * MiB));
    await sleep(300);
    const fourth = await putFile(
      route(steps[VIDEOS], "perf-extra"),
      admin,
      small,
      64 * 1024,
    );
    const vids = await Promise.all(sends);
    report(
      "videos",
      `${VIDEOS} x ${VIDEO_MB} MB: ${tally(vids.map((d) => d.status))}; upload ${lat(vids.map((d) => d.ms))}; 4th while busy: ${fourth.status} ${fourth.body.match(/UPLOAD_[A-Z_]+/)?.[0] ?? ""}`,
    );
    await sleep(2000);
    label = "idle";

    // ── 3. learners seeking ──
    const key = (
      await json("GET", `/grow/courses/${course}/edit`, admin)
    )?.sections?.[0]?.steps?.find((s) => s.content?.video)?.content.video.key;
    if (!key) throw new Error("No stored video found in the course");
    await json("POST", `/grow/courses/${course}/publish`, admin);
    const emails = [
      ...fs
        .readFileSync(
          path.join(ROOT, "apps/api/prisma/seed-data/collaborators.ts"),
          "utf8",
        )
        .matchAll(/email: "([^"]+)"/g),
    ]
      .map((m) => m[1])
      .slice(0, LEARNERS);
    const learners = [];
    for (let i = 0; i < emails.length; i += 10)
      learners.push(
        ...(
          await Promise.all(
            emails.slice(i, i + 10).map((e) => login(e, "Cluster-team-2026")),
          )
        ).filter((l) => l.token),
      );
    if (learners.length < LEARNERS)
      console.log(`only ${learners.length} of ${LEARNERS} learners signed in`);
    const size = VIDEO_MB * MiB;
    const [ttfb, total, statuses] = [[], [], []];
    let bytes = 0;
    const end = performance.now() + SECONDS * 1000;
    label = "seeking";
    await Promise.all(
      learners.map(async ({ token }) => {
        while (performance.now() < end) {
          const from = Math.floor(Math.random() * (size - MiB));
          const len = pick([256 * 1024, MiB, 2 * MiB]); // a player asks for slices of that size after a seek
          const t = performance.now();
          try {
            const r = await fetch(`${API}/files/${key}`, {
              headers: {
                ...bearer(token),
                range: `bytes=${from}-${Math.min(size - 1, from + len - 1)}`,
              },
            });
            ttfb.push(performance.now() - t);
            bytes += (await r.arrayBuffer()).byteLength;
            total.push(performance.now() - t);
            statuses.push(r.status);
          } catch (e) {
            statuses.push(`ERR ${e.cause?.code ?? e.message}`);
          }
          await sleep(100 + Math.random() * 400);
        }
      }),
    );
    report(
      "seeking",
      `${learners.length} learners, ${SECONDS}s, ${statuses.length} ranges (${(bytes / MiB).toFixed(0)} MB): ${tally(statuses)}; first byte ${lat(ttfb)}; whole range ${lat(total)}`,
    );
  }
} finally {
  label = "cleanup";
  // Through the API so storage is cleaned. A published course cannot be deleted: its steps go (and their videos), then it is archived.
  if (admin) {
    for (const id of created.documents)
      await json("DELETE", `/know/documents/${id}`, admin).catch(() => {});
    if (created.course) {
      const c = await json(
        "GET",
        `/grow/courses/${created.course}/edit`,
        admin,
      ).catch(() => null);
      for (const s of c?.sections?.flatMap((x) => x.steps) ?? [])
        await json("DELETE", `/grow/steps/${s.id}`, admin).catch(() => {});
      const r = await fetch(`${API}/grow/courses/${created.course}`, {
        method: "DELETE",
        headers: bearer(admin),
      });
      if (r.status !== 204)
        await json(
          "POST",
          `/grow/courses/${created.course}/archive`,
          admin,
        ).catch(() => {});
      console.log(
        `course ${created.course}: DELETE ${r.status}${r.status === 204 ? "" : " (published: archived instead)"}`,
      );
    }
  }
  clearInterval(sampler);
  csv.end();
  for (const f of ["doc.pdf", "video.mp4", "small.mp4"])
    fs.rmSync(path.join(DIR, f), { force: true });
  console.log("\n" + results.join("\n"));
  console.log(
    "cgroup memory.events:",
    fs.readFileSync(`${cg}/memory.events`, "utf8").replace(/\n/g, " "),
  );
}
