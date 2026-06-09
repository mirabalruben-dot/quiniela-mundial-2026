const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const db = require('./db');
const { startAutoResults, fetchFinishedMatches } = require('./auto-results');
const { notificarRecordatorio, sendEmail } = require('./emails');

const app = express();
app.set('trust proxy', 1); // Necesario para cookies seguras detrás de Render/proxy
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'quiniela-mundial-2026-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000,
    sameSite: 'none',
    secure: true
  }
}));

const requireAuth = (req, res, next) => {
  if (!req.session.userId) return res.status(401).json({ error: 'No autorizado' });
  next();
};

const requireAdmin = (req, res, next) => {
  if (!req.session.userId || !req.session.esAdmin) return res.status(403).json({ error: 'Acceso denegado' });
  next();
};

// --- AUTH ---
app.post('/api/register', (req, res) => {
  const { nombre, apodo, email, telefono, password } = req.body;
  if (!nombre || !apodo || !email || !password) return res.status(400).json({ error: 'Campos requeridos' });

  const config = db.prepare('SELECT valor FROM configuracion WHERE clave = ?').get('activa');
  if (config?.valor !== '1') return res.status(403).json({ error: 'La quiniela está cerrada para nuevos registros' });

  const hash = bcrypt.hashSync(password, 10);
  try {
    const stmt = db.prepare('INSERT INTO usuarios (nombre, apodo, email, telefono, password) VALUES (?, ?, ?, ?, ?)');
    const result = stmt.run(nombre, apodo.trim(), email, telefono || '', hash);
    req.session.userId = result.lastInsertRowid;
    req.session.nombre = nombre;
    req.session.apodo = apodo.trim();
    req.session.esAdmin = false;
    res.json({ ok: true, nombre, apodo: apodo.trim() });
  } catch (e) {
    if (e.message.includes('apodo')) return res.status(400).json({ error: 'Ese apodo ya está en uso, elige otro' });
    res.status(400).json({ error: 'El email ya está registrado' });
  }
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Email o contraseña incorrectos' });
  }
  req.session.userId = user.id;
  req.session.nombre = user.nombre;
  req.session.apodo = user.apodo;
  req.session.esAdmin = !!user.es_admin;
  res.json({ ok: true, nombre: user.nombre, apodo: user.apodo, esAdmin: !!user.es_admin });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  if (!req.session.userId) return res.json({ loggedIn: false });
  res.json({ loggedIn: true, nombre: req.session.nombre, apodo: req.session.apodo, esAdmin: req.session.esAdmin, userId: req.session.userId });
});

// --- PARTIDOS ---
app.get('/api/partidos', (req, res) => {
  const partidos = db.prepare('SELECT * FROM partidos ORDER BY fase, grupo, fecha, id').all();
  res.json(partidos);
});

// --- PREDICCIONES ---
app.get('/api/predicciones', requireAuth, (req, res) => {
  const preds = db.prepare(`
    SELECT p.*, par.equipo_local, par.equipo_visitante, par.fase, par.grupo, par.fecha
    FROM predicciones p
    JOIN partidos par ON par.id = p.partido_id
    WHERE p.usuario_id = ?
  `).all(req.session.userId);
  res.json(preds);
});

app.post('/api/predicciones', requireAuth, (req, res) => {
  const { predicciones } = req.body; // array de { partido_id, goles_local, goles_visitante }

  const upsert = db.prepare(`
    INSERT INTO predicciones (usuario_id, partido_id, goles_local, goles_visitante)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(usuario_id, partido_id) DO UPDATE SET
      goles_local = excluded.goles_local,
      goles_visitante = excluded.goles_visitante
  `);

  const insertMany = db.transaction((preds) => {
    for (const p of preds) {
      // Verificar que el partido no esté completado
      const partido = db.prepare('SELECT completado FROM partidos WHERE id = ?').get(p.partido_id);
      if (!partido || partido.completado) continue;
      upsert.run(req.session.userId, p.partido_id, p.goles_local, p.goles_visitante);
    }
  });

  insertMany(predicciones);
  res.json({ ok: true });
});

