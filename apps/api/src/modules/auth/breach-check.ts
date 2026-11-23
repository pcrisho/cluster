import { createHash } from "crypto";

/**
 * Whether a password appears in Have I Been Pwned, by k-anonymity: only the first five characters of its
 * SHA-1 leave the server, and padding hides how many suffixes came back (docs/specs/auth/hardening R-24).
 * null when the service cannot answer in time: the caller decides (the policy accepts and logs).
 */
export async function isBreached(
  password: string,
  fetchFn: typeof fetch = fetch,
  timeoutMs = 2000,
): Promise<boolean | null> {
  const hash = createHash("sha1")
    .update(password, "utf8")
    .digest("hex")
    .toUpperCase();
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);
  try {
    const res = await fetchFn(
      `https://api.pwnedpasswords.com/range/${prefix}`,
      {
        headers: { "Add-Padding": "true" },
        signal: AbortSignal.timeout(timeoutMs),
      },
    );
    if (!res.ok) return null;
    return (await res.text()).split(/\r?\n/).some((line) => {
      const [candidate, count] = line.split(":");
      return candidate === suffix && Number(count) > 0;
    });
  } catch {
    return null;
  }
}
