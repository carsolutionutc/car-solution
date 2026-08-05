const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase = null;

if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
} else {
  console.warn('⚠️  SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no configurados.');
  console.warn('   Crea un archivo .env en la raíz del proyecto (ver .env.example).');
}

function getSupabase() {
  if (!supabase) {
    const err = new Error('Base de datos no configurada. Revisa tu archivo .env');
    err.status = 503;
    throw err;
  }
  return supabase;
}

module.exports = getSupabase;
