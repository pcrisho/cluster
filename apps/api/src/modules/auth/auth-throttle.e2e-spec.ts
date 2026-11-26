import { INestApplication } from "@nestjs/common";
import { hashPassword } from "./password-hash";
import request from "supertest";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import {
  createActor,
  createTestApp,
  setCookie,
  WEB_ORIGIN,
} from "../../test-helpers";

/**
 * Rate limits must stop abuse of one account or one session without locking out a company whose
 * people all reach the instance from the same public address (every request here comes from one IP).
 */
describe("auth rate limits behind one address e2e", () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  const password = "Throttle1234";
  const emails: string[] = [];

  const login = (email: string, pass = password) =>
    http
      .post("/api/v1/auth/login")
      .set("Origin", WEB_ORIGIN)
      .send({ email, password: pass });
  const refresh = (refreshToken: string) =>
    http
      .post("/api/v1/auth/refresh")
      .set("Origin", WEB_ORIGIN)
      .set("Cookie", `cluster_session=${refreshToken}`);
  const sessionCookie = (res: request.Response) =>
    setCookie(res, "cluster_session")!;

  beforeAll(async () => {
    app = await createTestApp();
    http = request(app.getHttpServer());
    const prisma = app.get(SystemPrismaService);
    const passwordHash = await hashPassword(password, 4);
    const first = await createActor(app, "th-0");
    for (let i = 0; i < 7; i++) {
      const actor =
        i === 0
          ? first
          : await createActor(app, `th-${i}`, "COLLABORATOR", first.orgId);
      const user = await prisma.user.update({
        where: { id: actor.id },
        data: { passwordHash },
        select: { email: true },
      });
      emails.push(user.email);
    }
  });

  afterAll(async () => app?.close());

  it("lets several people sign in and keep their sessions from the same address", async () => {
    const sessions: string[] = [];
    for (const email of emails.slice(0, 6)) {
      const res = await login(email).expect(200);
      sessions.push(sessionCookie(res));
    }
    // Twelve refreshes in a minute from one address, two per person.
    for (let round = 0; round < 2; round++) {
      for (let i = 0; i < sessions.length; i++) {
        const res = await refresh(sessions[i]).expect(200);
        sessions[i] = sessionCookie(res);
      }
    }
  });

  it("still limits repeated sign-in attempts against one account", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++)
      statuses.push((await login(emails[6], "Wrong1234")).status);
    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses[5]).toBe(429);
  });

  it("lets one session refresh 30 times a minute (many tabs) and limits the next", async () => {
    let token = sessionCookie(await login(emails[0]).expect(200));
    let allowed = 0;
    let status = 200;
    for (let i = 0; i < 40 && status === 200; i++) {
      const res = await refresh(token);
      status = res.status;
      if (status === 200) {
        allowed++;
        token = sessionCookie(res);
      }
    }
    expect(allowed).toBe(30);
    expect(status).toBe(429);
  });
});
