import type { SalePayload } from '../../pos/types/sale-payload';

const currency = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
});

const DEFAULT_TAX_RATE = 0.07;

export type ReceiptTemplateOptions = {
  businessName?: string;
  supportEmail?: string;
  taxRate?: number;
};

export type ReceiptViewModel = {
  sale: SalePayload;
  businessName: string;
  supportEmail: string;
  taxRate: number;
  net: number;
  tax: number;
  gross: number;
  createdAtFormatted: string;
};

export function formatCurrency(amount: number) {
  return currency.format(amount);
}

export function createReceiptViewModel(
  sale: SalePayload,
  options?: ReceiptTemplateOptions,
): ReceiptViewModel {
  const businessName = options?.businessName ?? 'FuchsPOS';
  const supportEmail = options?.supportEmail ?? 'support@fuchspos.local';
  const taxRate = options?.taxRate ?? DEFAULT_TAX_RATE;
  const net = sale.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const tax = Number((net * taxRate).toFixed(2));
  const gross = Number((net + tax).toFixed(2));

  return {
    sale,
    businessName,
    supportEmail,
    taxRate,
    net,
    tax,
    gross,
    createdAtFormatted: sale.createdAt.toLocaleString('de-DE'),
  };
}

export function renderReceiptHtml(viewModel: ReceiptViewModel) {
  const rows = viewModel.sale.items
    .map(
      item => `
        <tr>
          <td style="padding:4px 0;">${item.quantity}× ${item.name}</td>
          <td style="padding:4px 0;text-align:right;">${formatCurrency(item.unitPrice * item.quantity)}</td>
        </tr>
      `,
    )
    .join('');

  return `<!doctype html>
  <html lang="de">
    <head>
      <meta charset="utf-8" />
      <title>${viewModel.businessName} – Ihr digitaler Beleg ${viewModel.sale.receiptNo}</title>
      <style>
        body { font-family: 'Inter', 'Segoe UI', sans-serif; background: #0f172a; color: #e2e8f0; padding: 32px; }
        .card { max-width: 520px; margin: 0 auto; background: rgba(15,23,42,0.95); border-radius: 16px; padding: 32px; border: 1px solid rgba(148,163,184,0.2); }
        h1 { font-size: 20px; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        footer { margin-top: 24px; font-size: 12px; color: rgba(148,163,184,0.8); }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>${viewModel.businessName}</h1>
        <p>Vielen Dank für Ihren Einkauf. Nachfolgend finden Sie die Details Ihres digitalen Bons.</p>
        <p><strong>Belegnummer:</strong> ${viewModel.sale.receiptNo}</p>
        <p><strong>Zahlungsart:</strong> ${viewModel.sale.paymentMethod}</p>
        ${
          viewModel.sale.table
            ? `<p><strong>Tisch:</strong> ${viewModel.sale.table.label ?? viewModel.sale.table.tableId ?? 'ohne Zuordnung'}${
                viewModel.sale.table.areaLabel ? ` · Bereich ${viewModel.sale.table.areaLabel}` : ''
              }</p>`
            : ''
        }
        ${
          viewModel.sale.table?.waiterId || viewModel.sale.waiterId
            ? `<p><strong>Service:</strong> ${viewModel.sale.table?.waiterId ?? viewModel.sale.waiterId}</p>`
            : ''
        }
        <table>
          <tbody>
            ${rows}
            <tr>
              <td style="padding-top:12px;">Zwischensumme</td>
              <td style="padding-top:12px;text-align:right;">${formatCurrency(viewModel.net)}</td>
            </tr>
            <tr>
              <td>MwSt (${(viewModel.taxRate * 100).toFixed(0)}%)</td>
              <td style="text-align:right;">${formatCurrency(viewModel.tax)}</td>
            </tr>
            <tr>
              <td style="padding-top:8px;font-weight:600;">Gesamt</td>
              <td style="padding-top:8px;text-align:right;font-weight:600;">${formatCurrency(viewModel.gross)}</td>
            </tr>
            ${
              typeof viewModel.sale.amountTendered === 'number'
                ? `<tr>
              <td>Erhalten</td>
              <td style="text-align:right;">${formatCurrency(viewModel.sale.amountTendered)}</td>
            </tr>`
                : ''
            }
            ${
              typeof viewModel.sale.changeDue === 'number'
                ? `<tr>
              <td>Rückgeld</td>
              <td style="text-align:right;">${formatCurrency(viewModel.sale.changeDue)}</td>
            </tr>`
                : ''
            }
          </tbody>
        </table>
        ${
          viewModel.sale.courses?.length
            ? `
        <div style="margin-top:24px;padding:16px;border-radius:12px;background:rgba(30,64,175,0.15);border:1px solid rgba(59,130,246,0.3);">
          <h2 style="font-size:14px;margin:0 0 8px 0;letter-spacing:0.08em;text-transform:uppercase;color:#60a5fa;">Kursfolge</h2>
          ${viewModel.sale.courses
            .map(course => {
              const items = course.items
                .map(item => `<li>${item.quantity}× ${item.name}</li>`)
                .join('');
              return `
            <div style="margin-bottom:12px;">
              <strong>${course.name}</strong>
              <span style="font-size:12px;color:#bfdbfe;"> – ${course.status}</span>
              ${course.servedAt ? `<span style="font-size:12px;color:#93c5fd;"> · serviert ${new Date(course.servedAt).toLocaleTimeString('de-DE')}</span>` : ''}
              <ul style="margin:6px 0 0 16px;padding:0;">${items}</ul>
            </div>`;
            })
            .join('')}
        </div>
        `
            : ''
        }
        ${
          viewModel.sale.fiscalization
            ? `
        <div style="margin-top:24px;padding:16px;border-radius:12px;background:rgba(30,41,59,0.6);border:1px solid rgba(148,163,184,0.2);">
          <h2 style="font-size:14px;margin:0 0 8px 0;letter-spacing:0.08em;text-transform:uppercase;color:#38bdf8;">TSS-Daten</h2>
          <p style="margin:4px 0;">Mandant: <strong>${viewModel.sale.fiscalization.tenantId}</strong></p>
          <p style="margin:4px 0;">TSS-ID: <strong>${viewModel.sale.fiscalization.tssId}</strong></p>
          <p style="margin:4px 0;">Kasse: <strong>${viewModel.sale.fiscalization.cashRegisterId}</strong></p>
          <p style="margin:4px 0;">Transaktion: <strong>${viewModel.sale.fiscalization.transactionId}</strong></p>
          ${
            viewModel.sale.fiscalization.signature?.value
              ? `<p style="margin:4px 0;">Signatur: <code style="font-size:12px;">${viewModel.sale.fiscalization.signature.value}</code></p>`
              : ''
          }
          ${
            viewModel.sale.fiscalization.signature?.timestamp
              ? `<p style="margin:4px 0;">Signiert am ${new Date(viewModel.sale.fiscalization.signature.timestamp).toLocaleString('de-DE')}</p>`
              : ''
          }
        </div>
        `
            : ''
        }
        <footer>
          <p>Erstellt am ${viewModel.createdAtFormatted}.</p>
          <p>Bei Fragen erreichen Sie uns unter <a href="mailto:${viewModel.supportEmail}" style="color:#38bdf8;">${viewModel.supportEmail}</a>.</p>
        </footer>
      </div>
    </body>
  </html>`;
}

