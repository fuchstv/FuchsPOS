-- Add optional EAN column per tenant and enforce uniqueness
ALTER TABLE "Product" ADD COLUMN "ean" TEXT;

CREATE UNIQUE INDEX "Product_tenantId_ean_key" ON "Product"("tenantId", "ean");
