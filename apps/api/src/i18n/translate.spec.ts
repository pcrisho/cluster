import { en } from "./en";
import { es } from "./es";
import { translate } from "./translate";

const placeholders = (text: string) =>
  [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

function leaves(tree: object, prefix = ""): [string, string][] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === "string"
      ? [[`${prefix}${key}`, value] as [string, string]]
      : leaves(value, `${prefix}${key}.`),
  );
}

describe("translate", () => {
  it("fills placeholders in the asked language", () => {
    expect(
      translate("es", "certificate.issued", {
        date: "29 de octubre de 2026",
        code: "ABCD",
      }),
    ).toBe("Emitido el 29 de octubre de 2026 · Certificado ABCD");
    expect(translate("en", "report.states.OVERDUE")).toBe("Overdue");
  });

  it("escapes values in HTML templates only", () => {
    const html = translate(
      "en",
      "email.invite.html",
      { name: "<b>Ana</b>", organization: "A & B", link: "x" },
      { html: true },
    );
    expect(html).toContain("Hi &lt;b&gt;Ana&lt;/b&gt;,");
    expect(html).toContain("<strong>A &amp; B</strong>");
    expect(
      translate("en", "email.invite.text", {
        name: "<b>Ana</b>",
        organization: "A",
        link: "x",
      }),
    ).toContain("Hi <b>Ana</b>,");
  });

  it("every language keeps the placeholders of English", () => {
    const source = new Map(leaves(en));
    for (const [key, text] of leaves(es))
      expect([key, placeholders(text)]).toEqual([
        key,
        placeholders(source.get(key)!),
      ]);
  });
});