export function renderReceiptPdf(viewModel: ReceiptViewModel) {
  const lines: string[] = [];
  lines.push(`Belegnummer: ${viewModel.sale.receiptNo}`);
  lines.push(`Zahlungsart: ${viewModel.sale.paymentMethod}`);
  lines.push(`Erstellt am: ${viewModel.createdAtFormatted}`);
  if (viewModel.sale.table) {
    lines.push(`Tisch: ${viewModel.sale.table.label ?? viewModel.sale.table.tableId ?? '—'}`);
    if (viewModel.sale.table.areaLabel) {
      lines.push(`Bereich: ${viewModel.sale.table.areaLabel}`);
    }
  }
  if (viewModel.sale.table?.waiterId || viewModel.sale.waiterId) {
    lines.push(`Service: ${viewModel.sale.table?.waiterId ?? viewModel.sale.waiterId}`);
  }
  lines.push('');
  lines.push('Positionen:');
  viewModel.sale.items.forEach(item => {
    lines.push(`- ${item.quantity}× ${item.name} • ${formatCurrency(item.unitPrice * item.quantity)}`);
  });
  lines.push('');
  lines.push(`Zwischensumme: ${formatCurrency(viewModel.net)}`);
  lines.push(`MwSt (${(viewModel.taxRate * 100).toFixed(0)}%): ${formatCurrency(viewModel.tax)}`);
  lines.push(`Gesamt: ${formatCurrency(viewModel.gross)}`);
  if (typeof viewModel.sale.amountTendered === 'number') {
    lines.push(`Erhalten: ${formatCurrency(viewModel.sale.amountTendered)}`);
  }
  if (typeof viewModel.sale.changeDue === 'number') {
    lines.push(`Rückgeld: ${formatCurrency(viewModel.sale.changeDue)}`);
  }
  if (viewModel.sale.fiscalization) {
    lines.push('');
    lines.push('TSS-Daten:');
    lines.push(`Mandant: ${viewModel.sale.fiscalization.tenantId}`);
    lines.push(`TSS-ID: ${viewModel.sale.fiscalization.tssId}`);
    lines.push(`Kasse: ${viewModel.sale.fiscalization.cashRegisterId}`);
    lines.push(`Transaktion: ${viewModel.sale.fiscalization.transactionId}`);
    if (viewModel.sale.fiscalization.signature?.value) {
      lines.push(`Signatur: ${viewModel.sale.fiscalization.signature.value}`);
    }
  }
  lines.push('');
  if (viewModel.sale.courses?.length) {
    lines.push('Kursfolge:');
    viewModel.sale.courses.forEach(course => {
      const served = course.servedAt ? ` – serviert ${new Date(course.servedAt).toLocaleString('de-DE')}` : '';
      lines.push(`• ${course.name} (${course.status})${served}`);
      course.items.forEach(item => {
        lines.push(`   · ${item.quantity}× ${item.name}`);
      });
    });
    lines.push('');
  }
  lines.push(`Support: ${viewModel.supportEmail}`);

  return buildSimplePdf(viewModel.businessName, lines);
}

