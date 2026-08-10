require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const { getGmailConfigStatus, sendBookingReceipt } = require('../services/gmail');

const status = getGmailConfigStatus();

console.log('\n📧 Diagnóstico Gmail — Car Solution\n');

if (!status.configured) {
  console.log('❌ Faltan variables en .env:');
  status.missing.forEach((f) => console.log(`   - ${f}`));
  console.log('\nSi falta GMAIL_REFRESH_TOKEN, ejecuta: npm run gmail:auth\n');
  process.exit(1);
}

console.log('✓ Variables de entorno OK');
console.log(`  GMAIL_USER: ${process.env.GMAIL_USER}`);
console.log('\nEnviando correo de prueba...\n');

sendBookingReceipt({
  folio: 'CIT-TEST-0001',
  nombre: 'Prueba Car Solution',
  email: process.env.GMAIL_USER,
  telefono: '55 3351 9512',
  servicio: 'Intermedio',
  vehiculoTipo: 'Auto / Sedan',
  tapiceria: 'Tela',
  extrasNombres: [],
  fecha: new Date().toISOString().split('T')[0],
  hora: '10:00',
  total: 200,
})
  .then((result) => {
    if (result.sent) {
      console.log('✅ Correo enviado correctamente. Revisa la bandeja de:', process.env.GMAIL_USER);
    } else {
      console.log('❌ Error:', result.reason);
      console.log('\nPosibles causas:');
      console.log('  - Refresh token revocado (vuelve a ejecutar npm run gmail:auth)');
      console.log('  - Cuenta Gmail aún restringida tras la apelación');
      console.log('  - OAuth consent screen: agrega tu correo como Test user');
    }
    process.exit(result.sent ? 0 : 1);
  })
  .catch((err) => {
    console.error('❌', err.message);
    process.exit(1);
  });
