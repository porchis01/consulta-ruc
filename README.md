# Consulta RUC y REMYPE — Despliegue web

Aplicacion web compartible por URL: el usuario solo escribe el RUC (11
digitos) y obtiene un Word con 4 capturas (Consulta RUC, Trabajadores,
Representantes Legales, REMYPE).

Por que dos partes:
- **GitHub Pages** solo sirve archivos estaticos (HTML/CSS/JS). No puede
  ejecutar Playwright ni abrir un navegador headless.
- Para automatizar la captura de SUNAT/REMYPE en el servidor se necesita
  Node.js + Chromium corriendo en un backend. Por eso el backend va en un
  servicio gratuito como **Render**.

---

## 1. Desplegar el backend (Render, gratis)

1. Crear cuenta en https://render.com
2. Subir la carpeta `backend/` a un repositorio de GitHub (puede ser el
   mismo repo, en una subcarpeta).
3. En Render: **New +** → **Web Service** → conectar el repositorio.
4. Configuracion:
   - **Root Directory:** `backend`
   - **Environment:** `Node`
   - **Build Command:** `npm install && npx playwright install --with-deps chromium`
   - **Start Command:** `node server.js`
   - **Instance Type:** Free
5. Click **Create Web Service**. El primer build tarda 5-10 minutos
   (descarga Chromium).
6. Al terminar, Render entrega una URL como:
   `https://consulta-ruc-backend.onrender.com`

> Nota: el plan gratuito de Render "duerme" tras 15 min de inactividad.
> La primera consulta tras inactividad puede tardar 30-50s extra en
> despertar el servicio. Esto es normal.

---

## 2. Configurar el frontend

1. Abrir `frontend/index.html`
2. Reemplazar esta linea con la URL real del backend del paso anterior:

```js
const API_URL = 'https://TU-BACKEND.onrender.com/api/generar';
```

---

## 3. Publicar el frontend en GitHub Pages

1. Crear un repositorio en GitHub (puede ser publico).
2. Subir el contenido de la carpeta `frontend/` a la raiz del repo
   (o a una carpeta `docs/`).
3. En el repo: **Settings** → **Pages**.
4. **Source:** Deploy from a branch → rama `main` → carpeta `/` (o `/docs`).
5. Guardar. GitHub entrega una URL como:
   `https://tu-usuario.github.io/tu-repo/`

Esa URL es la que se comparte. Cualquier persona la abre, escribe el
RUC y presiona **GENERAR WORD**.

---

## Estructura

```
sunafil-web/
├── backend/                  -> Desplegar en Render
│   ├── server.js
│   ├── package.json
│   └── services/
│       ├── sunatService.js
│       ├── remypeService.js
│       └── docxService.js
└── frontend/                 -> Desplegar en GitHub Pages
    └── index.html
```

---

## Notas tecnicas

- Las capturas se toman con `deviceScaleFactor: 2` (alta resolucion,
  texto nitido).
- SUNAT: la pagina completa se divide en 3 capturas (Consulta RUC,
  Trabajadores, Representantes) detectando los titulos de cada bloque
  y recortando por coordenadas — sin reescalar, sin perder informacion.
- REMYPE: se captura la pagina completa (`fullPage: true`), incluya o
  no resultados, igual que el ejemplo adjunto.
- El Word inserta cada imagen manteniendo su relacion de aspecto
  original, ajustada al ancho de pagina A4.
- No se almacena ninguna informacion: los archivos temporales se
  eliminan tras enviar el Word al usuario.
- Si SUNAT/REMYPE cambian su HTML, puede ser necesario ajustar los
  selectores en `sunatService.js` / `remypeService.js`.