// --- TABLA DE POSICIONES ---
app.get('/api/tabla', (req, res) => {
  const tabla = db.prepare(`
    SELECT
      u.id,
      u.nombre,
      u.apodo,
      COALESCE(SUM(pred.puntos), 0) as puntos_total,
      COUNT(CASE WHEN pred.puntos = 3 THEN 1 END) as exactos,
      COUNT(CASE WHEN pred.puntos = 2 THEN 1 END) as empates,
      COUNT(CASE WHEN pred.puntos = 1 THEN 1 END) as ganador_correcto,
      COUNT(pred.id) as predicciones_total
    FROM usuarios u
    LEFT JOIN predicciones pred ON pred.usuario_id = u.id
    WHERE u.es_admin = 0
    GROUP BY u.id
    ORDER BY puntos_total DESC, exactos DESC, u.apodo ASC
  `).all();

  // Asignar posiciones
  let pos = 1;
  tabla.forEach((row, i) => {
    if (i > 0 && row.puntos_total < tabla[i-1].puntos_total) pos = i + 1;
    row.posicion = pos;
  });

  res.json(tabla);
});

// --- ADMIN: resultados ---
app.post('/api/admin/resultado', requireAdmin, (req, res) => {
  const { partido_id, goles_local, goles_visitante } = req.body;

  db.prepare('UPDATE partidos SET goles_local=?, goles_visitante=?, completado=1 WHERE id=?')
    .run(goles_local, goles_visitante, partido_id);

  // Calcular puntos para todas las predicciones de este partido
  const predicciones = db.prepare('SELECT * FROM predicciones WHERE partido_id = ?').all(partido_id);

  const resultadoLocal = parseInt(goles_local);
  const resultadoVisitante = parseInt(goles_visitante);
  const ganadorReal = resultadoLocal > resultadoVisitante ? 'L' : resultadoVisitante > resultadoLocal ? 'V' : 'E';

  for (const pred of predicciones) {
    let puntos = 0;
    const ganadorPred = pred.goles_local > pred.goles_visitante ? 'L' : pred.goles_visitante > pred.goles_local ? 'V' : 'E';

    if (pred.goles_local === resultadoLocal && pred.goles_visitante === resultadoVisitante) {
      puntos = 3; // Resultado exacto
    } else if (ganadorReal === 'E' && ganadorPred === 'E') {
      puntos = 2; // Acertó el empate
    } else if (ganadorPred === ganadorReal) {
      puntos = 1; // Acertó el ganador
    }

    db.prepare('UPDATE predicciones SET puntos = ? WHERE id = ?').run(puntos, pred.id);
  }

  res.json({ ok: true });
});

app.get('/api/admin/usuarios', requireAdmin, (req, res) => {
  const users = db.prepare('SELECT id, nombre, email, telefono, fecha_registro FROM usuarios WHERE es_admin = 0 ORDER BY nombre').all();
  res.json(users);
});

app.get('/api/admin/config', requireAdmin, (req, res) => {
  const config = db.prepare('SELECT * FROM configuracion').all();
  const obj = {};
  config.forEach(c => obj[c.clave] = c.valor);
  res.json(obj);
});

app.post('/api/admin/config', requireAdmin, (req, res) => {
  const updates = req.body;
  const stmt = db.prepare('UPDATE configuracion SET valor = ? WHERE clave = ?');
  for (const [k, v] of Object.entries(updates)) {
    stmt.run(v, k);
  }
  res.json({ ok: true });
});

app.get('/api/config', (req, res) => {
  const config = db.prepare('SELECT * FROM configuracion').all();
  const obj = {};
  config.forEach(c => obj[c.clave] = c.valor);
  res.json(obj);
});

// Actualizar configuración con valores de Insurance USA
db.prepare("UPDATE configuracion SET valor = ? WHERE clave = 'nombre_quiniela'").run('Quiniela Insurance USA - Mundial 2026');
db.prepare("UPDATE configuracion SET valor = ? WHERE clave = 'costo_participacion'").run('GRATIS');

