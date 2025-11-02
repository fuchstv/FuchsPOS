-- Create fiscal management tables
CREATE TABLE "Tenant" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "fiskalyApiKey" TEXT NOT NULL,
  "fiskalyApiSecret" TEXT NOT NULL,
  "fiskalyClientId" TEXT NOT NULL,
  "isDefault" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Tss" (
  "id" TEXT PRIMARY KEY,
  "serialNumber" TEXT,
  "description" TEXT,
  "state" TEXT,
  "tenantId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Tss_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "CashRegister" (
  "id" TEXT PRIMARY KEY,
  "label" TEXT,
  "tenantId" TEXT NOT NULL,
  "tssId" TEXT NOT NULL,
  "isDefault" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CashRegister_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CashRegister_tssId_fkey" FOREIGN KEY ("tssId") REFERENCES "Tss"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Extend sales with fiscal metadata
ALTER TABLE "Sale"
ADD COLUMN "fiscalMetadata" JSONB;
