// sharp is CommonJS (`export =`); the build has no esModuleInterop, so only this form works in both the build and Jest.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import sharp = require("sharp");
import { logoForPdf } from "./certificate-logo";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const image = () =>
  sharp({ create: { width: 8, height: 8, channels: 4, background: "#c00" } });

describe("logoForPdf", () => {
  it("passes a PNG or JPEG through untouched", async () => {
    const png = await image().png().toBuffer();
    const jpg = await image().jpeg().toBuffer();
    expect(await logoForPdf(png, "uploads/a.png")).toBe(png);
    expect(await logoForPdf(jpg, "uploads/a.jpg")).toBe(jpg);
  });

  it.each([
    ["webp", () => image().webp().toBuffer()],
    ["gif", () => image().gif().toBuffer()],
    ["avif", () => image().avif().toBuffer()],
  ])("turns a %s into a PNG", async (ext, make) => {
    const out = await logoForPdf(await make(), `uploads/a.${ext}`);
    expect(out?.subarray(0, 4)).toEqual(PNG_SIGNATURE);
  });

  it("gives up on a file it cannot read or a type it does not know", async () => {
    expect(await logoForPdf(Buffer.from("nope"), "uploads/a.gif")).toBeNull();
    expect(await logoForPdf(Buffer.from("BM"), "uploads/a.bmp")).toBeNull();
  });
});