// Crear admin inicial si no existe
const adminExists = db.prepare('SELECT id FROM usuarios WHERE es_admin = 1').get();
if (!adminExists) {
  const hash = bcrypt.hashSync('Admin2026!', 10);
  db.prepare('INSERT OR IGNORE INTO usuarios (nombre, apodo, email, password, es_admin) VALUES (?, ?, ?, ?, 1)')
    .run('Administrador', 'admin', 'admin@quiniela.com', hash);
  console.log('Admin creado: admin@quiniela.com / Admin2026!');
}

// Email de prueba
app.post('/api/admin/test-email', requireAdmin, async (req, res) => {
  const { email } = req.body;
  await sendEmail({
    to: email,
    nombre: 'Administrador',
    asunto: '✅ Email de prueba - Quiniela Insurance USA 2026',
    titulo: '¡El sistema de emails funciona!',
    mensaje: `Este es un email de prueba enviado desde la Quiniela Insurance USA 2026.
              Los participantes recibirán notificaciones automáticas cuando se abran nuevas fases
              y recordatorios 24 horas antes de que cierren las predicciones.`,
    cta_texto: '⚽ Ver la quiniela',
    cta_url: process.env.APP_URL || 'https://quiniela-mundial-2026-rcqj.onrender.com',
  });
  res.json({ ok: true });
});

