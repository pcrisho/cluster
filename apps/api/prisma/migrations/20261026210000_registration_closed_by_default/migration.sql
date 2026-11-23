-- New installations start with public sign-up closed; the superadmin opens it if wanted.
-- Only the column default changes: an existing instance keeps the value it already has.
ALTER TABLE "instance_settings" ALTER COLUMN "registrationOpen" SET DEFAULT false;
