const { google } = require('googleapis');
const QRCode = require('qrcode');

function getGmailConfigStatus() {
  const missing = [];
  if (!process.env.GMAIL_CLIENT_ID) missing.push('GMAIL_CLIENT_ID');
  if (!process.env.GMAIL_CLIENT_SECRET) missing.push('GMAIL_CLIENT_SECRET');
  if (!process.env.GMAIL_REFRESH_TOKEN) missing.push('GMAIL_REFRESH_TOKEN');
  if (!process.env.GMAIL_USER) missing.push('GMAIL_USER');
  return { configured: missing.length === 0, missing };
}

function isGmailConfigured() {
  return getGmailConfigStatus().configured;
}

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    process.env.GMAIL_REDIRECT_URI || 'http://127.0.0.1:3333'
  );
}

async function getGmailClient() {
  const auth = getOAuthClient();
  auth.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  return google.gmail({ version: 'v1', auth });
}

function formatMoney(n) {
  return '$' + Number(n).toLocaleString('es-MX') + ' MXN';
}

function getAppUrl() {
  return (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
}

function buildReceiptHtml(data) {
  const extras = data.extrasNombres?.length
    ? data.extrasNombres.join(', ')
    : 'Ninguno';

  const cancelUrl = `${getAppUrl()}/cancelar?folio=${encodeURIComponent(data.folio)}`;
  const bayLine = data.bayNumber ? row('Espacio', `Bahía ${data.bayNumber}`) : '';
  const durLine = data.durationMinutes ? row('Duración est.', `${data.durationMinutes} min`) : '';

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(13,71,161,0.10);">
        <tr>
          <td style="background:#0d47a1;padding:28px 32px;text-align:center;">
            <h1 style="margin:0;color:#fff;font-size:28px;letter-spacing:1px;">Car Solution</h1>
            <p style="margin:8px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">Confirmación de cita</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 8px;color:#6b7280;font-size:14px;">Hola <strong style="color:#1a1a2e;">${data.nombre}</strong>,</p>
            <p style="margin:0 0 24px;color:#374151;font-size:14px;line-height:1.6;">
              Tu cita quedó registrada. Guarda este recibo — tu folio es <strong style="color:#0d47a1;">${data.folio}</strong>.
              Presenta el código QR al llegar (tolerancia de llegada: <strong>${data.toleranceMinutes || 15} minutos</strong>).
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
              <tr>
                <td align="center" style="padding:16px;background:#f8fafc;border-radius:12px;border:1px solid #e5e7eb;">
                  <img src="cid:booking-qr" alt="QR ${data.folio}" width="200" height="200" style="display:block;margin:0 auto 12px;border:0;" />
                  <p style="margin:0;font-size:13px;color:#0d47a1;font-weight:700;letter-spacing:1px;">${data.folio}</p>
                  <p style="margin:6px 0 0;font-size:11px;color:#6b7280;">Escanea en recepción para check-in y salida</p>
                </td>
              </tr>
            </table>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;border-radius:10px;padding:4px 0;">
              ${row('Folio', data.folio)}
              ${row('Servicio', data.servicio)}
              ${row('Vehículo', data.vehiculoTipo)}
              ${row('Tapicería', data.tapiceria)}
              ${row('Extras', extras)}
              ${row('Fecha', data.fecha)}
              ${row('Hora', data.hora)}
              ${bayLine}
              ${durLine}
              ${row('Teléfono', data.telefono)}
              ${row('Total', formatMoney(data.total), true)}
            </table>
            <p style="margin:24px 0 16px;color:#6b7280;font-size:12px;line-height:1.6;">
              Horario de atención: Lunes a Sábado, 8:00 AM – 6:00 PM.
              Si no te presentas dentro de los ${data.toleranceMinutes || 15} min de tolerancia, la cita se cancela automáticamente.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
              <tr>
                <td align="center" style="padding:14px 0;">
                  <a href="${cancelUrl}" style="display:inline-block;background:#ef4444;color:#fff;text-decoration:none;padding:12px 24px;border-radius:100px;font-size:13px;font-weight:700;">
                    Cancelar mi cita
                  </a>
                </td>
              </tr>
              <tr>
                <td align="center" style="font-size:12px;color:#6b7280;">
                  Usa tu folio <strong>${data.folio}</strong> en la página de cancelación.
                </td>
              </tr>
            </table>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;border-radius:10px;padding:8px 0;">
              <tr><td colspan="2" style="padding:12px 20px 8px;font-size:11px;font-weight:700;color:#0d47a1;text-transform:uppercase;letter-spacing:1px;">Contacto</td></tr>
              ${row('Correo', 'carsolutionutc@gmail.com')}
              ${row('Teléfono', '55 3351 9512')}
              ${row('Ubicación', 'Calle 1 Núm 432, Deportivo Pensil, CDMX')}
            </table>
          </td>
        </tr>
        <tr>
          <td style="background:#0d47a1;padding:16px 32px;text-align:center;">
            <p style="margin:0;color:rgba(255,255,255,0.7);font-size:12px;">Car Solution — Servicios de detallado automotriz</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function row(label, value, highlight = false) {
  return `<tr>
    <td style="padding:10px 20px;font-size:13px;color:#6b7280;width:40%;">${label}</td>
    <td style="padding:10px 20px;font-size:13px;color:${highlight ? '#0d47a1' : '#1a1a2e'};font-weight:${highlight ? '700' : '600'};text-align:right;">${value}</td>
  </tr>`;
}

function encodeRawMessage({ to, subject, html, from, qrPngBuffer }) {
  const fromHeader = `Car Solution <${from}>`;
  const encodedSubject = `=?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`;
  const boundary = `mixed_${Date.now()}`;
  const relatedBoundary = `related_${Date.now()}`;

  const htmlB64 = Buffer.from(html).toString('base64').replace(/(.{76})/g, '$1\r\n');
  const qrB64 = qrPngBuffer.toString('base64').replace(/(.{76})/g, '$1\r\n');

  const lines = [
    `From: ${fromHeader}`,
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/related; boundary="${relatedBoundary}"`,
    '',
    `--${relatedBoundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    htmlB64,
    '',
    `--${relatedBoundary}`,
    'Content-Type: image/png; name="qr.png"',
    'Content-Transfer-Encoding: base64',
    'Content-ID: <booking-qr>',
    'Content-Disposition: inline; filename="qr.png"',
    '',
    qrB64,
    '',
    `--${relatedBoundary}--`,
  ];

  // silence unused
  void boundary;

  return Buffer.from(lines.join('\r\n'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function sendRawEmail(gmail, { to, subject, html, qrPngBuffer }) {
  const raw = encodeRawMessage({
    to,
    subject,
    html,
    from: process.env.GMAIL_USER,
    qrPngBuffer,
  });

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw },
  });
}

async function sendBookingReceipt(data) {
  const status = getGmailConfigStatus();
  if (!status.configured) {
    console.warn(`Gmail API no configurado — faltan: ${status.missing.join(', ')}`);
    return { sent: false, reason: 'not_configured', missing: status.missing };
  }

  try {
    const gmail = await getGmailClient();
    const subject = `Car Solution — Confirmación de cita ${data.folio}`;
    const html = buildReceiptHtml(data);
    const qrPngBuffer = await QRCode.toBuffer(String(data.folio), {
      type: 'png',
      width: 280,
      margin: 2,
      errorCorrectionLevel: 'M',
    });

    await sendRawEmail(gmail, { to: data.email, subject, html, qrPngBuffer });

    if (process.env.GMAIL_NOTIFY_TO) {
      const notifyHtml = buildReceiptHtml({ ...data, nombre: `Nueva cita: ${data.nombre}` });
      await sendRawEmail(gmail, {
        to: process.env.GMAIL_NOTIFY_TO,
        subject: `[Admin] Nueva cita ${data.folio} — ${data.nombre}`,
        html: notifyHtml,
        qrPngBuffer,
      });
    }

    return { sent: true };
  } catch (err) {
    console.error('Gmail send error:', err.message);
    const msg = String(err.message || '');
    let reason = msg;
    if (/invalid_grant/i.test(msg)) {
      reason = 'invalid_grant: regenera GMAIL_REFRESH_TOKEN con npm run gmail:auth y actualízalo en Render';
    }
    return { sent: false, reason };
  }
}

function buildOrderReceiptHtml(data) {
  const itemsRows = (data.items || [])
    .map((i) => row(`${i.nombre} × ${i.cantidad}`, formatMoney(i.subtotal)))
    .join('');
  const cancelUrl = `${getAppUrl()}/cancelar?folio=${encodeURIComponent(data.folio)}`;

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(13,71,161,0.10);">
        <tr>
          <td style="background:#0d47a1;padding:28px 32px;text-align:center;">
            <h1 style="margin:0;color:#fff;font-size:28px;letter-spacing:1px;">Car Solution</h1>
            <p style="margin:8px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">Pedido de productos</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 8px;color:#6b7280;font-size:14px;">Hola <strong style="color:#1a1a2e;">${data.nombre}</strong>,</p>
            <p style="margin:0 0 24px;color:#374151;font-size:14px;line-height:1.6;">
              Tu compra quedó registrada. Presenta este código QR en el negocio para recoger tus productos.
              Folio: <strong style="color:#0d47a1;">${data.folio}</strong>.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
              <tr>
                <td align="center" style="padding:16px;background:#f8fafc;border-radius:12px;border:1px solid #e5e7eb;">
                  <img src="cid:booking-qr" alt="QR ${data.folio}" width="200" height="200" style="display:block;margin:0 auto 12px;border:0;" />
                  <p style="margin:0;font-size:13px;color:#0d47a1;font-weight:700;letter-spacing:1px;">${data.folio}</p>
                  <p style="margin:6px 0 0;font-size:11px;color:#6b7280;">Escanea en recepción para confirmar entrega</p>
                </td>
              </tr>
            </table>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;border-radius:10px;padding:4px 0;">
              ${row('Folio', data.folio)}
              ${itemsRows}
              ${row('Total', formatMoney(data.total), true)}
            </table>
            <p style="margin:24px 0 16px;color:#6b7280;font-size:12px;line-height:1.6;">
              Recoge en: Calle 1 Núm 432, Deportivo Pensil, CDMX · Lun–Sáb 8:00 AM – 6:00 PM.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
              <tr>
                <td align="center" style="padding:14px 0;">
                  <a href="${cancelUrl}" style="display:inline-block;background:#ef4444;color:#fff;text-decoration:none;padding:12px 24px;border-radius:100px;font-size:13px;font-weight:700;">
                    Cancelar mi pedido
                  </a>
                </td>
              </tr>
              <tr>
                <td align="center" style="font-size:12px;color:#6b7280;">
                  Usa tu folio <strong>${data.folio}</strong> en la página de cancelación. Solo mientras el pedido esté pendiente de entrega.
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="background:#0d47a1;padding:16px 32px;text-align:center;">
            <p style="margin:0;color:rgba(255,255,255,0.7);font-size:12px;">Car Solution — Tienda de insumos</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendOrderReceipt(data) {
  const status = getGmailConfigStatus();
  if (!status.configured) {
    console.warn(`Gmail API no configurado — faltan: ${status.missing.join(', ')}`);
    return { sent: false, reason: 'not_configured', missing: status.missing };
  }

  try {
    const gmail = await getGmailClient();
    const subject = `Car Solution — Pedido ${data.folio} listo para recoger`;
    const html = buildOrderReceiptHtml(data);
    const qrPngBuffer = await QRCode.toBuffer(String(data.folio), {
      type: 'png',
      width: 280,
      margin: 2,
      errorCorrectionLevel: 'M',
    });

    await sendRawEmail(gmail, { to: data.email, subject, html, qrPngBuffer });

    if (process.env.GMAIL_NOTIFY_TO) {
      await sendRawEmail(gmail, {
        to: process.env.GMAIL_NOTIFY_TO,
        subject: `[Admin] Nuevo pedido ${data.folio} — ${data.nombre}`,
        html: buildOrderReceiptHtml({ ...data, nombre: `Pedido: ${data.nombre}` }),
        qrPngBuffer,
      });
    }

    return { sent: true };
  } catch (err) {
    console.error('Gmail order send error:', err.message);
    const msg = String(err.message || '');
    let reason = msg;
    if (/invalid_grant/i.test(msg)) {
      reason = 'invalid_grant: regenera GMAIL_REFRESH_TOKEN con npm run gmail:auth y actualízalo en Render';
    }
    return { sent: false, reason };
  }
}

module.exports = {
  sendBookingReceipt,
  sendOrderReceipt,
  isGmailConfigured,
  getGmailConfigStatus,
  getOAuthClient,
};
