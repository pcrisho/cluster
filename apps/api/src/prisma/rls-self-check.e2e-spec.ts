import { Client } from "pg";
import {
  assertRlsSelfCheck,
  assertSystemRoleSelfCheck,
} from "./rls-self-check";

const ownerUrl = process.env.DATABASE_OWNER_URL!;
const suffix = Date.now().toString(36);
const bypassRole = `rls_check_bypass_${suffix}`;
const memberRole = `rls_check_member_${suffix}`;
const looseTable = `rls_check_loose_${suffix}`;
const password = "throwaway";

const urlFor = (user: string) => {
  const url = new URL(ownerUrl);
  url.username = user;
  url.password = password;
  return url.toString();
};

describe("startup self-check of the database role", () => {
  let owner: Client;

  beforeAll(async () => {
    owner = new Client({ connectionString: ownerUrl });
    await owner.connect();
    const ownerRole = decodeURIComponent(new URL(ownerUrl).username);
    await owner.query(
      `CREATE ROLE "${bypassRole}" LOGIN BYPASSRLS PASSWORD '${password}'`,
    );
    await owner.query(
      `CREATE ROLE "${memberRole}" LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '${password}'`,
    );
    await owner.query(`GRANT "${ownerRole}" TO "${memberRole}"`);
  });

  afterAll(async () => {
    if (!owner) return;
    // Each step on its own so one failure does not leave the rest behind.
    for (const sql of [
      `DROP TABLE IF EXISTS "${looseTable}"`,
      `DROP ROLE IF EXISTS "${bypassRole}"`,
      `DROP ROLE IF EXISTS "${memberRole}"`,
    ])
      await owner.query(sql).catch(() => undefined);
    await owner.end();
  });

  it("passes for the app role", async () => {
    await expect(
      assertRlsSelfCheck(process.env.DATABASE_URL!),
    ).resolves.toBeUndefined();
  });

  it("refuses the owner, a superuser", async () => {
    await expect(assertRlsSelfCheck(ownerUrl)).rejects.toThrow(
      /superuser or has BYPASSRLS/,
    );
  });

  it("refuses a role with BYPASSRLS", async () => {
    await expect(assertRlsSelfCheck(urlFor(bypassRole))).rejects.toThrow(
      /superuser or has BYPASSRLS/,
    );
  });

  it("refuses a member of the owner role", async () => {
    await expect(assertRlsSelfCheck(urlFor(memberRole))).rejects.toThrow(
      /member of its owner/,
    );
  });

  it("refuses a tenant table with row-level security off", async () => {
    await owner.query(
      `CREATE TABLE "${looseTable}" ("organizationId" text NOT NULL)`,
    );
    try {
      await expect(
        assertRlsSelfCheck(process.env.DATABASE_URL!),
      ).rejects.toThrow(
        new RegExp(`"${looseTable}" has row-level security off`),
      );
    } finally {
      await owner.query(`DROP TABLE "${looseTable}"`);
    }
  });

  it("passes the system role, and refuses the owner, the app role and a member of the owner", async () => {
    await expect(
      assertSystemRoleSelfCheck(process.env.DATABASE_SYSTEM_URL!),
    ).resolves.toBeUndefined();
    await expect(assertSystemRoleSelfCheck(ownerUrl)).rejects.toThrow(
      /is a superuser/,
    );
    await expect(
      assertSystemRoleSelfCheck(process.env.DATABASE_URL!),
    ).rejects.toThrow(/lacks BYPASSRLS/);
    await expect(assertSystemRoleSelfCheck(urlFor(memberRole))).rejects.toThrow(
      /member of the owner/,
    );
  });
});
