import { Pool, type PoolClient } from "pg";
import { withOrg } from "../common/request-context";
import { TenantContextMissing, TenantPool } from "./tenant-pool";

type TestClient = PoolClient & { orgId?: string };

describe("TenantPool", () => {
  let clients: TestClient[];
  let pool: TenantPool;

  const newClient = (): TestClient =>
    ({
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    }) as unknown as TestClient;

  beforeEach(() => {
    clients = [newClient()];
    // The real super.connect() would open a socket; hand out the fake client instead.
    jest
      .spyOn(Pool.prototype, "connect")
      .mockImplementation((async () => clients[0]) as never);
    pool = new TenantPool({ connectionString: "postgresql://x@localhost/x" });
  });
  afterEach(() => jest.restoreAllMocks());

  const setConfigCalls = () =>
    (clients[0].query as jest.Mock).mock.calls.filter(([sql]) =>
      String(sql).includes("set_config"),
    );

  it("throws without an organization and never checks out a connection", async () => {
    await expect(pool.connect()).rejects.toBeInstanceOf(TenantContextMissing);
    expect(Pool.prototype.connect).not.toHaveBeenCalled();
  });

  it("puts the first 200 characters of the SQL in the query() error", async () => {
    const sql = "SELECT " + "x".repeat(500);
    await expect(pool.query(sql)).rejects.toThrow(sql.slice(0, 200));
    await expect(pool.query(sql)).rejects.not.toThrow(sql.slice(0, 201));
  });

  it("sets the organization once while the connection keeps serving it", async () => {
    await withOrg("org-a", async () => {
      (await pool.connect()).release();
      (await pool.connect()).release();
    });
    expect(setConfigCalls()).toEqual([
      ["SELECT set_config('app.org_id', $1, false)", ["org-a"]],
    ]);
  });

  it("sets it again when the connection is handed to another organization", async () => {
    await withOrg("org-a", async () => (await pool.connect()).release());
    await withOrg("org-b", async () => (await pool.connect()).release());
    expect(setConfigCalls().map(([, v]) => v)).toEqual([["org-a"], ["org-b"]]);
  });

  it("query() releases the connection even when the query fails", async () => {
    await withOrg("org-a", async () => {
      (clients[0].query as jest.Mock)
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error("boom"));
      await expect(pool.query("SELECT 1")).rejects.toThrow("boom");
    });
    expect(clients[0].release).toHaveBeenCalledWith();
  });

  it("destroys the connection and rethrows when set_config fails", async () => {
    const failure = new Error("connection reset");
    (clients[0].query as jest.Mock).mockRejectedValue(failure);
    await withOrg("org-a", async () => {
      await expect(pool.connect()).rejects.toBe(failure);
    });
    expect(clients[0].release).toHaveBeenCalledWith(failure);
    expect(clients[0].orgId).toBeUndefined();
  });

  it("does not support the callback form", async () => {
    await withOrg("org-a", async () => {
      await expect(pool.connect((() => {}) as never)).rejects.toThrow(
        "callback",
      );
    });
  });
});
