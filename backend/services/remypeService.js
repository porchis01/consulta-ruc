/**
 * ============================================================
 * CONSULTA RUC Y REMYPE - Backend
 * services/remypeService.js
 * ============================================================
 * Automatiza https://apps.trabajo.gob.pe/consultas-remype/app/index.html
 * Captura el resultado completo de la consulta (este o no registrada la empresa)
 * en alta resolucion.
 *
 * Desarrollado por JHurtado
 * ============================================================
 */

const { chromium } = require('playwright');
const path = require('path');

const URL_REMYPE = 'https://apps.trabajo.gob.pe/consultas-remype/app/index.html';
const TIMEOUT_NAV = 45_000;
const TIMEOUT_ELEM = 25_000;

const VIEWPORT = { width: 1366, height: 900 };
const SCALE_FACTOR = 2;

async function consultarRemype(ruc, carpetaTemp) {
  const rutaRemype = path.join(carpetaTemp, 'remype.png');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--lang=es-PE'],
  });

  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: SCALE_FACTOR,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'es-PE',
  });

  const page = await context.newPage();
  page.setDefaultNavigationTimeout(TIMEOUT_NAV);
  page.setDefaultTimeout(TIMEOUT_ELEM);

  try {
    await page.goto(URL_REMYPE, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: TIMEOUT_NAV }).catch(() => {});
    await page.waitForTimeout(2500);

    // ── Ingresar RUC ─────────────────────────────────────────────────────
    const selectorRuc = await primero(page, [
      'input[name="ruc"]',
      'input[placeholder*="RUC" i]',
      'input[formcontrolname*="ruc" i]',
      'input[type="text"][maxlength="11"]',
      'input.form-control',
      'input[type="text"]',
    ]);

    if (!selectorRuc) {
      // Capturar lo que haya, por si no se encuentra el campo
      await page.screenshot({ path: rutaRemype, fullPage: true, type: 'png' });
      return rutaRemype;
    }

    await page.click(selectorRuc);
    await page.fill(selectorRuc, '');
    await page.waitForTimeout(200);
    await page.type(selectorRuc, ruc, { delay: 80 });

    // ── Click en Buscar ──────────────────────────────────────────────────
    const selectorBoton = await primero(page, [
      'button:has-text("Buscar")',
      'button:has-text("BUSCAR")',
      'button:has-text("Consultar")',
      'button[type="submit"]',
      'input[type="submit"]',
    ]);

    if (selectorBoton) {
      await page.click(selectorBoton);
    } else {
      await page.press(selectorRuc, 'Enter');
    }

    // ── Esperar resultado ────────────────────────────────────────────────
    await page.waitForFunction(
      () => {
        const t = document.body.innerText.toLowerCase();
        return t.includes('razón social') || t.includes('razon social') ||
               t.includes('no se tiene informaci') || t.includes('no se encontraron') ||
               document.querySelector('table') !== null;
      },
      { timeout: TIMEOUT_ELEM }
    ).catch(() => {});

    await page.waitForTimeout(1500);

    // ── Captura full page (ancho completo, sin recorte por ser una sola tabla) ──
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);

    await page.screenshot({
      path: rutaRemype,
      fullPage: true,
      type: 'png',
    });

    return rutaRemype;

  } catch (err) {
    // Fallback: capturar el estado actual de la pagina antes de fallar
    try {
      await page.screenshot({ path: rutaRemype, fullPage: true, type: 'png' });
      return rutaRemype;
    } catch {
      throw err;
    }
  } finally {
    await browser.close().catch(() => {});
  }
}

async function primero(page, selectores) {
  for (const sel of selectores) {
    try {
      const elementos = await page.$$(sel);
      for (const el of elementos) {
        if (await el.isVisible()) {
          const tag = await el.evaluate(e => e.tagName);
          if (tag === 'INPUT') return sel;
        }
      }
    } catch {}
  }
  return null;
}

module.exports = { consultarRemype };
