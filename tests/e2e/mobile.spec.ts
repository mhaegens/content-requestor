import { test, expect } from '@playwright/test';

const results = (type: string, prefix = 'Title') => Array.from({ length: 20 }, (_, index) => ({
  tmdb_id: index + 1, media_type: type, title: `${prefix} ${index + 1}`, year: '2026',
  poster_path: '/fixture.jpg', overview: 'A fixture title for discovery and availability.', vote_average: 8,
  availability: index === 0 ? 'available' : 'missing',
}));

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('requestr_name', 'Browser tester'));
  await page.route('https://image.tmdb.org/**', (route) => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="185" height="278"><rect width="185" height="278" fill="#35304a"/></svg>' }));
  await page.route('**/api/requests**', (route) => route.fulfill({ json: { requests: [] } }));
  await page.route('**/api/recommendations?**', async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('tab') === 'providers') {
      return route.fulfill({ json: { providers: Array.from({ length: 36 }, (_, index) => ({
        provider_id: index + 1, provider_name: `Platform ${index + 1}`, logo_path: '/logo.jpg', display_priority: index,
      })) } });
    }
    return route.fulfill({ json: { results: results(url.searchParams.get('mediaType') ?? 'movie') } });
  });
});

test('discovery bounds initial requests/cards and stays bounded after scrolling', async ({ page }, testInfo) => {
  const rowRequests: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.url().includes('/api/recommendations?') && !request.url().includes('tab=providers')) rowRequests.push(request.url());
  });
  await page.goto('/recommendations');
  await expect(page.locator('.discovery-section').first().locator('.card')).toHaveCount(6);
  expect(rowRequests.length).toBeLessThanOrEqual(3);
  expect(rowRequests.some((url) => url.includes('tab=platform'))).toBe(false);
  expect(await page.locator('.card').count()).toBeLessThanOrEqual(18);
  await expect(page.locator('.card-poster img').first()).toHaveAttribute('src', /\/w185\//);
  await expect(page.getByRole('button', { name: 'In Jellyfin' }).first()).toBeDisabled();
  const layout = await page.evaluate(() => ({ width: window.innerWidth, scroll: document.documentElement.scrollWidth,
    overflow: [...document.querySelectorAll('*')].map((element) => ({ name: element.className, left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right })).filter((element) => element.right > window.innerWidth).slice(0, 12),
  }));
  expect(layout.scroll <= layout.width, JSON.stringify(layout)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('mobile-discovery.png') });

  await page.getByRole('button', { name: 'More titles' }).first().click();
  await expect(page.locator('.discovery-section').first()).toContainText('Title 7');
  await page.getByRole('button', { name: 'Show more platforms' }).scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Show more platforms' }).click();
  await expect(page.locator('.discovery-platform-logo')).toHaveCount(12);
  await page.locator('.discovery-platform-logo').last().scrollIntoViewIfNeeded();
  await expect(page.locator('.discovery-section').last().locator('.card')).toHaveCount(6);
  await expect(page.locator('.discovery-section').first().locator('.card')).toHaveCount(0);
  expect(await page.locator('.card').count()).toBeLessThanOrEqual(24);
  await page.getByRole('button', { name: 'Movies', exact: true }).scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'TV Shows', exact: true }).click();
  await expect(page.locator('.discovery-section').first().locator('.card-type-badge').first()).toHaveText('TV Series');
  expect(errors).toEqual([]);
});

test('search marks existing library titles and corrects availability discovered during submission', async ({ page }) => {
  await page.route('**/api/search?**', (route) => route.fulfill({ json: { results: results('movie').slice(0, 2) } }));
  let submitted = 0;
  await page.route('**/api/requests', (route) => {
    if (route.request().method() !== 'POST') return route.fulfill({ json: { requests: [] } });
    submitted++;
    return route.fulfill({ status: 409, json: { available: true, error: 'Already available in Jellyfin' } });
  });
  await page.goto('/');
  await page.getByPlaceholder('Title or TMDB ID… e.g. Breaking Bad or 1396').fill('A movie');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('button', { name: 'In Jellyfin' })).toBeDisabled();
  await page.getByRole('button', { name: '+ Request', exact: true }).click();
  await expect(page.getByRole('button', { name: 'In Jellyfin' })).toHaveCount(2);
  expect(submitted).toBe(1);
});

test('admin approval uses the entered key and shows sent status separately from availability', async ({ page }) => {
  const item = { ...results('movie')[1], id: 'fixture-request', requested_by: 'Friend', requested_at: '2026-10-25T10:00:00Z',
    available_in_jellyfin: false, delivery_status: 'pending', delivery_error: null };
  await page.route('**/api/requests', (route) => route.fulfill({ json: { requests: [item] } }));
  await page.route('**/api/requests/fixture-request/approve', async (route) => {
    expect(route.request().headers().authorization).toBe('Bearer fixture-admin');
    return route.fulfill({ json: { request: { ...item, delivery_status: 'sent', external_id: 81 } } });
  });
  await page.goto('/masterview');
  await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeDisabled();
  await page.getByLabel('Admin key', { exact: true }).fill('fixture-admin');
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.locator('tbody')).toContainText('Sent to Radarr');
  await expect(page.getByRole('button', { name: 'Mark Available', exact: true })).toBeVisible();
});