function buildSimplePdf(title: string, lines: string[]): Buffer {
  const escapeText = (value: string) => value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const normalizedLines = lines.map(line => (line.trim().length === 0 ? ' ' : line));
  const contentParts = [
    'BT',
    '/F1 18 Tf',
    '72 780 Td',
    `(${escapeText(title)}) Tj`,
    '0 -30 Td',
    '/F1 12 Tf',
  ];

  normalizedLines.forEach(line => {
    contentParts.push(`(${escapeText(line)}) Tj`);
    contentParts.push('0 -16 Td');
  });

  contentParts.push('ET');

  const stream = contentParts.join('\n');
  const streamLength = Buffer.byteLength(stream, 'utf-8');

  const objects: string[] = [];
  objects[1] = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
  objects[2] = '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n';
  objects[3] =
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n';
  objects[4] = `4 0 obj\n<< /Length ${streamLength} >>\nstream\n${stream}\nendstream\nendobj\n`;
  objects[5] = '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n';

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];

  for (let i = 1; i <= 5; i += 1) {
    offsets[i] = Buffer.byteLength(pdf, 'utf-8');
    pdf += objects[i];
  }

  const xrefOffset = Buffer.byteLength(pdf, 'utf-8');
  pdf += 'xref\n0 6\n';
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i <= 5; i += 1) {
    pdf += `${offsets[i].toString().padStart(10, '0')} 00000 n \n`;
  }
  pdf += 'trailer\n<< /Size 6 /Root 1 0 R >>\n';
  pdf += 'startxref\n';
  pdf += `${xrefOffset}\n`;
  pdf += '%%EOF';

  return Buffer.from(pdf, 'utf-8');
}
