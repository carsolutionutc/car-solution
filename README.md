# Car Solution — Plataforma de Detallado Automotriz

Stack: **Node.js + Express + Supabase (PostgreSQL)** · Frontend estático · Deploy en **Render**

## Estructura

```
Car Solution/
├── backend/           → API REST + servidor de archivos estáticos
├── frontend/public/   → Vista usuario (/) y admin (/admin)
├── supabase/schema.sql → Esquema + datos iniciales
├── .env.example       → Variables de entorno
└── render.yaml        → Configuración para Render
```

## 1. Configurar Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com)
2. Ve a **SQL Editor** y ejecuta el contenido de `supabase/schema.sql`
3. En **Project Settings → API**, copia:
   - **Project URL** → `SUPABASE_URL`
   - **service_role key** (secreta) → `SUPABASE_SERVICE_ROLE_KEY`

## 2. Configurar entorno local

```bash
# Copia y edita las variables
cp .env.example .env
```

Edita `.env` con tus credenciales de Supabase y define admin + JWT:

```
ADMIN_EMAIL=admin@ejemplo.com
ADMIN_PASSWORD=tu_contraseña_segura
JWT_SECRET=genera_un_secreto_largo_aleatorio
```

## 3. Instalar y ejecutar

```bash
cd backend
npm install
npm run dev
```

Abre en el navegador:

| URL | Descripción |
|-----|-------------|
| http://localhost:3000 | Vista de usuario (agendar citas) |
| http://localhost:3000/admin | Panel administrador |
| http://localhost:3000/api/health | Estado del servidor |

## 4. Probar el flujo

1. **Usuario:** agenda una cita en la página principal → se guarda en Supabase con folio `CIT-YYYYMMDD-0001`
2. **Admin:** inicia sesión en `/admin` con `ADMIN_EMAIL` / `ADMIN_PASSWORD`
3. Ve KPIs, gráficas y cambia el estado de las citas (pendiente → confirmada → completada)

## 5. Desplegar en Render

1. Sube el repo a GitHub
2. En [render.com](https://render.com) → **New Web Service**
3. Conecta el repo; Render detectará `render.yaml`
4. Agrega las variables de entorno (las mismas del `.env`)
5. Deploy

> **Importante:** usa la `service_role key` solo en el backend (Render). Nunca la expongas en el frontend.

## API

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/api/health` | — | Estado del servidor |
| GET | `/api/services` | — | Catálogo de servicios y extras |
| POST | `/api/bookings` | — | Crear cita |
| POST | `/api/admin/login` | — | Login admin → JWT |
| GET | `/api/admin/analytics` | JWT | KPIs y métricas |
| GET | `/api/admin/bookings` | JWT | Listado de citas |
| PATCH | `/api/admin/bookings/:id/status` | JWT | Cambiar estado |

## 6. Configurar Gmail API (recibo por correo)

### A. Google Cloud Console

1. Ve a [console.cloud.google.com](https://console.cloud.google.com)
2. Crea un proyecto (ej. `car-solution-mail`)
3. **APIs & Services → Library** → busca **Gmail API** → **Enable**
4. **OAuth consent screen**:
   - User Type: **External**
   - App name: `Car Solution`
   - Agrega tu Gmail como **Test user**
5. **Credentials → Create Credentials → OAuth client ID**:
   - Type: **Web application**
   - Authorized redirect URI: `http://127.0.0.1:3333`
6. Copia **Client ID** y **Client Secret** a tu `.env`:

```
GMAIL_CLIENT_ID=xxx.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=GOCSPX-xxx
GMAIL_USER=carsolutionutc@gmail.com
GMAIL_NOTIFY_TO=carsolutionutc@gmail.com
```

### B. Obtener refresh token (una sola vez, en local)

```bash
cd backend
npm run gmail:auth
```

1. Abre la URL que imprime la terminal
2. Autoriza con la cuenta Gmail del negocio
3. Copia el `GMAIL_REFRESH_TOKEN` que aparece → pégalo en `.env`

### C. Variables en Render

Agrega las mismas variables Gmail en **Environment** del servicio (marca como Secret las sensibles):

| Variable | Descripción |
|----------|-------------|
| `GMAIL_CLIENT_ID` | OAuth Client ID |
| `GMAIL_CLIENT_SECRET` | OAuth Client Secret |
| `GMAIL_REFRESH_TOKEN` | Token del script `gmail:auth` |
| `GMAIL_USER` | Correo que envía (ej. carsolutionutc@gmail.com) |
| `GMAIL_NOTIFY_TO` | Opcional — copia al negocio en cada cita |

> El refresh token se genera en local; no hace falta repetir el script en Render.

## 7. Subir cambios a GitHub

```powershell
cd "C:\Users\User\Desktop\Car Solution"

git add .
git commit -m "Rebrand Car Solution, quitar tabla precios, recibo por Gmail API"
git push origin main
```

Si usas la cuenta `carsolutionutc` con SSH:

```powershell
git remote set-url origin git@github-carsolution:carsolutionutc/car-solution.git
git push origin main
```

## Archivo original

`lavadaautos2422.html` se conserva como referencia. La app activa está en `frontend/public/`.
