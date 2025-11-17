-- Add optional metadata for TSS and cash registers
ALTER TABLE "Tss" ADD COLUMN     "certPath" TEXT;

ALTER TABLE "CashRegister" ADD COLUMN     "location" TEXT;
