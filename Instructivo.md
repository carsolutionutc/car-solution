# Instructivo — Car Solution

Guía rápida para arrancar el servidor en tu computadora (Windows).

---

## Requisitos previos

- **Node.js 18 o superior** — [https://nodejs.org](https://nodejs.org)
- Archivo **`.env`** configurado en la raíz del proyecto (copia de `.env.example`)
- Base de datos **Supabase** con el script `supabase/schema.sql` ya ejecutado

---

## 1. Configurar variables de entorno (solo la primera vez)

1. En la carpeta del proyecto, copia el archivo de ejemplo:

   ```powershell
   copy .env.example .env
   ```

2. Abre `.env` con un editor de texto y completa al menos:

   | Variable | Descripción |
   |----------|-------------|
   | `SUPABASE_URL` | URL del proyecto (`https://xxx.supabase.co`) |
   | `SUPABASE_SERVICE_ROLE_KEY` | Clave **service_role** de Supabase |
   | `ADMIN_EMAIL` | Correo para entrar a `/admin` |
   | `ADMIN_PASSWORD` | Contraseña del panel admin |
   | `JWT_SECRET` | Cadena aleatoria larga |
   | `APP_URL` | `http://localhost:3000` (en local) |

   Las variables de **Gmail** son opcionales; sin ellas la app funciona pero no envía correos.

---

## 2. Instalar dependencias (solo la primera vez)

Abre **PowerShell** o **Terminal** y ejecuta:

```powershell
cd "C:\Users\kuri-\Desktop\Car Solution\backend"
npm install
```

> **Importante:** el comando `npm run dev` debe ejecutarse **dentro de la carpeta `backend`**, no en la raíz del proyecto.  
> Si solo escribes `"C:\...\backend"` entre comillas, PowerShell solo muestra el texto y **no cambia de carpeta**. Usa siempre `cd` antes.

---

## 3. Arrancar el servidor

### Modo desarrollo (recomendado)

Reinicia automáticamente cuando guardas cambios:

```powershell
cd "C:\Users\kuri-\Desktop\Car Solution\backend"
npm run dev
```

### Modo normal

```powershell
cd "C:\Users\kuri-\Desktop\Car Solution\backend"
npm start
```

Si todo está bien, verás en consola:

```
🚗 Car Solution API
   Local:  http://localhost:8000
   Admin:  http://localhost:3000/admin
   Health: http://localhost:3000/api/health
```

---

## 4. Abrir la aplicación

| Página | URL |
|--------|-----|
| Inicio (clientes) | http://localhost:8000 |
| Panel admin | http://localhost:8000/admin |
| Cancelar cita | http://localhost:8000/cancelar |
| Estado del servidor | http://localhost:8000/api/health |

El panel admin usa el **ADMIN_EMAIL** y **ADMIN_PASSWORD** de tu `.env`.

---

## 5. Detener el servidor

En la misma ventana de terminal donde corre el servidor, presiona:

```
Ctrl + C
```

---

## Problemas frecuentes

### `EADDRINUSE: address already in use :::3000`

El puerto 3000 ya está ocupado (otra ventana con el servidor abierto).

- Cierra la otra terminal, **o**
- Cambia `PORT=3001` en `.env` y abre `http://localhost:3001`

### `database: missing_credentials` en `/api/health`

Faltan o están mal `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` en `.env`.

- Usa la **Project URL** (`https://...`), no la cadena `postgresql://...`

### No cargan los servicios en la página

- Confirma que el servidor está corriendo (`npm run dev`)
- Revisa que ejecutaste `supabase/schema.sql` en Supabase

### Los correos no se envían

1. Abre http://localhost:8000/api/health y revisa `"gmail"`.
2. Si falta `GMAIL_REFRESH_TOKEN`, regenera el token:

```powershell
cd "C:\Users\kuri-\Desktop\Car Solution\backend"
npm run gmail:auth
```

3. Copia el `GMAIL_REFRESH_TOKEN=...` → pégalo en `.env`.
4. Reinicia el servidor (`Ctrl+C` y `npm run dev`).
5. Prueba: `npm run gmail:test`

**Tras recuperar tu cuenta Gmail**, verifica en Google Cloud Console que tu correo sigue en **Test users** y que la redirect URI es `http://127.0.0.1:8000`.

---

## Producción (Render)

En internet el servidor lo ejecuta **Render**, no tu PC. Solo sube cambios a GitHub y Render despliega solo.

Variables de entorno de producción se configuran en el panel de Render (no uses el `.env` local allí).

---

## Resumen en 3 comandos

```powershell
cd "C:\Users\kuri-\Desktop\Car Solution\backend"
npm install
npm run dev
```

Luego abre **http://localhost:8000** en el navegador (o el puerto que tengas en `PORT` del `.env`).
