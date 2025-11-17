-- CreateEnum
CREATE TYPE "TenantModuleKey" AS ENUM (
  'OPS_ORDERS',
  'OPS_DELIVERY_SLOTS',
  'OPS_KITCHEN_TASKS',
  'OPS_DISPATCH_ASSIGNMENTS'
);

-- CreateTable
CREATE TABLE "TenantModule" (
  "id" SERIAL PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "module" "TenantModuleKey" NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TenantModule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantModule_tenantId_module_key" ON "TenantModule"("tenantId", "module");
