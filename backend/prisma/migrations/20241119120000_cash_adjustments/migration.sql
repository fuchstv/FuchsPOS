-- AlterEnum
ALTER TYPE "CashEventType" ADD VALUE 'CASH_DEPOSIT';
ALTER TYPE "CashEventType" ADD VALUE 'CASH_WITHDRAWAL';

-- AlterTable
ALTER TABLE "CashEvent"
  ADD COLUMN "tenantId" TEXT;

-- CreateIndex
CREATE INDEX "CashEvent_tenantId_idx" ON "CashEvent"("tenantId");
