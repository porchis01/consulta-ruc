/**
 * ============================================================
 * CONSULTA RUC Y REMYPE - Backend
 * services/sunatService.js
 * ============================================================
 * Automatiza https://e-consultaruc.sunat.gob.pe/cl-ti-itmrconsruc/jcrS00Alias
 * Captura 3 secciones en alta resolucion (fullPage, deviceScaleFactor 2):
 *   1. consultaRuc.png    - Ficha principal del RUC
 *   2. trabajadores.png   - Cantidad de Trabajadores y Prestadores
 *   3. representantes.png - Representantes Legales
 *
 * Desarrollado por JHurtado
 * ============================================================
 */

const { chromium } = require('playwright');
const path = require('path');

const URL_SUNAT = 'https://e-consultaruc.sunat.gob.pe/cl-ti-itmrconsruc/jcrS00Alias';
const TIMEOUT_NAV = 45_000;
const TIMEOUT_ELEM = 25_000;

// Viewport ancho para que las tablas no se corten horizontalmente
const VIEWPORT = { width: 1366, height: 900 };
// Factor de escala para capturas nitidas (equivalente a pantalla retina)
const SCALE_FACTOR = 2;

async function consultarSunat(ruc, carpetaTemp) {
  const rutaConsultaRuc    = path.join(carpetaTemp, 'consultaRuc.png');
  const rutaTrabajadores   = path.join(carpetaTemp, 'trabajadores.png');
  const rutaRepresentantes = path.join(carpetaTemp, 'representantes.png');

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
    // ── Cargar portal ────────────────────────────────────────────────────
    await page.goto(URL_SUNAT, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: TIMEOUT_NAV }).catch(() => {});
    await page.waitForTimeout(1500);

    // ── Ingresar RUC ─────────────────────────────────────────────────────
    const selectorRuc = await primero(page, [
      'input[name="search1"]',
      'input[name="nroRuc"]',
      '#txtRuc',
      'input[type="text"][maxlength="11"]',
      'input.form-control[type="text"]',
    ]);

    if (!selectorRuc) throw new Error('RUC_NO_ENCONTRADO');

    await page.fill(selectorRuc, '');
    await page.type(selectorRuc, ruc, { delay: 60 });

    // ── Enviar formulario ────────────────────────────────────────────────
    const selectorBoton = await primero(page, [
      'button:has-text("Buscar")',
      'input[value="Buscar"]',
      'button[type="submit"]',
      'input[type="submit"]',
    ]);

    if (selectorBoton) {
      await page.click(selectorBoton);
    } else {
      await page.press(selectorRuc, 'Enter');
    }

    await page.waitForLoadState('domcontentloaded', { timeout: TIMEOUT_NAV }).catch(() => {});
    await page.waitForTimeout(2500);

    // ── Verificar RUC no encontrado ──────────────────────────────────────
    const noExiste = await page.evaluate(() => {
      const t = document.body.innerText.toLowerCase();
      return t.includes('no existe') || t.includes('no se encontraron') || t.includes('ruc inv');
    });
    if (noExiste) throw new Error('RUC_NO_ENCONTRADO');

    await page.waitForFunction(
      () => {
        const t = document.body.innerText;
        return t.includes('Numero de RUC') || t.includes('Número de RUC') || t.includes('Razón Social') || t.includes('Razon Social');
      },
      { timeout: TIMEOUT_ELEM }
    ).catch(() => {});

    // ── CAPTURA 1: Consulta RUC (ficha principal) ────────────────────────
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);
    await capturarRegion(page, rutaConsultaRuc, async () => {
      // Region desde el inicio hasta justo antes de la tabla de trabajadores
      return await recortarHasta(page, ['Cantidad de Trabajadores', 'CANTIDAD DE TRABAJADORES', 'Trabajadores y/o Prestadores']);
    });

    // ── CAPTURA 2: Trabajadores y Prestadores de Servicio ────────────────
    await capturarRegion(page, rutaTrabajadores, async () => {
      return await recortarEntre(
        page,
        ['Cantidad de Trabajadores', 'CANTIDAD DE TRABAJADORES', 'Trabajadores y/o Prestadores'],
        ['Representantes Legales', 'REPRESENTANTES LEGALES', 'Representante Legal']
      );
    });

    // ── CAPTURA 3: Representantes Legales ────────────────────────────────
    await capturarRegion(page, rutaRepresentantes, async () => {
      return await recortarDesde(page, ['Representantes Legales', 'REPRESENTANTES LEGALES', 'Representante Legal']);
    });

    return {
      consultaRuc: rutaConsultaRuc,
      trabajadores: rutaTrabajadores,
      representantes: rutaRepresentantes,
    };

  } finally {
    await browser.close().catch(() => {});
  }
}

