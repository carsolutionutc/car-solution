const jwt = require('jsonwebtoken');

function requireAdmin(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido' });
  }

  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.role !== 'admin') {
      return res.status(403).json({ error: 'Acceso denegado' });
    }
    req.admin = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

function requireCustomer(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Inicia sesión con Google para continuar' });
  }

  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.role !== 'customer' || !payload.customerId) {
      return res.status(403).json({ error: 'Acceso de cliente requerido' });
    }
    req.customer = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Sesión expirada. Vuelve a iniciar sesión' });
  }
}

/** Optional: attaches customer if token present, otherwise continues */
function optionalCustomer(req, _res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next();
  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.role === 'customer' && payload.customerId) {
      req.customer = payload;
    }
  } catch {
    // ignore
  }
  next();
}

module.exports = { requireAdmin, requireCustomer, optionalCustomer };
