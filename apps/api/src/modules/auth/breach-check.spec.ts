import { createHash } from "crypto";
import { isBreached } from "./breach-check";

const sha1 = (v: string) =>
  createHash("sha1").update(v).digest("hex").toUpperCase();
const range = (lines: string[]) => async () =>
  ({ ok: true, text: async () => lines.join("\r\n") }) as Response;

describe("isBreached (Pwned Passwords range API)", () => {
  const password = "correct horse battery staple";
  const hash = sha1(password);

  it("sends only the first five characters of the SHA-1, with padding", async () => {
    const fetchFn = jest.fn(range([]));
    await isBreached(password, fetchFn);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      `https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`,
    );
    expect(url).not.toContain(hash.slice(5));
    expect((init.headers as Record<string, string>)["Add-Padding"]).toBe(
      "true",
    );
  });

  it("is true when the suffix appears with a count, false when only as padding or not at all", async () => {
    expect(await isBreached(password, range([`${hash.slice(5)}:42`]))).toBe(
      true,
    );
    expect(await isBreached(password, range([`${hash.slice(5)}:0`]))).toBe(
      false,
    );
    expect(
      await isBreached(
        password,
        range(["0000000000000000000000000000000000A:3"]),
      ),
    ).toBe(false);
  });

  it("is null (unknown) when the service fails or does not answer in time", async () => {
    expect(
      await isBreached(
        password,
        async () => ({ ok: false, status: 503 }) as Response,
      ),
    ).toBeNull();
    expect(
      await isBreached(password, async () => {
        throw new Error("ENOTFOUND");
      }),
    ).toBeNull();
    const never = (_: unknown, init?: RequestInit) =>
      new Promise<Response>((_, reject) =>
        init?.signal?.addEventListener("abort", () =>
          reject(new Error("aborted")),
        ),
      );
    expect(await isBreached(password, never as typeof fetch, 50)).toBeNull();
  });
});
