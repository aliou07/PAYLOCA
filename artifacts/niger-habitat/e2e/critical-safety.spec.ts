import { expect, test, type Page } from '@playwright/test';

const SOS_PATH = '/sos';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('payloca-onboarding-seen', 'true');
  });
});

async function addContact(page: Page, name: string, phone: string) {
  await page.getByPlaceholder('Nom complet').fill(name);
  await page.getByPlaceholder('Numéro (ex: 90123456)').fill(phone);
  await page.getByRole('button', { name: 'Ajouter le contact' }).click();
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
}

async function holdSosButton(page: Page) {
  const button = page.getByRole('button', {
    name: 'Maintenir appuyé pendant 3 secondes pour préparer les messages SOS',
  });
  await button.dispatchEvent('pointerdown', { button: 0, pointerType: 'mouse' });
  await page.waitForTimeout(3_100);
}

test.describe('parcours critiques SOS', () => {
  test('ajoute, supprime et refuse atomiquement un sixième contact', async ({ page }) => {
    await page.goto(SOS_PATH);
    await expect(page.getByRole('heading', { name: 'Préparation SOS' })).toBeVisible();

    await addContact(page, 'Contact Alpha', '90110001');
    await addContact(page, 'Contact Bravo', '90110002');
    await addContact(page, 'Contact Charlie', '90110003');
    await addContact(page, 'Contact Delta', '90110004');

    await page.getByPlaceholder('Nom complet').fill('Contact simultané');
    await page.getByPlaceholder('Numéro (ex: 90123456)').fill('90110005');
    await page.locator('form').evaluate((form) => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    await expect(page.getByText('5/5', { exact: true })).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('Vous ne pouvez ajouter que 5 contacts maximum.');
    await expect(page.getByRole('button', { name: 'Supprimer Contact simultané' })).toHaveCount(1);

    await page.getByRole('button', { name: 'Supprimer Contact Alpha' }).click();
    await expect(page.getByText('4/5', { exact: true })).toBeVisible();
    await expect(page.getByText('Contact Alpha', { exact: true })).toHaveCount(0);
  });

  test('un refus GPS exige une confirmation avant la préparation sans position', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: {
          getCurrentPosition: (_success: PositionCallback, error: PositionErrorCallback) => {
            error({ code: 1, message: 'Permission denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
          },
        },
      });
    });
    await page.goto(SOS_PATH);
    await addContact(page, 'Contact GPS refusé', '90220001');
    await page.getByRole('checkbox', { name: 'Contact GPS refusé' }).check();
    await page.getByLabel('J’autorise temporairement l’accès à ma position GPS').check();

    await holdSosButton(page);

    await expect(page.getByRole('alert')).toContainText('Position introuvable ou refusée');
    await expect(page.getByText('Message préparé avec succès')).toHaveCount(0);
    await page.getByRole('button', { name: 'Continuer sans la position' }).click();
    await expect(page.getByText('Message préparé avec succès')).toBeVisible();
    await expect(page.getByText(/Position non disponible/)).toBeVisible();
  });

  test('une autorisation GPS prépare un lien sans ouvrir le SMS', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: {
          getCurrentPosition: (success: PositionCallback) => {
            success({
              coords: {
                latitude: 13.5116,
                longitude: 2.1254,
                accuracy: 5,
                altitude: null,
                altitudeAccuracy: null,
                heading: null,
                speed: null,
                toJSON: () => ({}),
              },
              timestamp: Date.now(),
              toJSON: () => ({}),
            });
          },
        },
      });
    });
    await page.goto(SOS_PATH);
    await addContact(page, 'Contact GPS autorisé', '90330001');
    await page.getByRole('checkbox', { name: 'Contact GPS autorisé' }).check();
    await page.getByLabel('J’autorise temporairement l’accès à ma position GPS').check();
    const initialUrl = page.url();

    await holdSosButton(page);

    await expect(page.getByText('Message préparé avec succès')).toBeVisible();
    await expect(page.getByText(/https:\/\/www\.google\.com\/maps\?q=13\.5116,2\.1254/)).toBeVisible();
    await expect(page.getByRole('link', { name: /Ouvrir le SMS pour Contact GPS autorisé/ })).toHaveAttribute('href', /^sms:/);
    expect(page.url()).toBe(initialUrl);
  });

  test('un appui SOS trop court ne prépare rien et ne demande pas la position', async ({ page }) => {
    await page.addInitScript(() => {
      let geolocationRequests = 0;
      Object.defineProperty(window, '__geolocationRequests', {
        configurable: true,
        get: () => geolocationRequests,
      });
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: {
          getCurrentPosition: () => {
            geolocationRequests += 1;
          },
        },
      });
    });
    await page.goto(SOS_PATH);
    await addContact(page, 'Contact appui court', '90440001');
    await page.getByRole('checkbox', { name: 'Contact appui court' }).check();
    await page.getByLabel('J’autorise temporairement l’accès à ma position GPS').check();

    const button = page.getByRole('button', {
      name: 'Maintenir appuyé pendant 3 secondes pour préparer les messages SOS',
    });
    await button.dispatchEvent('pointerdown', { button: 0, pointerType: 'mouse' });
    await page.waitForTimeout(500);
    await button.dispatchEvent('pointerup', { button: 0, pointerType: 'mouse' });
    await page.waitForTimeout(2_700);

    await expect(page.getByText('Message préparé avec succès')).toHaveCount(0);
    await expect(page.getByText('Un appui long évite les déclenchements accidentels.')).toBeVisible();
    await expect.poll(() => page.evaluate(() => (window as Window & { __geolocationRequests?: number }).__geolocationRequests ?? 0)).toBe(0);
  });
});

test('une publication hors ligne est synchronisée une seule fois au retour du réseau', async ({ context, page }) => {
  const caption = `Publication hors ligne ${Date.now()}`;
  let storedPost: Record<string, unknown> | null = null;
  let postRequests = 0;

  await page.route('**/api/feed/posts', async (route) => {
    if (route.request().method() === 'POST') {
      postRequests += 1;
      const input = route.request().postDataJSON() as Record<string, unknown>;
      storedPost = {
        id: 901,
        ...input,
        authorName: 'Utilisateur test PAYLOCA',
        category: 'Tout le Niger',
        createdAt: new Date().toISOString(),
      };
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(storedPost) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(storedPost ? [storedPost] : []),
    });
  });

  await page.goto('/fil');
  await expect(page.getByRole('textbox', { name: 'Votre publication' })).toBeVisible();
  await context.setOffline(true);
  await page.getByRole('textbox', { name: 'Votre publication' }).fill(caption);
  await page.getByRole('button', { name: 'Publier' }).click();

  const queuedArticle = page.locator('article').filter({ hasText: caption });
  await expect(queuedArticle).toContainText('En attente de connexion');
  expect(postRequests).toBe(0);

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(() => postRequests).toBe(1);
  await expect(page.locator('article').filter({ hasText: caption })).toHaveCount(1);
  await page.waitForTimeout(500);
  expect(postRequests).toBe(1);
  await expect(page.locator('article').filter({ hasText: caption })).toHaveCount(1);
});
