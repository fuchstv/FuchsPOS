-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('SUCCESS', 'FAILED', 'PROCESSING');

-- CreateTable
CREATE TABLE "Sale" (
    "id" SERIAL PRIMARY KEY,
    "receiptNo" TEXT NOT NULL,
    "total" NUMERIC(12, 2) NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "status" "SaleStatus" NOT NULL DEFAULT 'SUCCESS',
    "items" JSONB NOT NULL,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Sale_receiptNo_key" ON "Sale"("receiptNo");
