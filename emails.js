const { Resend } = require('resend');
const db = require('./db');

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = 'quiniela@insuranceusa.us';
const FROM_NAME = 'Quiniela Insurance USA 2026';

function getAllUserEmails() {
  return db.prepare('SELECT nombre, email FROM usuarios WHERE es_admin = 0').all();
}

function emailHtml({ nombre, titulo, mensaje, cta_texto, cta_url }) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:30px auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#0a1f4a,#1a3a6b);padding:32px 24px;text-align:center;">
      <div style="font-size:2.5rem;">⚽</div>
      <h1 style="color:white;margin:8px 0 4px;font-size:1.4rem;font-weight:900;">QUINIELA INSURANCE USA</h1>
      <p style="color:rgba(255,255,255,0.75);margin:0;font-size:0.85rem;">Mundial 2026 · EE.UU. · Canadá · México</p>
    </div>

    <!-- Body -->
    <div style="padding:28px 24px;">
      <p style="color:#555;font-size:0.95rem;margin-bottom:8px;">Hola <strong>${nombre}</strong>,</p>
      <h2 style="color:#1a3a6b;font-size:1.2rem;margin:0 0 16px;">${titulo}</h2>
      <p style="color:#444;line-height:1.6;font-size:0.95rem;">${mensaje}</p>

      ${cta_texto && cta_url ? `
      <div style="text-align:center;margin:28px 0;">
        <a href="${cta_url}" style="background:#1a3a6b;color:white;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:1rem;">
          ${cta_texto}
        </a>
      </div>` : ''}

      <!-- Puntos -->
      <div style="background:#f8faff;border-radius:12px;padding:16px;margin-top:20px;border:1.5px solid #d0daea;">
        <p style="font-weight:700;margin:0 0 10px;color:#1a3a6b;font-size:0.9rem;">📋 Sistema de puntos:</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <span style="background:#d4edda;color:#155724;padding:4px 12px;border-radius:20px;font-size:0.82rem;font-weight:700;">🎯 3 pts — Resultado exacto</span>
          <span style="background:#d1ecf1;color:#0c5460;padding:4px 12px;border-radius:20px;font-size:0.82rem;font-weight:700;">🤝 2 pts — Empate</span>
          <span style="background:#fff3cd;color:#856404;padding:4px 12px;border-radius:20px;font-size:0.82rem;font-weight:700;">✓ 1 pt — Ganador</span>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div style="background:#f0f4f8;padding:16px 24px;text-align:center;">
      <p style="color:#888;font-size:0.78rem;margin:0;">
        Insurance USA · +1 (404) 287-8898 · info@insuranceusa.us<br>
        138 Park Avenue, Suite 305a, Winder, GA 30680
      </p>
    </div>
  </div>
</body>
</html>`;
}

async function sendEmail({ to, nombre, asunto, titulo, mensaje, cta_texto, cta_url }) {
  try {
    await resend.emails.send({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to,
      subject: asunto,
      html: emailHtml({ nombre, titulo, mensaje, cta_texto, cta_url }),
    });
    console.log(`[Email] ✅ Enviado a ${to}`);
  } catch (err) {
    console.error(`[Email] ❌ Error enviando a ${to}:`, err.message);
  }
}

// Notificar a todos cuando se abre una nueva fase
async function notificarNuevaFase(fase, fecha) {
  if (!process.env.RESEND_API_KEY) return;
  const usuarios = getAllUserEmails();
  const url = process.env.APP_URL || 'https://quiniela-mundial-2026-rcqj.onrender.com';

  console.log(`[Email] Enviando notificación de nueva fase: ${fase} a ${usuarios.length} usuarios`);

  for (const u of usuarios) {
    await sendEmail({
      to: u.email,
      nombre: u.nombre,
      asunto: `⚽ ¡Ya puedes predecir los ${fase}! - Quiniela Insurance USA 2026`,
      titulo: `🔓 Se abrieron las predicciones: ${fase}`,
      mensaje: `Ya se conocen los equipos clasificados para los <strong>${fase}</strong> del Mundial 2026.
               ¡Entra ahora y haz tus predicciones antes de que empiecen los partidos el <strong>${fecha}</strong>!
               <br><br>Recuerda: si no predices un partido antes de que inicie, obtendrás <strong>0 puntos</strong> en ese juego.`,
      cta_texto: `⚽ Predecir ${fase} ahora`,
      cta_url: url,
    });
    // Pequeña pausa para no saturar la API
    await new Promise(r => setTimeout(r, 200));
  }
}

// Recordatorio 24h antes del cierre de una fase
async function notificarRecordatorio(fase, horasRestantes) {
  if (!process.env.RESEND_API_KEY) return;
  const url = process.env.APP_URL || 'https://quiniela-mundial-2026-rcqj.onrender.com';

  // Solo notificar a usuarios que NO han predicho todos los partidos de esa fase
  const usuarios = db.prepare(`
    SELECT u.nombre, u.email FROM usuarios u
    WHERE u.es_admin = 0
    AND (
      SELECT COUNT(*) FROM predicciones p
      JOIN partidos par ON par.id = p.partido_id
      WHERE p.usuario_id = u.id AND par.fase = ? AND par.completado = 0
    ) < (SELECT COUNT(*) FROM partidos WHERE fase = ? AND completado = 0)
  `).all(fase, fase);

  console.log(`[Email] Recordatorio ${fase}: ${usuarios.length} usuarios sin predicciones completas`);

  for (const u of usuarios) {
    await sendEmail({
      to: u.email,
      nombre: u.nombre,
      asunto: `⚠️ ¡${horasRestantes}h para cerrar predicciones de ${fase}! - Quiniela Insurance USA`,
      titulo: `⏰ ¡Faltan ${horasRestantes} horas!`,
      mensaje: `Tienes predicciones pendientes en los <strong>${fase}</strong> del Mundial 2026.
               Si no las completas antes de que inicien los partidos, <strong>perderás esos puntos</strong>.
               <br><br>¡Entra ahora y no te quedes atrás en la tabla! 🏆`,
      cta_texto: '⚡ Completar mis predicciones',
      cta_url: url,
    });
    await new Promise(r => setTimeout(r, 200));
  }
}

module.exports = { notificarNuevaFase, notificarRecordatorio, sendEmail };
