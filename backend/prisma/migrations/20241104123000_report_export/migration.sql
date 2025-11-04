-- Create enums for report exports
CREATE TYPE "ReportExportType" AS ENUM ('SALES_SUMMARY', 'EMPLOYEE_PERFORMANCE', 'CATEGORY_PERFORMANCE');

CREATE TYPE "ReportExportFormat" AS ENUM ('CSV', 'XLSX');

CREATE TYPE "ReportExportStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');

-- Create table for report exports
CREATE TABLE "ReportExport" (
  "id" SERIAL PRIMARY KEY,
  "type" "ReportExportType" NOT NULL,
  "format" "ReportExportFormat" NOT NULL,
  "status" "ReportExportStatus" NOT NULL DEFAULT 'PENDING',
  "fingerprint" TEXT NOT NULL,
  "filters" JSONB,
  "fromDate" TIMESTAMP(3),
  "toDate" TIMESTAMP(3),
  "granularity" TEXT,
  "locationId" TEXT,
  "notificationEmail" TEXT,
  "fileName" TEXT,
  "mimeType" TEXT,
  "fileData" BYTEA,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3)
);

-- Enforce uniqueness on fingerprints to deduplicate queued exports
CREATE UNIQUE INDEX "ReportExport_fingerprint_key" ON "ReportExport"("fingerprint");

-- Support efficient polling by status and creation time
CREATE INDEX "ReportExport_status_idx" ON "ReportExport"("status");
CREATE INDEX "ReportExport_type_idx" ON "ReportExport"("type");
CREATE INDEX "ReportExport_createdAt_idx" ON "ReportExport"("createdAt");
