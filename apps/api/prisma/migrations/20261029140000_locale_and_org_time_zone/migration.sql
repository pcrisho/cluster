-- Languages: the instance default and each person's choice (null = instance default).
ALTER TABLE "instance_settings" ADD COLUMN "defaultLocale" TEXT NOT NULL DEFAULT 'en';
ALTER TABLE "User" ADD COLUMN "locale" TEXT;

-- One time zone per organization: the per-person zone goes away.
ALTER TABLE "User" DROP COLUMN "timezone";
