import { parseAppUrl, parseSystemUrl } from "./db-roles";

describe("parseAppUrl", () => {
  it("returns the user and the decoded password", () => {
    expect(
      parseAppUrl("postgresql://cluster_app:p%40ss%2Fw@localhost:5432/db"),
    ).toEqual({
      user: "cluster_app",
      password: "p@ss/w",
    });
  });

  it("refuses any other user", () => {
    expect(() => parseAppUrl("postgresql://cluster:x@localhost/db")).toThrow(
      /cluster_app/,
    );
  });

  it("refuses an empty password", () => {
    expect(() => parseAppUrl("postgresql://cluster_app@localhost/db")).toThrow(
      /password/,
    );
  });

  it("refuses a missing or invalid URL without echoing it", () => {
    expect(() => parseAppUrl(undefined)).toThrow(/DATABASE_URL/);
    expect(() => parseAppUrl("not a url")).toThrow(/DATABASE_URL/);
  });
});

describe("parseSystemUrl", () => {
  it("accepts only cluster_system with a password", () => {
    expect(parseSystemUrl("postgresql://cluster_system:s3cr%40t@db/x")).toEqual(
      { user: "cluster_system", password: "s3cr@t" },
    );
    expect(() => parseSystemUrl("postgresql://cluster_app:x@db/x")).toThrow(
      /DATABASE_SYSTEM_URL must use the cluster_system/,
    );
    expect(() => parseSystemUrl("postgresql://cluster_system@db/x")).toThrow(
      /password/,
    );
    expect(() => parseSystemUrl(undefined)).toThrow(/DATABASE_SYSTEM_URL/);
  });
});
