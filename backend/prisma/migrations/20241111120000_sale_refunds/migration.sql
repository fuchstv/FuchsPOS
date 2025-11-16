-- Extend sale statuses to cover refund workflows
ALTER TYPE "SaleStatus" ADD VALUE IF NOT EXISTS 'REFUND';
ALTER TYPE "SaleStatus" ADD VALUE IF NOT EXISTS 'REFUNDED';

-- Track relationships between original sales and refunds
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "refundForId" INTEGER;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "refundReason" TEXT;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "operatorId" TEXT;

ALTER TABLE "Sale"
  ADD CONSTRAINT "Sale_refundForId_fkey"
  FOREIGN KEY ("refundForId")
  REFERENCES "Sale"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "Sale_refundForId_idx" ON "Sale"("refundForId");
