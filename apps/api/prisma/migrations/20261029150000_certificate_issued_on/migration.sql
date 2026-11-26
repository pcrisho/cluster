-- The calendar date of issue in the organization's zone, kept as issued.
ALTER TABLE "certificates" ADD COLUMN "issuedOn" DATE;

UPDATE "certificates" c
SET "issuedOn" = ((c."issuedAt" AT TIME ZONE 'UTC') AT TIME ZONE o."timezone")::date
FROM "Organization" o
WHERE o."id" = c."organizationId";

ALTER TABLE "certificates" ALTER COLUMN "issuedOn" SET NOT NULL;
