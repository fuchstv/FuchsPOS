import type { SalePayload } from '../../pos/types/sale-payload';

const currency = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
});

const TAX_RATE = 0.07;

export function renderReceiptEmail(
  sale: SalePayload,
  options?: { businessName?: string; supportEmail?: string },
) {
  const businessName = options?.businessName ?? 'FuchsPOS';
  const supportEmail = options?.supportEmail ?? 'support@fuchspos.local';

  const net = sale.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const tax = Number((net * TAX_RATE).toFixed(2));
  const gross = Number((net + tax).toFixed(2));

  const rows = sale.items
    .map(
      item => `
        <tr>
          <td style="padding:4px 0;">${item.quantity}× ${item.name}</td>
          <td style="padding:4px 0;text-align:right;">${currency.format(
            item.unitPrice * item.quantity,
          )}</td>
        </tr>
      `,
    )
    .join('');

  const subject = `${businessName} – Ihr digitaler Beleg ${sale.receiptNo}`;

  const html = `<!doctype html>
  <html lang="de">
    <head>
      <meta charset="utf-8" />
      <title>${subject}</title>
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
        <h1>${businessName}</h1>
        <p>Vielen Dank für Ihren Einkauf. Nachfolgend finden Sie die Details Ihres digitalen Bons.</p>
        <p><strong>Belegnummer:</strong> ${sale.receiptNo}</p>
        <p><strong>Zahlungsart:</strong> ${sale.paymentMethod}</p>
        <table>
          <tbody>
            ${rows}
            <tr>
              <td style="padding-top:12px;">Zwischensumme</td>
              <td style="padding-top:12px;text-align:right;">${currency.format(net)}</td>
            </tr>
            <tr>
              <td>MwSt (${(TAX_RATE * 100).toFixed(0)}%)</td>
              <td style="text-align:right;">${currency.format(tax)}</td>
            </tr>
            <tr>
              <td style="padding-top:8px;font-weight:600;">Gesamt</td>
              <td style="padding-top:8px;text-align:right;font-weight:600;">${currency.format(gross)}</td>
            </tr>
          </tbody>
        </table>
        ${
          sale.fiscalization
            ? `
        <div style="margin-top:24px;padding:16px;border-radius:12px;background:rgba(30,41,59,0.6);border:1px solid rgba(148,163,184,0.2);">
          <h2 style="font-size:14px;margin:0 0 8px 0;letter-spacing:0.08em;text-transform:uppercase;color:#38bdf8;">TSS-Daten</h2>
          <p style="margin:4px 0;">Mandant: <strong>${sale.fiscalization.tenantId}</strong></p>
          <p style="margin:4px 0;">TSS-ID: <strong>${sale.fiscalization.tssId}</strong></p>
          <p style="margin:4px 0;">Kasse: <strong>${sale.fiscalization.cashRegisterId}</strong></p>
          <p style="margin:4px 0;">Transaktion: <strong>${sale.fiscalization.transactionId}</strong></p>
          ${
            sale.fiscalization.signature?.value
              ? `<p style="margin:4px 0;">Signatur: <code style="font-size:12px;">${sale.fiscalization.signature.value}</code></p>`
              : ''
          }
          ${
            sale.fiscalization.signature?.timestamp
              ? `<p style="margin:4px 0;">Signiert am ${new Date(
                  sale.fiscalization.signature.timestamp,
                ).toLocaleString('de-DE')}</p>`
              : ''
          }
        </div>
        `
            : ''
        }
        <footer>
          <p>Erstellt am ${sale.createdAt.toLocaleString('de-DE')}.</p>
          <p>Bei Fragen erreichen Sie uns unter <a href="mailto:${supportEmail}" style="color:#38bdf8;">${supportEmail}</a>.</p>
        </footer>
      </div>
    </body>
  </html>`;

  return { subject, html };
}
