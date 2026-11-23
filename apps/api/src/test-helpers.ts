import { INestApplication, ValidationPipe } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import { Test } from "@nestjs/testing";
import type { UserRole } from "@prisma/client";
import { AppModule } from "./app.module";
import { configureBodyParsers } from "./common/body-parsers";
import { SystemPrismaService } from "./prisma/system-prisma.service";
import { AuthTokens } from "./modules/auth/auth-tokens";
import { SessionService } from "./modules/auth/session.service";

/**
 * An access token of a new live session for an existing user (the session has the person's limits).
 * Tokens that must fail on purpose (expired, other audience, no session) are signed with AuthTokens.
 */
export async function signToken(
  app: INestApplication,
  userId: string,
): Promise<string> {
  const { session } = await app
    .get(SessionService)
    .create({ userId, superAdmin: false });
  return app
    .get(AuthTokens)
    .sign("access", { sub: userId, sid: session.id }, 15 * 60);
}

/** The web app's origin: the session routes refuse a request from any other (CSRF). */
export const WEB_ORIGIN = new URL(
  process.env.WEB_URL ?? "http://localhost:3000",
).origin;

/** The value a response sets for a cookie, or undefined. */
export function setCookie(
  res: { headers: Record<string, unknown> },
  name: string,
): string | undefined {
  const header = ([] as string[]).concat(
    (res.headers["set-cookie"] as string[] | undefined) ?? [],
  );
  const pair = header.find((c) => c.startsWith(`${name}=`))?.split(";")[0];
  return pair === undefined
    ? undefined
    : decodeURIComponent(pair.slice(name.length + 1));
}

/** The real AppModule wired like main.ts, with throttling effectively off. */
export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ThrottlerModule.forRoot([{ name: "default", limit: 10000, ttl: 60000 }]),
      AppModule,
    ],
  }).compile();
  const app = moduleRef.createNestApplication({ bodyParser: false });
  app.setGlobalPrefix("api/v1");
  configureBodyParsers(app);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  return app;
}

export interface TestActor {
  id: string;
  orgId: string;
  token: string;
  auth: { Authorization: string };
}

/**
 * Creates a user (and, without `orgId`, a fresh organization) and returns it with a
 * ready-to-use bearer header. E2E databases are truncated on every run, so there is no cleanup.
 */
export async function createActor(
  app: INestApplication,
  name: string,
  role: UserRole = "COLLABORATOR",
  orgId?: string,
): Promise<TestActor> {
  const prisma = app.get(SystemPrismaService);
  const slug = `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const organizationId =
    orgId ??
    (await prisma.organization.create({ data: { name: slug, slug } })).id;
  const user = await prisma.user.create({
    data: {
      email: `${slug}@x.com`,
      passwordHash: "x",
      firstName: name,
      lastName: "Test",
      role,
      organizationId,
    },
  });
  const token = await signToken(app, user.id);
  return {
    id: user.id,
    orgId: organizationId,
    token,
    auth: { Authorization: `Bearer ${token}` },
  };
}
