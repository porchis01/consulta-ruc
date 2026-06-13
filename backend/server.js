/**
 * ============================================================
 * CONSULTA RUC Y REMYPE - Backend
 * server.js
 * ============================================================
 * Servidor Express que expone un endpoint POST /api/generar
 * Recibe { ruc } y devuelve un archivo .docx con 4 capturas:
 *   1. Consulta RUC - SUNAT
 *   2. Trabajadores y Prestadores de Servicio - SUNAT
 *   3. Representantes Legales - SUNAT
 *   4. Consulta REMYPE
 *
 * Desplegable en Render / Railway / Fly.io (requiere Node + Chromium)
 *
 * Desarrollado por JHurtado
 * ============================================================
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { consultarSunat } = require('./services/sunatService');
const { consultarRemype } = require('./services/remypeService');
const { generarWordDocx } = require('./services/docxService');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Backend activo ✔');
});

const PORT = process.env.PORT || 3000;

// ── Endpoint principal ──────────────────────────────────────────────────────
app.post('/api/generar', async (req, res) => {
  const { ruc } = req.body;

  // Validación básica del RUC peruano (11 dígitos)
  if (!ruc || !/^\d{11}$/.test(ruc)) {
    return res.status(400).json({ error: 'El RUC debe tener exactamente 11 digitos numericos.' });
  }

  const carpetaTemp = path.join(os.tmpdir(), `ruc_${ruc}_${Date.now()}`);
  fs.mkdirSync(carpetaTemp, { recursive: true });

  try {
    console.log(`[API] Iniciando consulta RUC ${ruc}`);

    // 1. SUNAT: 3 capturas
    let capturasSunat;
    try {
      capturasSunat = await consultarSunat(ruc, carpetaTemp);
    } catch (err) {
      limpiar(carpetaTemp);
      if (err.message === 'RUC_NO_ENCONTRADO') {
        return res.status(404).json({ error: 'RUC no encontrado en SUNAT.' });
      }
      return res.status(502).json({ error: 'Error de conexion con SUNAT.' });
    }

    // 2. REMYPE: 1 captura
    let capturaRemype;
    try {
      capturaRemype = await consultarRemype(ruc, carpetaTemp);
    } catch (err) {
      limpiar(carpetaTemp);
      return res.status(502).json({ error: 'Error de conexion con REMYPE.' });
    }

    // 3. Generar Word
    const rutaWord = path.join(carpetaTemp, `Consulta_RUC_${ruc}.docx`);
    await generarWordDocx({
      ruc,
      capturas: {
        consultaRuc: capturasSunat.consultaRuc,
        trabajadores: capturasSunat.trabajadores,
        representantes: capturasSunat.representantes,
        remype: capturaRemype,
      },
      rutaSalida: rutaWord,
    });

    // 4. Enviar archivo y limpiar al finalizar
    res.download(rutaWord, `Consulta_RUC_${ruc}.docx`, (err) => {
      limpiar(carpetaTemp);
      if (err) console.error('[API] Error al enviar archivo:', err.message);
    });

  } catch (error) {
    console.error('[API] ERROR GENERAL:', error);
    limpiar(carpetaTemp);
    res.status(500).json({ error: 'Error inesperado en el servidor.' });
  }
});

// ── Salud del servicio (para Render/Railway) ─────────────────────────────────
app.get('/api/health', (req, res) => res.json({ ok: true }));

function limpiar(carpeta) {
  try {
    if (fs.existsSync(carpeta)) fs.rmSync(carpeta, { recursive: true, force: true });
  } catch (e) {
    console.warn('[API] No se pudo limpiar carpeta temporal:', e.message);
  }
}

app.listen(PORT, () => {
  console.log(`Servidor escuchando en puerto ${PORT}`);
});
