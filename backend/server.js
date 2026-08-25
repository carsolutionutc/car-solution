require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const path = require('path');

const servicesRouter = require('./routes/services');
const bookingsRouter = require('./routes/bookings');
const adminRouter = require('./routes/admin');
const inventoryRouter = require('./routes/inventory');
const authRouter = require('./routes/auth');
const productsRouter = require('./routes/products');
const { getGmailConfigStatus } = require('./services/gmail');
const { startAutoCancelJob } = require('./jobs/autoCancel');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  let database = 'missing_credentials';

  if (url && key) {
    if (url.startsWith('postgresql://') || url.startsWith('postgres://')) {
      database = 'invalid_url_use_https_project_url';
    } else if (!url.startsWith('https://') || !url.includes('.supabase.co')) {
      database = 'invalid_supabase_url';
    } else if (!key.startsWith('eyJ')) {
      database = 'invalid_service_role_key';
    } else {
      database = 'configured';
    }
  }

  const gmail = getGmailConfigStatus();

  res.json({
    status: 'ok',
    database,
    emailEnabled: gmail.enabled,
    gmail: gmail.configured ? 'configured' : { status: 'missing', fields: gmail.missing },
    googleAuth: Boolean(process.env.GOOGLE_CLIENT_ID || process.env.GMAIL_CLIENT_ID),
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/services', servicesRouter);
app.use('/api/bookings', bookingsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/admin/inventory', inventoryRouter);
app.use('/api/auth', authRouter);
app.use('/api/products', productsRouter);

const publicDir = path.join(__dirname, '..', 'frontend', 'public');
app.use(express.static(publicDir));

app.get('/admin', (_req, res) => {
  res.sendFile(path.join(publicDir, 'admin.html'));
});

app.get('/admin/gestion', (_req, res) => {
  res.sendFile(path.join(publicDir, 'gestion.html'));
});

app.get('/productos', (_req, res) => {
  res.sendFile(path.join(publicDir, 'productos.html'));
});

app.get('/carrito', (_req, res) => {
  res.sendFile(path.join(publicDir, 'carrito.html'));
});

app.get('/cuenta', (_req, res) => {
  res.sendFile(path.join(publicDir, 'cuenta.html'));
});

app.get('/cancelar', (_req, res) => {
  res.sendFile(path.join(publicDir, 'cancelar.html'));
});

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🚗 Car Solution API`);
  console.log(`   Local:  http://localhost:${PORT}`);
  console.log(`   Admin:  http://localhost:${PORT}/admin`);
  console.log(`   Gestión: http://localhost:${PORT}/admin/gestion`);
  console.log(`   Health: http://localhost:${PORT}/api/health\n`);
  startAutoCancelJob();
});
