import { expect, test } from '@playwright/test';

type TenantProfile = {
  id: string;
  name: string;
  isDefault: boolean;
  tsses: Array<{ id: string; tenantId: string }>;
  cashRegisters: Array<{
    id: string;
    label: string | null;
    location: string | null;
    tenantId: string;
    tssId: string;
    isDefault: boolean;
  }>;
};

const tenantProfiles: TenantProfile[] = [
  {
    id: 'tenant-north',
    name: 'Café Linden',
    isDefault: true,
    tsses: [{ id: 'tss-001', tenantId: 'tenant-north' }],
    cashRegisters: [
      {
        id: 'reg-berlin-1',
        label: 'Theke 1',
        location: 'Berlin',
        tenantId: 'tenant-north',
        tssId: 'tss-001',
        isDefault: true,
      },
    ],
  },
  {
    id: 'tenant-south',
    name: 'Rösterei Süd',
    isDefault: false,
    tsses: [{ id: 'tss-200', tenantId: 'tenant-south' }],
    cashRegisters: [
      {
        id: 'reg-muc-1',
        label: 'Mobile Einheit',
        location: 'München',
        tenantId: 'tenant-south',
        tssId: 'tss-200',
        isDefault: true,
      },
    ],
  },
];

test.describe('Mandantenauswahl', () => {
  test('aktiviert Mandantenprofile und persistiert die Auswahl', async ({ page }) => {
    await page.route('**/api/tenant-config/tenants', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(tenantProfiles),
      });
    });

    await page.goto('/');
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();

    const tenantButton = page.getByRole('button', { name: /Mandant wählen/i });
    await expect(tenantButton).toBeVisible();
    await tenantButton.click();

    const dialog = page.getByRole('dialog', { name: /Mandant auswählen/i });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Café Linden')).toBeVisible();

    await dialog.getByLabel('Café Linden', { exact: false }).check();
    await dialog.getByRole('button', { name: 'Mandant aktivieren' }).click();

    await expect(page.getByRole('button', { name: /Mandant: tenant-north/i })).toBeVisible();
    await expect(page.getByText('Mandant tenant-north aktiviert.', { exact: false })).toBeVisible();

    const storedTenant = await page.evaluate(() => window.localStorage.getItem('fuchspos.posTenantId'));
    expect(storedTenant).toBe('tenant-north');
  });
});
