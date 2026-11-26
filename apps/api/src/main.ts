import { config as dotenvConfig } from "dotenv";
import { expand } from "dotenv-expand";
import { resolve } from "path";

const preset = new Set(Object.keys(process.env));
const env = dotenvConfig({ path: resolve(__dirname, "../../../.env") });
// dotenv-expand writes back every key of .env, so an empty value set in the environment (SMTP_HOST= turns mail
// off) would lose to .env: only the keys .env brought are expanded.
for (const key of preset) delete env.parsed?.[key];
expand(env);

import { NestFactory } from "@nestjs/core";
import { Logger, ValidationPipe } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { configureBodyParsers } from "./common/body-parsers";
import { requestDeadline } from "./common/request-deadline";
import { isLessonVideoUpload } from "./modules/grow/course-files.controller";
import { checkStartupConfig } from "./common/startup-config";
import {
  assertRlsSelfCheck,
  assertSystemRoleSelfCheck,
} from "./prisma/rls-self-check";

/** Refuses to start in production with default or weak secrets; only warns in development. */
function assertSafeConfig() {
  const logger = new Logger("Config");
  const { errors, warnings } = checkStartupConfig(process.env);
  warnings.forEach((w) => logger.warn(w));
  if (errors.length === 0) return;
  if (process.env.NODE_ENV === "production") {
    errors.forEach((e) => logger.error(e));
    logger.error("Refusing to start with an unsafe configuration");
    process.exit(1);
  }
  errors.forEach((e) => logger.warn(`${e} (allowed outside production)`));
}

async function bootstrap() {
  assertSafeConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  // Behind a reverse proxy req.ip must be the client's, or per-IP throttling counts the proxy.
  const trustProxy = process.env.TRUST_PROXY;
  if (trustProxy)
    app.set(
      "trust proxy",
      /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy,
    );

  const webOrigin = process.env.WS_CORS_ORIGIN || "http://localhost:3000";
  // Security headers (HSTS, nosniff, referrer policy, a restrictive CSP for API responses).
  // Files keep their own stricter CSP (files.controller). The web app may still load API
  // resources on the same site (<img> from /files with the file cookie) and frame them
  // (file previews): frame-ancestors names its origin, which X-Frame-Options cannot do.
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "same-site" },
      frameguard: false,
      contentSecurityPolicy: {
        directives: { frameAncestors: ["'self'", webOrigin] },
      },
    }),
  );

  app.setGlobalPrefix("api/v1");
  app.use(requestDeadline(5 * 60 * 1000, isLessonVideoUpload));
  configureBodyParsers(app);
  app.enableCors({
    origin: webOrigin,
    // Lets the browser store/send the httpOnly file cookie (see auth.controller).
    credentials: true,
    // The credentials file's count of skipped people and its name, read by the browser (docs/specs/auth/access-without-mail).
    exposedHeaders: ["X-Skipped-Active", "Content-Disposition"],
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  await assertRlsSelfCheck(process.env.DATABASE_URL!);
  await assertSystemRoleSelfCheck(process.env.DATABASE_SYSTEM_URL!);
  const port = process.env.API_PORT || 3001;
  // A 1 GB lesson video on a slow link takes longer than Node's default 5 min to arrive, so the server
  // allows an hour; every other route keeps 5 min through requestDeadline. Headers keep their 60 s.
  app.getHttpServer().requestTimeout = 60 * 60 * 1000;
  await app.listen(port);
  console.log(`Cluster API running on http://localhost:${port}`);
}

bootstrap();
