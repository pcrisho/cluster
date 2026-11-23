import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { CollabConfig } from "./collab.config";
import { CollabSecretGuard } from "./collab-secret.guard";

const SECRET = "a".repeat(64);

function contextWith(headers: Record<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

function guardWith(secret: string | undefined): CollabSecretGuard {
  return new CollabSecretGuard({ secret } as CollabConfig);
}

describe("CollabSecretGuard", () => {
  it("rejects a request without the header", () => {
    expect(() => guardWith(SECRET).canActivate(contextWith({}))).toThrow(
      UnauthorizedException,
    );
  });

  it("rejects a wrong secret", () => {
    const wrong = "b".repeat(64);
    expect(() =>
      guardWith(SECRET).canActivate(contextWith({ "x-collab-secret": wrong })),
    ).toThrow(UnauthorizedException);
  });

  it("rejects a secret of a different length without throwing anything else", () => {
    expect(() =>
      guardWith(SECRET).canActivate(
        contextWith({ "x-collab-secret": "short" }),
      ),
    ).toThrow(UnauthorizedException);
  });

  it("accepts the correct secret", () => {
    expect(
      guardWith(SECRET).canActivate(contextWith({ "x-collab-secret": SECRET })),
    ).toBe(true);
  });

  it("fails closed when no secret is configured, even with a header", () => {
    expect(() => guardWith(undefined).canActivate(contextWith({}))).toThrow(
      UnauthorizedException,
    );
    expect(() =>
      guardWith(undefined).canActivate(contextWith({ "x-collab-secret": "" })),
    ).toThrow(UnauthorizedException);
  });
});
