import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "crypto";
import {
  AuthTokens,
  keyId,
  newRefreshToken,
  parseRefreshToken,
  sha256,
} from "./auth-tokens";

const CURRENT = "c".repeat(40);
const PREVIOUS = "p".repeat(40);
const jwt = new JwtService();
const tokens = (env: Record<string, string>) =>
  new AuthTokens(jwt, new ConfigService(env));
const claims = { sub: randomUUID(), sid: randomUUID() };

describe("AuthTokens", () => {
  const t = tokens({ JWT_SECRET: CURRENT });

  it("round-trips the claims for the audience it was signed for", () => {
    const token = t.sign("access", claims, 60);
    expect(t.verify(token, ["access"])).toMatchObject({
      ...claims,
      aud: "access",
    });
    expect(jwt.decode(token, { complete: true }).header.kid).toBe(
      keyId(CURRENT),
    );
  });

  it("rejects a token of another audience", () => {
    const file = t.sign("file", claims, 60);
    expect(t.verify(file, ["access"])).toBeNull();
    expect(t.verify(file, ["access", "file"])).toMatchObject({ aud: "file" });
  });

  it("rejects an expired token, a forged one and one with no session", () => {
    expect(t.verify(t.sign("access", claims, -1), ["access"])).toBeNull();
    const forged = jwt.sign(
      { ...claims },
      { secret: "x".repeat(40), keyid: keyId(CURRENT), audience: "access" },
    );
    expect(t.verify(forged, ["access"])).toBeNull();
    const noSid = jwt.sign(
      { sub: claims.sub },
      {
        secret: CURRENT,
        keyid: keyId(CURRENT),
        audience: "access",
        expiresIn: 60,
      },
    );
    expect(t.verify(noSid, ["access"])).toBeNull();
  });

  it("keeps verifying tokens of the previous secret during a rotation, and only those", () => {
    const old = tokens({ JWT_SECRET: PREVIOUS }).sign("access", claims, 60);
    expect(t.verify(old, ["access"])).toBeNull();
    expect(
      tokens({ JWT_SECRET: CURRENT, JWT_SECRET_PREVIOUS: PREVIOUS }).verify(
        old,
        ["access"],
      ),
    ).toMatchObject(claims);
  });

  it("rejects an unknown kid and a token without one", () => {
    const unknown = jwt.sign(
      { ...claims },
      { secret: CURRENT, keyid: "deadbeef", audience: "access", expiresIn: 60 },
    );
    expect(t.verify(unknown, ["access"])).toBeNull();
    const none = jwt.sign(
      { ...claims },
      { secret: CURRENT, audience: "access", expiresIn: 60 },
    );
    expect(t.verify(none, ["access"])).toBeNull();
  });

  it("refuses the none algorithm", () => {
    const header = Buffer.from(
      JSON.stringify({ alg: "none", kid: keyId(CURRENT) }),
    ).toString("base64url");
    const body = Buffer.from(
      JSON.stringify({ ...claims, aud: "access", exp: 9999999999 }),
    ).toString("base64url");
    expect(t.verify(`${header}.${body}.`, ["access"])).toBeNull();
  });
});

describe("refresh tokens", () => {
  it("are <sid>.<secret> and parse back to the sid and the stored hash", () => {
    const sid = randomUUID();
    const { token, hash } = newRefreshToken(sid);
    expect(token.startsWith(`${sid}.`)).toBe(true);
    expect(parseRefreshToken(token)).toEqual({ sid, hash });
    expect(hash).toBe(sha256(token.slice(sid.length + 1)));
  });

  it("reject anything malformed", () => {
    const { token } = newRefreshToken(randomUUID());
    for (const bad of [
      undefined,
      42,
      "",
      "x",
      token.replace(".", ""),
      `not-a-uuid.${token.split(".")[1]}`,
      `${token}x`,
    ])
      expect(parseRefreshToken(bad)).toBeNull();
  });
});
