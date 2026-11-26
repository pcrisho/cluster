import { HttpException } from "@nestjs/common";
import {
  FREE_SPACE_MARGIN,
  MAX_CONCURRENT_UPLOADS,
  UploadGate,
} from "./upload-gate";

const GB = 1024 * 1024 * 1024;

const gateWith = (free: number) => {
  const gate = new UploadGate();
  gate.readFreeBytes = async () => free;
  return gate;
};
const refusal = async (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: HttpException) => ({
      status: error.getStatus(),
      code: (error.getResponse() as { code: string }).code,
    }),
  );

describe("UploadGate", () => {
  it(`takes ${MAX_CONCURRENT_UPLOADS} uploads at once and says busy to the next`, async () => {
    const gate = gateWith(100 * GB);
    const releases = [];
    for (let i = 0; i < MAX_CONCURRENT_UPLOADS; i++)
      releases.push(await gate.acquire(GB, "video"));

    expect(await refusal(gate.acquire(GB, "video"))).toEqual({
      status: 503,
      code: "UPLOAD_BUSY",
    });
    releases[0]();
    await expect(gate.acquire(GB, "video")).resolves.toEqual(
      expect.any(Function),
    );
  });

  it("holds exactly the cap when many arrive in the same instant", async () => {
    const gate = gateWith(100 * GB);
    const results = await Promise.all(
      Array.from({ length: 8 }, () => refusal(gate.acquire(GB, "video"))),
    );
    expect(results.filter((r) => r === null)).toHaveLength(
      MAX_CONCURRENT_UPLOADS,
    );
    expect(results.filter((r) => r?.code === "UPLOAD_BUSY")).toHaveLength(
      8 - MAX_CONCURRENT_UPLOADS,
    );
  });

  it("counts the space already promised to uploads in flight", async () => {
    // Room for one 1 GB upload and the margin, not for a second.
    const gate = gateWith(GB + FREE_SPACE_MARGIN + 1024);
    await gate.acquire(GB, "video");
    expect(await refusal(gate.acquire(GB, "video"))).toEqual({
      status: 507,
      code: "UPLOAD_NO_SPACE",
    });
  });

  it("refuses a file that would eat into the margin of an empty disk", async () => {
    const gate = gateWith(GB + FREE_SPACE_MARGIN - 1);
    expect(await refusal(gate.acquire(GB, "video"))).toMatchObject({
      status: 507,
      code: "UPLOAD_NO_SPACE",
    });
    // The refused one holds nothing: a smaller file still fits.
    await expect(gate.acquire(GB / 2, "video")).resolves.toEqual(
      expect.any(Function),
    );
  });

  it("gives the slot and the space back once, however many times it is released", async () => {
    const gate = gateWith(GB + FREE_SPACE_MARGIN + 1024);
    const release = await gate.acquire(GB, "video");
    release();
    release();
    const again = await gate.acquire(GB, "video");
    expect(await refusal(gate.acquire(GB, "video"))).toMatchObject({
      status: 507,
    });
    again();
  });

  it("reads the real free space of the temp folder by default", async () => {
    const free = await new UploadGate().readFreeBytes();
    expect(free).toBeGreaterThan(0);
  });
});
