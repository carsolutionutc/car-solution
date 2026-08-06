/**
 * Script de una sola vez para obtener GMAIL_REFRESH_TOKEN.
 *
 * 1. Configura en .env: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET
 * 2. En Google Cloud → OAuth client, redirect URI: http://127.0.0.1:3333
 * 3. Ejecuta: npm run gmail:auth
 * 4. Copia el refresh token a .env y Render
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const http = require('http');
const { URL } = require('url');
const { google } = require('googleapis');

const PORT = 8000;
const REDIRECT_URI = process.env.GMAIL_REDIRECT_URI || `http://127.0.0.1:${PORT}`;
const SCOPES = ['https://www.googleapis.com/auth/gmail.send'];

if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_CLIENT_SECRET) {
  console.error('\n❌ Falta GMAIL_CLIENT_ID o GMAIL_CLIENT_SECRET en .env\n');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  REDIRECT_URI
);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: SCOPES,
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI);

  if (url.pathname !== '/') {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    res.writeHead(400);
    res.end(`Error OAuth: ${error}`);
    console.error('\n❌ OAuth error:', error);
    server.close();
    process.exit(1);
  }

  if (!code) {
    res.writeHead(400);
    res.end('Falta código de autorización');
    return;
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>Autorización exitosa</h1><p>Puedes cerrar esta ventana y volver a la terminal.</p>');

    console.log('\n✅ Tokens obtenidos. Agrega esto a tu .env y Render:\n');
    console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log(`GMAIL_USER=tu-correo@gmail.com`);
    console.log(`GMAIL_REDIRECT_URI=${REDIRECT_URI}`);
    console.log('\n⚠️  El refresh token solo se muestra una vez. Guárdalo ahora.\n');

    server.close();
    process.exit(0);
  } catch (err) {
    res.writeHead(500);
    res.end('Error al obtener tokens');
    console.error('\n❌', err.message);
    server.close();
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log('\n📧 Gmail OAuth — Car Solution\n');
  console.log('⚠️  En Google Cloud, la URI autorizada debe ser EXACTAMENTE:\n');
  console.log(`   ${REDIRECT_URI}\n`);
  console.log('1. Abre esta URL en el navegador (cuenta Gmail del negocio):\n');
  console.log(authUrl);
  console.log('\n2. Autoriza el acceso y espera la redirección automática.\n');
});
