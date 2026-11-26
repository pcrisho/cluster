import { readFileSync } from "fs";
import { join } from "path";
// pdfkit is CommonJS (`module.exports = PDFDocument`); the build has no esModuleInterop but Jest does, and only this form works in both.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import PDFDocument = require("pdfkit");
import type { Locale } from "../../common/locale";
import { translate } from "../../i18n/translate";
import { formatCode } from "./certificate-code";

// Inter (SIL OFL, assets/fonts/Inter-LICENSE.txt), embedded because the built-in PDF fonts cannot write every name.
const FONTS = join(__dirname, "..", "..", "..", "assets", "fonts");
let fonts: { regular: Buffer; semibold: Buffer } | null = null;
const loadFonts = () =>
  (fonts ??= {
    regular: readFileSync(join(FONTS, "Inter-Regular.ttf")),
    semibold: readFileSync(join(FONTS, "Inter-SemiBold.ttf")),
  });

/** Side of the box the logo fits in, in points. */
const LOGO_SIZE = 48;

export interface CertificateText {
  recipientName: string;
  courseTitle: string;
  organizationName: string;
  /** Calendar date of issue (a @db.Date: midnight UTC), already in the organization's zone. */
  issuedOn: Date;
  code: string;
}

/**
 * The certificate as a landscape A4 PDF in `locale` (the downloader's); `verifyUrl` is the public page for its code.
 * `logo` (PNG or JPEG bytes) is printed above the organization's name; one pdfkit cannot read is left out.
 * `accent` (a hex readable on white) colours the top rule and the organization's name; `null` keeps the neutral greys.
 */
export function renderCertificatePdf(
  cert: CertificateText,
  verifyUrl: string,
  locale: Locale = "en",
  logo?: Buffer | null,
  accent: string | null = null,
): Promise<Buffer> {
  const t = (
    key: Parameters<typeof translate>[1],
    params?: Record<string, string>,
  ) => translate(locale, key, params);
  const { regular, semibold } = loadFonts();
  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margin: 72,
    info: {
      Title: t("certificate.documentTitle", { course: cert.courseTitle }),
    },
  });
  const done = new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (d: Buffer) => chunks.push(d));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  doc.registerFont("regular", regular);
  doc.registerFont("semibold", semibold);

  const x = 72;
  const width = doc.page.width - 144;
  const centered = { width, align: "center" as const };
  doc
    .rect(36, 36, doc.page.width - 72, doc.page.height - 72)
    .lineWidth(1)
    .stroke("#d4d4d8");
  if (accent)
    doc
      .moveTo(36, 36)
      .lineTo(doc.page.width - 36, 36)
      .lineWidth(4)
      .stroke(accent);

  let nameY = 104;
  if (logo) {
    try {
      doc.image(logo, doc.page.width / 2 - LOGO_SIZE / 2, 68, {
        fit: [LOGO_SIZE, LOGO_SIZE],
        align: "center",
        valign: "center",
      });
      nameY = 68 + LOGO_SIZE + 10;
    } catch {
      // Not a PNG or JPEG pdfkit can read: the certificate is text only.
    }
  }
  doc
    .font("regular")
    .fontSize(12)
    .fillColor(accent ?? "#71717a")
    .text(cert.organizationName.toUpperCase(), x, nameY, {
      ...centered,
      characterSpacing: 2,
    });
  doc.moveDown(1.5);
  doc
    .font("semibold")
    .fontSize(32)
    .fillColor("#18181b")
    .text(t("certificate.title"), x, doc.y, centered);
  doc.moveDown(1.2);
  doc
    .font("regular")
    .fontSize(14)
    .fillColor("#52525b")
    .text(t("certificate.certifies"), x, doc.y, centered);
  doc.moveDown(0.6);
  // A long name shrinks to stay on one line; past the minimum it wraps, and the flow keeps it clear of the rest.
  doc.font("semibold");
  let size = 28;
  while (
    size > 16 &&
    doc.fontSize(size).widthOfString(cert.recipientName) > width
  )
    size -= 1;
  doc.fillColor("#18181b").text(cert.recipientName, x, doc.y, centered);
  doc.moveDown(0.6);
  doc
    .font("regular")
    .fontSize(14)
    .fillColor("#52525b")
    .text(t("certificate.completed"), x, doc.y, centered);
  doc.moveDown(0.6);
  doc
    .font("semibold")
    .fontSize(20)
    .fillColor("#18181b")
    .text(cert.courseTitle, x + 48, doc.y, {
      width: width - 96,
      align: "center",
    });

  const issued = cert.issuedOn.toLocaleDateString(
    locale === "en" ? "en-GB" : locale,
    {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    },
  );
  doc
    .font("regular")
    .fontSize(11)
    .fillColor("#71717a")
    .text(
      t("certificate.issued", { date: issued, code: formatCode(cert.code) }),
      x,
      doc.page.height - 132,
      centered,
    )
    .text(t("certificate.verify", { url: verifyUrl }), x, doc.y + 4, centered);
  doc.end();
  return done;
}