/**
 * Devuelve el primer selector visible de una lista.
 */
async function primero(page, selectores) {
  for (const sel of selectores) {
    try {
      const el = await page.$(sel);
      if (el && await el.isVisible()) return sel;
    } catch {}
  }
  return null;
}

/**
 * Encuentra el bounding box de un elemento que contenga alguno de los textos dados.
 * Busca el contenedor de bloque mas cercano (tabla, div o section).
 */
async function encontrarBoundingBoxPorTexto(page, textos) {
  return await page.evaluate((textos) => {
    function buscar() {
      const all = document.querySelectorAll('table, div, section, h1, h2, h3, h4');
      for (const el of all) {
        const txt = (el.textContent || '').trim();
        for (const t of textos) {
          if (txt.startsWith(t) || txt.includes(t)) {
            // Subir al contenedor de bloque visible mas representativo
            let target = el;
            // Si es un heading, usar su posicion como referencia
            const rect = target.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              return { top: rect.top + window.scrollY, left: rect.left + window.scrollX, width: rect.width, height: rect.height };
            }
          }
        }
      }
      return null;
    }
    return buscar();
  }, textos);
}

/**
 * Recorta la captura desde el inicio del documento hasta el bounding box
 * que contiene alguno de los textos de "limite" (sin incluirlo).
 */
async function recortarHasta(page, textosLimite) {
  const fullW = await page.evaluate(() => document.documentElement.scrollWidth);
  const box = await encontrarBoundingBoxPorTexto(page, textosLimite);
  const top = await page.evaluate(() => 0);
  let height;
  if (box) {
    height = Math.max(100, Math.floor(box.top) - 10);
  } else {
    height = await page.evaluate(() => document.body.scrollHeight);
  }
  return { x: 0, y: top, width: fullW, height };
}

/**
 * Recorta la captura entre dos bounding boxes (desde el inicio del primero
 * hasta justo antes del segundo).
 */
async function recortarEntre(page, textosInicio, textosFin) {
  const fullW = await page.evaluate(() => document.documentElement.scrollWidth);
  const boxInicio = await encontrarBoundingBoxPorTexto(page, textosInicio);
  const boxFin = await encontrarBoundingBoxPorTexto(page, textosFin);

  const top = boxInicio ? Math.max(0, Math.floor(boxInicio.top) - 10) : 0;
  let bottom;
  if (boxFin) {
    bottom = Math.floor(boxFin.top) - 10;
  } else {
    bottom = await page.evaluate(() => document.body.scrollHeight);
  }
  const height = Math.max(100, bottom - top);
  return { x: 0, y: top, width: fullW, height };
}

/**
 * Recorta la captura desde el bounding box dado hasta el final del documento.
 */
async function recortarDesde(page, textosInicio) {
  const fullW = await page.evaluate(() => document.documentElement.scrollWidth);
  const fullH = await page.evaluate(() => document.body.scrollHeight);
  const box = await encontrarBoundingBoxPorTexto(page, textosInicio);
  const top = box ? Math.max(0, Math.floor(box.top) - 10) : 0;
  const height = Math.max(100, fullH - top);
  return { x: 0, y: top, width: fullW, height };
}

/**
 * Toma una captura recortada segun la funcion de region provista.
 * Hace scroll para asegurar que el contenido este renderizado antes de medir.
 */
async function capturarRegion(page, rutaSalida, fnRegion) {
  // Asegurar render completo: scroll al fondo y de regreso
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(300);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);

  const region = await fnRegion();

  await page.screenshot({
    path: rutaSalida,
    clip: { x: region.x, y: region.y, width: region.width, height: region.height },
    type: 'png',
  });
}

module.exports = { consultarSunat };
