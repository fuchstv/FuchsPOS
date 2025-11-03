import { test, expect } from '@playwright/test';

test.describe('Offline-Zahlungen', () => {
  test('wartet Zahlungen bei Netzwerkverlust ein', async ({ page }) => {
    await page.goto('/');

    await page.route('**/api/pos/payments', route => route.abort('failed'));

    const addButtons = await page.getByRole('button', { name: /Hinzufügen/i }).all();
    if (addButtons.length === 0) {
      test.skip('Keine Produkte gefunden, um sie dem Warenkorb hinzuzufügen.');
    } else {
      await addButtons[0].click();
    }

    await page.getByRole('button', { name: /Kartenzahlung/i }).click();

    await expect(page.getByText('Zahlung offline gespeichert', { exact: false })).toBeVisible();
    await expect(page.getByText('Offline-Warteschlange')).toBeVisible();

    await page.unroute('**/api/pos/payments');
  });
});
