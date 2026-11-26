import { readdir, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { Readable } from "stream";
import { receiveFile } from "./streamed-upload";
import type { UploadGate } from "./upload-gate";

/** A request-like stream: the body chunks plus the headers the browser sends. */
const request = (
  chunks: (Buffer | Error)[],
  headers: Record<string, string>,
) => {
  const body = new Readable({ read() {} });
  let pushed = false;
  body._read = () => {
    if (pushed) return;
    pushed = true;
    for (const chunk of chunks)
      if (chunk instanceof Error) return void body.destroy(chunk);
      else body.push(chunk);
    body.push(null);
  };
  return Object.assign(body, { headers });
};

// An MP4's leading `ftyp` box.
const MP4 = Buffer.concat([
  Buffer.from([0, 0, 0, 20]),
  Buffer.from("ftypisom\0\0\0\0isom"),
  Buffer.alloc(100, 7),
]);
const headers = (length: number, type = "video/mp4") => ({
  "content-type": type,
  "content-length": String(length),
});
const leftovers = async () =>
  (await readdir(tmpdir())).filter((f) => f.startsWith("cluster-upload-"));

const gate = {
  acquire: jest.fn(async () => release),
} as unknown as UploadGate;
const release = jest.fn();
const receive = (
  kind: Parameters<typeof receiveFile>[0],
  body: Parameters<typeof receiveFile>[1],
  name: string,
) => receiveFile(kind, body, name, gate);

describe("receiveFile", () => {
  let before: string[];
  beforeEach(async () => {
    before = await leftovers();
    jest.clearAllMocks();
  });
  afterEach(async () => {
    // Every rejected upload leaves nothing behind.
    expect(await leftovers()).toEqual(before);
  });

  it("writes the body to a temporary file and resolves its type by content", async () => {
    const half = MP4.length / 2;
    const file = await receive(
      "video",
      request([MP4.subarray(0, half), MP4.subarray(half)], headers(MP4.length)),
      "intro.mp4",
    );
    expect(file).toMatchObject({
      size: MP4.length,
      mime: "video/mp4",
      extension: "mp4",
    });
    expect(Buffer.compare(await readFile(file.path), MP4)).toBe(0);
    // The slot stays taken until the caller has stored the file and calls release.
    expect(gate.acquire).toHaveBeenCalledWith(MP4.length, "video");
    expect(release).not.toHaveBeenCalled();
    await rm(file.path);
    file.release();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("asks the gate nothing for what it refuses before reading, and gives the slot back when the upload fails", async () => {
    await expect(
      receive(
        "video",
        request([MP4], headers(MP4.length, "application/pdf")),
        "notes.pdf",
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(gate.acquire).not.toHaveBeenCalled();

    await expect(
      receive("video", request([MP4, MP4], headers(MP4.length)), "a.mp4"),
    ).rejects.toMatchObject({ status: 413 });
    expect(gate.acquire).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("does not read the body when the gate refuses", async () => {
    const busy = Object.assign(new Error("busy"), { status: 503 });
    (gate.acquire as jest.Mock).mockRejectedValueOnce(busy);
    const untouched = request([MP4], headers(MP4.length));
    await expect(receive("video", untouched, "a.mp4")).rejects.toBe(busy);
    expect(untouched.readableFlowing).toBeNull();
  });

  it("refuses an unknown type, a missing size or an oversized one before reading", async () => {
    const untouched = request([MP4], headers(MP4.length, "application/pdf"));
    await expect(
      receive("video", untouched, "notes.pdf"),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: "VIDEO_TYPE_UNSUPPORTED" },
    });
    expect(untouched.readableFlowing).toBeNull();
    await expect(
      receive(
        "video",
        request([MP4], { "content-type": "video/mp4" }),
        "a.mp4",
      ),
    ).rejects.toMatchObject({ status: 411 });
    await expect(
      receive("video", request([MP4], headers(1024 ** 3 + 1)), "a.mp4"),
    ).rejects.toMatchObject({ status: 413 });
    await expect(
      receive("video", request([], headers(0)), "a.mp4"),
    ).rejects.toMatchObject({
      status: 400,
    });
  });

  it("stops at more bytes than announced and removes the partial file", async () => {
    await expect(
      receive("video", request([MP4, MP4], headers(MP4.length)), "a.mp4"),
    ).rejects.toMatchObject({ status: 413 });
  });

  it("removes the partial file when the upload is cut, answering 400 instead of a server error", async () => {
    const cut = Object.assign(new Error("aborted"), { code: "ECONNRESET" });
    await expect(
      receive(
        "video",
        request([MP4.subarray(0, 30), cut], headers(MP4.length)),
        "a.mp4",
      ),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: "UPLOAD_INTERRUPTED" },
    });
  });

  it("rejects content that is not what it claims, after reading it", async () => {
    const fake = Buffer.from("<html>not a video</html>");
    await expect(
      receive("video", request([fake], headers(fake.length)), "a.mp4"),
    ).rejects.toMatchObject({ status: 400 });
  });
});
