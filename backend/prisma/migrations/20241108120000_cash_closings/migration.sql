-- Create enum for cash closings
CREATE TYPE "CashClosingType" AS ENUM ('X', 'Z');

-- Create table to persist closing results
CREATE TABLE "CashClosing" (
  "id" SERIAL PRIMARY KEY,
  "type" "CashClosingType" NOT NULL,
  "fromDate" TIMESTAMP(3) NOT NULL,
  "toDate" TIMESTAMP(3) NOT NULL,
  "summary" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes to speed up history queries
CREATE INDEX "CashClosing_type_idx" ON "CashClosing"("type");
CREATE INDEX "CashClosing_createdAt_idx" ON "CashClosing"("createdAt");
