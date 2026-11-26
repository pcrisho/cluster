import { renderCertificatePdf } from "./certificate-pdf";

// 1x1 PNG (passes the PNG signature check that pdfkit does)
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

const cert = {
  recipientName: "Ana Test",
  courseTitle: "Ladders",
  organizationName: "Acme",
  issuedOn: new Date("2026-10-30T00:00:00Z"),
  code: "ABCDEFGHJKLM",
};
const hasImage = (pdf: Buffer) => pdf.toString("latin1").includes("/Subtype /Image");

describe("renderCertificatePdf", () => {
  it("prints the organization's logo when it has one", async () => {
    const pdf = await renderCertificatePdf(cert, "http://x/verify/1", "en", PNG);
    expect(hasImage(pdf)).toBe(true);
  });

  it("is text only without a logo", async () => {
    expect(hasImage(await renderCertificatePdf(cert, "http://x/verify/1", "en"))).toBe(false);
    expect(hasImage(await renderCertificatePdf(cert, "http://x/verify/1", "en", null))).toBe(false);
  });

  it("still renders when the logo is not an image pdfkit can read", async () => {
    const pdf = await renderCertificatePdf(cert, "http://x/verify/1", "en", Buffer.from("not an image"));
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(hasImage(pdf)).toBe(false);
  });

  it("renders with a brand accent and without one", async () => {
    for (const accent of [null, "#4c33e1"]) {
      const pdf = await renderCertificatePdf(cert, "http://x/verify/1", "en", null, accent);
      expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    }
  });
});
