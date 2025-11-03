import { ReportExportFormat, ReportExportType } from '@prisma/client';

const TYPE_LABELS: Record<ReportExportType, string> = {
  SALES_SUMMARY: 'Umsatzübersicht',
  EMPLOYEE_PERFORMANCE: 'Mitarbeiterleistung',
  CATEGORY_PERFORMANCE: 'Kategorie-Performance',
};

const FORMAT_LABELS: Record<ReportExportFormat, string> = {
  CSV: 'CSV',
  XLSX: 'Excel',
};

export function renderReportExportReadyEmail(options: {
  type: ReportExportType;
  format: ReportExportFormat;
  fileName: string;
  fromDate?: Date | null;
  toDate?: Date | null;
  granularity?: string | null;
  locationId?: string | null;
}) {
  const { type, format, fileName, fromDate, toDate, granularity, locationId } = options;
  const subject = `${TYPE_LABELS[type]} Export ist fertig (${FORMAT_LABELS[format]})`;

  const formatDate = (date?: Date | null) =>
    date ? new Date(date).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }) : '–';

  const html = `
    <div style="font-family: Arial, sans-serif; color: #0f172a;">
      <h2 style="color: #1e293b;">${TYPE_LABELS[type]} Export bereit</h2>
      <p>Deine angeforderte Auswertung wurde erfolgreich erstellt.</p>
      <table style="border-collapse: collapse; margin-top: 12px;">
        <tbody>
          <tr>
            <td style="padding: 4px 12px; font-weight: bold;">Datei:</td>
            <td style="padding: 4px 12px;">${fileName}</td>
          </tr>
          <tr>
            <td style="padding: 4px 12px; font-weight: bold;">Zeitraum:</td>
            <td style="padding: 4px 12px;">${formatDate(fromDate)} – ${formatDate(toDate)}</td>
          </tr>
          <tr>
            <td style="padding: 4px 12px; font-weight: bold;">Granularität:</td>
            <td style="padding: 4px 12px;">${granularity ?? 'Standard'}</td>
          </tr>
          <tr>
            <td style="padding: 4px 12px; font-weight: bold;">Standort:</td>
            <td style="padding: 4px 12px;">${locationId ?? 'Alle'}</td>
          </tr>
        </tbody>
      </table>
      <p style="margin-top: 16px;">Du findest den Download-Link im Reporting-Dashboard von FuchsPOS.</p>
      <p style="margin-top: 24px;">Viele Grüße<br/>dein FuchsPOS Team</p>
    </div>
  `;

  return { subject, html };
}
