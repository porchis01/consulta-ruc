/**
 * ============================================================
 * CONSULTA RUC Y REMYPE - Backend
 * services/docxService.js
 * ============================================================
 * Genera el .docx final con las 4 capturas, manteniendo la
 * relacion de aspecto original de cada imagen (sin distorsion)
 * y ajustando el ancho al area imprimible de la pagina A4.
 *
 * Colores SUNAFIL: Rojo #C0392B, Azul #1A3A6B, Blanco #FFFFFF
 *
 * Desarrollado por JHurtado
 * ============================================================
 */

const {
  Document, Packer, Paragraph, TextRun, ImageRun,
  AlignmentType, BorderStyle, ShadingType,
} = require('docx');

const fs = require('fs');
const sizeOf = require('image-size');

const COLOR_ROJO = 'C0392B';
const COLOR_AZUL = '1A3A6B';
const COLOR_BLANCO = 'FFFFFF';

// Ancho util de pagina A4 con margenes de 1.5cm: 21cm - 3cm = 18cm
// En puntos (1cm = 28.35pt): 18cm * 28.35 = 510pt -> usamos 500 por margen de seguridad
const MAX_WIDTH_PT = 500;
const MAX_HEIGHT_PT = 700; // limite por si la imagen es muy alta (se escala proporcional)

const SECCIONES = [
  { key: 'consultaRuc', num: '1', titulo: 'CONSULTA RUC - SUNAT' },
  { key: 'trabajadores', num: '2', titulo: 'CANTIDAD DE TRABAJADORES Y/O PRESTADORES DE SERVICIO - SUNAT' },
  { key: 'representantes', num: '3', titulo: 'REPRESENTANTE(S) LEGAL(ES) - SUNAT' },
  { key: 'remype', num: '4', titulo: 'CONSULTA REMYPE' },
];

async function generarWordDocx({ ruc, capturas, rutaSalida }) {
  const children = [];

  // ── Encabezado institucional ──────────────────────────────────────────
  children.push(new Paragraph({
    children: [new TextRun({
      text: 'CONSULTA RUC Y REMYPE',
      bold: true, size: 36, color: COLOR_AZUL, font: 'Arial',
    })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 80 },
  }));

  children.push(new Paragraph({
    children: [new TextRun({
      text: `RUC: ${ruc}`,
      bold: true, size: 26, color: COLOR_ROJO, font: 'Arial',
    })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 60 },
  }));

  const ahora = new Date();
  const fecha = ahora.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const hora = ahora.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });

  children.push(new Paragraph({
    children: [new TextRun({
      text: `Fecha de consulta: ${fecha} - ${hora} hrs`,
      size: 18, color: '777777', font: 'Arial',
    })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 160 },
  }));

  children.push(lineaDivisoria());

  // ── Secciones con capturas ──────────────────────────────────────────────
  for (let i = 0; i < SECCIONES.length; i++) {
    const sec = SECCIONES[i];
    const ruta = capturas[sec.key];

    if (i > 0) {
      children.push(new Paragraph({ children: [new TextRun({ text: '' })], spacing: { before: 240, after: 0 } }));
    }

    children.push(new Paragraph({
      children: [new TextRun({
        text: `${sec.num}. ${sec.titulo}`,
        bold: true, size: 24, color: COLOR_BLANCO, font: 'Arial',
      })],
      shading: { type: ShadingType.CLEAR, fill: COLOR_AZUL },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: COLOR_ROJO } },
      spacing: { before: 240, after: 120 },
      indent: { left: 140 },
    }));

    if (ruta && fs.existsSync(ruta)) {
      const buffer = fs.readFileSync(ruta);
      const dims = sizeOf(buffer);

      let widthPt = MAX_WIDTH_PT;
      let heightPt = Math.round((widthPt * dims.height) / dims.width);

      if (heightPt > MAX_HEIGHT_PT) {
        heightPt = MAX_HEIGHT_PT;
        widthPt = Math.round((heightPt * dims.width) / dims.height);
      }

      children.push(new Paragraph({
        children: [new ImageRun({
          data: buffer,
          type: 'png',
          transformation: { width: widthPt, height: heightPt },
        })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 100, after: 80 },
      }));
    } else {
      children.push(new Paragraph({
        children: [new TextRun({
          text: `Captura no disponible: ${sec.titulo}`,
          bold: true, size: 18, color: COLOR_ROJO, font: 'Arial',
        })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 100, after: 100 },
      }));
    }
  }

  children.push(lineaDivisoria());

  children.push(new Paragraph({
    children: [new TextRun({
      text: 'Desarrollado por JHurtado',
      size: 16, color: '999999', italics: true, font: 'Arial',
    })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 160, after: 0 },
  }));

  // ── Documento ────────────────────────────────────────────────────────────
  const doc = new Document({
    creator: 'Consulta RUC y REMYPE - JHurtado',
    title: `Consulta RUC ${ruc}`,
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 850, right: 850, bottom: 850, left: 850 },
        },
      },
      children,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(rutaSalida, buffer);
}

function lineaDivisoria() {
  return new Paragraph({
    children: [new TextRun({ text: '' })],
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: COLOR_ROJO, space: 1 } },
    spacing: { before: 160, after: 160 },
  });
}

module.exports = { generarWordDocx };
