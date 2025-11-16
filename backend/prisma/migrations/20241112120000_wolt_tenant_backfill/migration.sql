-- Backfill tenant information for existing Wolt entities and related preorders.
-- 1. Try to copy tenant assignments from linked entities.
UPDATE "WoltOrder" wo
SET "tenantId" = p."tenantId"
FROM "Preorder" p
WHERE wo."tenantId" IS NULL AND p."woltOrderId" = wo."id" AND p."tenantId" IS NOT NULL;

UPDATE "Preorder" p
SET "tenantId" = wo."tenantId"
FROM "WoltOrder" wo
WHERE p."tenantId" IS NULL AND p."woltOrderId" = wo."id" AND wo."tenantId" IS NOT NULL;

-- 2. Fallback to the default tenant if still missing.
WITH default_tenant AS (
  SELECT id FROM "Tenant" WHERE "isDefault" = true LIMIT 1
)
UPDATE "WoltProduct"
SET "tenantId" = (SELECT id FROM default_tenant)
WHERE "tenantId" IS NULL AND (SELECT id FROM default_tenant) IS NOT NULL;

WITH default_tenant AS (
  SELECT id FROM "Tenant" WHERE "isDefault" = true LIMIT 1
)
UPDATE "WoltOrder"
SET "tenantId" = (SELECT id FROM default_tenant)
WHERE "tenantId" IS NULL AND (SELECT id FROM default_tenant) IS NOT NULL;

WITH default_tenant AS (
  SELECT id FROM "Tenant" WHERE "isDefault" = true LIMIT 1
)
UPDATE "Preorder"
SET "tenantId" = (SELECT id FROM default_tenant)
WHERE "tenantId" IS NULL AND (SELECT id FROM default_tenant) IS NOT NULL;