// Recrear partidos eliminatorios si faltan
app.post('/api/admin/recrear-eliminatorias', requireAdmin, (req, res) => {
  const count = db.prepare("SELECT COUNT(*) as c FROM partidos WHERE fase != 'Grupos'").get().c;
  if (count > 0) return res.json({ ok: true, msg: `Ya existen ${count} partidos eliminatorios` });

  const i = db.prepare('INSERT INTO partidos (fase,grupo,equipo_local,equipo_visitante,fecha,estadio) VALUES (?,?,?,?,?,?)');
  const partidos = [
    ['Ronda de 32',null,'2do Grupo A','2do Grupo B','2026-06-28 15:00 ET','SoFi Stadium - Los Ángeles'],
    ['Ronda de 32',null,'1ro Grupo E','3er Clasificado','2026-06-29 16:30 ET','Gillette Stadium - Boston'],
    ['Ronda de 32',null,'1ro Grupo F','2do Grupo C','2026-06-29 21:00 ET','Estadio BBVA - Monterrey'],
    ['Ronda de 32',null,'1ro Grupo C','2do Grupo F','2026-06-29 13:00 ET','NRG Stadium - Houston'],
    ['Ronda de 32',null,'1ro Grupo I','3er Clasificado','2026-06-30 17:00 ET','MetLife Stadium - Nueva York/Nueva Jersey'],
    ['Ronda de 32',null,'2do Grupo E','2do Grupo I','2026-06-30 13:00 ET','AT&T Stadium - Dallas'],
    ['Ronda de 32',null,'1ro Grupo A','3er Clasificado','2026-06-30 21:00 ET','Estadio Azteca - Ciudad de México'],
    ['Ronda de 32',null,'1ro Grupo L','3er Clasificado','2026-07-01 12:00 ET','Mercedes-Benz Stadium - Atlanta'],
    ['Ronda de 32',null,'1ro Grupo D','3er Clasificado','2026-07-01 20:00 ET','Levi\'s Stadium - San Francisco'],
    ['Ronda de 32',null,'1ro Grupo G','3er Clasificado','2026-07-01 16:00 ET','Lumen Field - Seattle'],
    ['Ronda de 32',null,'2do Grupo K','2do Grupo L','2026-07-02 19:00 ET','BMO Field - Toronto'],
    ['Ronda de 32',null,'1ro Grupo H','2do Grupo J','2026-07-02 15:00 ET','SoFi Stadium - Los Ángeles'],
    ['Ronda de 32',null,'1ro Grupo B','3er Clasificado','2026-07-02 23:00 ET','BC Place - Vancouver'],
    ['Ronda de 32',null,'1ro Grupo J','2do Grupo H','2026-07-03 18:00 ET','Hard Rock Stadium - Miami'],
    ['Ronda de 32',null,'1ro Grupo K','3er Clasificado','2026-07-03 21:30 ET','Arrowhead Stadium - Kansas City'],
    ['Ronda de 32',null,'2do Grupo D','2do Grupo G','2026-07-03 14:00 ET','AT&T Stadium - Dallas'],
    ['Octavos de Final',null,'Ganador M74','Ganador M77','2026-07-04 17:00 ET','Lincoln Financial Field - Filadelfia'],
    ['Octavos de Final',null,'Ganador M73','Ganador M75','2026-07-04 13:00 ET','NRG Stadium - Houston'],
    ['Octavos de Final',null,'Ganador M76','Ganador M78','2026-07-05 16:00 ET','MetLife Stadium - Nueva York/Nueva Jersey'],
    ['Octavos de Final',null,'Ganador M79','Ganador M80','2026-07-05 20:00 ET','Estadio Azteca - Ciudad de México'],
    ['Octavos de Final',null,'Ganador M83','Ganador M84','2026-07-06 15:00 ET','AT&T Stadium - Dallas'],
    ['Octavos de Final',null,'Ganador M81','Ganador M82','2026-07-06 20:00 ET','Lumen Field - Seattle'],
    ['Octavos de Final',null,'Ganador M86','Ganador M88','2026-07-07 12:00 ET','Mercedes-Benz Stadium - Atlanta'],
    ['Octavos de Final',null,'Ganador M85','Ganador M87','2026-07-07 16:00 ET','BC Place - Vancouver'],
    ['Cuartos de Final',null,'Ganador M89','Ganador M90','2026-07-09 16:00 ET','Gillette Stadium - Boston'],
    ['Cuartos de Final',null,'Ganador M93','Ganador M94','2026-07-10 15:00 ET','SoFi Stadium - Los Ángeles'],
    ['Cuartos de Final',null,'Ganador M91','Ganador M92','2026-07-11 17:00 ET','Hard Rock Stadium - Miami'],
    ['Cuartos de Final',null,'Ganador M95','Ganador M96','2026-07-11 21:00 ET','Arrowhead Stadium - Kansas City'],
    ['Semifinales',null,'Ganador M97','Ganador M98','2026-07-14 15:00 ET','AT&T Stadium - Dallas'],
    ['Semifinales',null,'Ganador M99','Ganador M100','2026-07-15 15:00 ET','Mercedes-Benz Stadium - Atlanta'],
    ['Tercer Lugar',null,'Perdedor M101','Perdedor M102','2026-07-18 17:00 ET','Hard Rock Stadium - Miami'],
    ['Final',null,'Ganador M101','Ganador M102','2026-07-19 15:00 ET','MetLife Stadium - Nueva York/Nueva Jersey'],
  ];
  for (const p of partidos) i.run(...p);
  res.json({ ok: true, msg: `${partidos.length} partidos eliminatorios creados` });
});

// Endpoint admin para forzar actualización manual
app.post('/api/admin/sync-resultados', requireAdmin, async (req, res) => {
  await fetchFinishedMatches();
  res.json({ ok: true, mensaje: 'Sincronización completada' });
});

// Recordatorio automático: cada hora revisa si hay partidos en 24h sin predicciones
function checkRecordatorios() {
  const manana = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const fases = db.prepare(`
    SELECT DISTINCT fase FROM partidos
    WHERE fecha = ? AND completado = 0
    AND equipo_local NOT LIKE 'Ganador%'
    AND equipo_local NOT LIKE '1ro%'
    AND equipo_local NOT LIKE '2do%'
    AND equipo_local NOT LIKE 'Perdedor%'
  `).all(manana);

  for (const { fase } of fases) {
    notificarRecordatorio(fase, 24).catch(console.error);
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Quiniela corriendo en http://localhost:${PORT}`);
  startAutoResults();
  setInterval(checkRecordatorios, 60 * 60 * 1000); // cada hora
});
