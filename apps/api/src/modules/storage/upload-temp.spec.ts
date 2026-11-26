import { mkdtemp, rm, utimes, writeFile, readdir } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { sweepStaleUploads, UPLOAD_TEMP_PREFIX } from "./upload-temp";

describe("sweepStaleUploads", () => {
  let dir: string;
  const HOUR = 60 * 60 * 1000;
  const now = Date.now();

  const touch = async (name: string, ageMs: number) => {
    const path = join(dir, name);
    await writeFile(path, "x");
    const when = new Date(now - ageMs);
    await utimes(path, when, when);
  };

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "sweep-test-"));
  });
  afterEach(async () => rm(dir, { recursive: true, force: true }));

  it("removes only our upload files older than the limit", async () => {
    await touch(`${UPLOAD_TEMP_PREFIX}old`, 3 * HOUR);
    await touch(`${UPLOAD_TEMP_PREFIX}recent`, 10 * 60 * 1000);
    await touch("someone-elses-old-file", 30 * HOUR);

    const removed = await sweepStaleUploads(dir, 2 * HOUR, now);

    expect(removed).toBe(1);
    expect((await readdir(dir)).sort()).toEqual([
      `${UPLOAD_TEMP_PREFIX}recent`,
      "someone-elses-old-file",
    ]);
  });

  it("does nothing when the folder is missing", async () => {
    await expect(sweepStaleUploads(join(dir, "nope"), HOUR, now)).resolves.toBe(
      0,
    );
  });
});
