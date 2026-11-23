import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
import { PrismaModule } from "./prisma/prisma.module";
import { JwtAuthGuard } from "./common/jwt-auth.guard";
import { HttpExceptionFilter } from "./common/http-exception.filter";
import { RequestContextInterceptor } from "./common/request-context.interceptor";
import { AccessGuard } from "./common/access.guard";
import { AppThrottlerGuard } from "./common/throttle-tracker";
import { throttlerStorage } from "./common/throttler-storage";
import { ConnectModule } from "./modules/connect/connect.module";
import { DocumentsModule } from "./modules/documents/documents.module";
import { KnowModule } from "./modules/know/know.module";
import { GrowModule } from "./modules/grow/grow.module";
import { LifeModule } from "./modules/life/life.module";
import { AuthModule } from "./modules/auth/auth.module";
import { OrgModule } from "./modules/org/org.module";
import { NotificationModule } from "./modules/notification/notification.module";
import { InstanceModule } from "./modules/instance/instance.module";
import { StorageModule } from "./modules/storage/storage.module";
import { CollabModule } from "./modules/collab/collab.module";
import { HealthController } from "./health.controller";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: "../../.env",
      // Expanded apart from process.env: dotenv-expand would otherwise overwrite an empty value already set in the
      // environment (SMTP_HOST= turns mail off) with the one in .env. The environment still wins, as in main.ts.
      expandVariables: { processEnv: {} },
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          { name: "default", limit: 1200, ttl: 60000 },
          { name: "auth", limit: 1200, ttl: 60000 },
        ],
        storage: throttlerStorage(config),
      }),
    }),
    PrismaModule,
    StorageModule,
    CollabModule,
    AuthModule,
    OrgModule,
    ConnectModule,
    DocumentsModule,
    KnowModule,
    GrowModule,
    LifeModule,
    NotificationModule,
    InstanceModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: APP_GUARD, useClass: AccessGuard },
    { provide: APP_INTERCEPTOR, useClass: RequestContextInterceptor },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
