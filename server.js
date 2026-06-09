const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const db = require('./db');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'quiniela-mundial-2026-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
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
  const { nombre, email, telefono, password } = req.body;
  if (!nombre || !email || !password) return res.status(400).json({ error: 'Campos requeridos' });

  const config = db.prepare('SELECT valor FROM configuracion WHERE clave = ?').get('activa');
  if (config?.valor !== '1') return res.status(403).json({ error: 'La quiniela está cerrada para nuevos registros' });

  const hash = bcrypt.hashSync(password, 10);
  try {
    const stmt = db.prepare('INSERT INTO usuarios (nombre, email, telefono, password) VALUES (?, ?, ?, ?)');
    const result = stmt.run(nombre, email, telefono || '', hash);
    req.session.userId = result.lastInsertRowid;
    req.session.nombre = nombre;
    req.session.esAdmin = false;
    res.json({ ok: true, nombre });
  } catch (e) {
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
  req.session.esAdmin = !!user.es_admin;
  res.json({ ok: true, nombre: user.nombre, esAdmin: !!user.es_admin });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  if (!req.session.userId) return res.json({ loggedIn: false });
  res.json({ loggedIn: true, nombre: req.session.nombre, esAdmin: req.session.esAdmin, userId: req.session.userId });
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
      COALESCE(SUM(pred.puntos), 0) as puntos_total,
      COUNT(CASE WHEN pred.puntos = 3 THEN 1 END) as exactos,
      COUNT(CASE WHEN pred.puntos = 1 THEN 1 END) as ganador_correcto,
      COUNT(pred.id) as predicciones_total
    FROM usuarios u
    LEFT JOIN predicciones pred ON pred.usuario_id = u.id
    WHERE u.es_admin = 0
    GROUP BY u.id
    ORDER BY puntos_total DESC, exactos DESC, u.nombre ASC
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
    } else if (ganadorPred === ganadorReal) {
      puntos = 1; // Solo ganador correcto
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

// Crear admin inicial si no existe
const adminExists = db.prepare('SELECT id FROM usuarios WHERE es_admin = 1').get();
if (!adminExists) {
  const hash = bcrypt.hashSync('Admin2026!', 10);
  db.prepare('INSERT OR IGNORE INTO usuarios (nombre, email, password, es_admin) VALUES (?, ?, ?, 1)')
    .run('Administrador', 'admin@quiniela.com', hash);
  console.log('Admin creado: admin@quiniela.com / Admin2026!');
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Quiniela corriendo en http://localhost:${PORT}`));
