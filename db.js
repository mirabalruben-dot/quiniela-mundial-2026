const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'quiniela.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    apodo TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    telefono TEXT,
    password TEXT NOT NULL,
    es_admin INTEGER DEFAULT 0,
    fecha_registro TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS partidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fase TEXT NOT NULL,
    grupo TEXT,
    equipo_local TEXT NOT NULL,
    equipo_visitante TEXT NOT NULL,
    fecha TEXT,
    estadio TEXT,
    goles_local INTEGER,
    goles_visitante INTEGER,
    completado INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS predicciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL,
    partido_id INTEGER NOT NULL,
    goles_local INTEGER NOT NULL,
    goles_visitante INTEGER NOT NULL,
    puntos INTEGER DEFAULT 0,
    UNIQUE(usuario_id, partido_id),
    FOREIGN KEY(usuario_id) REFERENCES usuarios(id),
    FOREIGN KEY(partido_id) REFERENCES partidos(id)
  );

  CREATE TABLE IF NOT EXISTS configuracion (
    clave TEXT PRIMARY KEY,
    valor TEXT
  );
`);

// Configuración por defecto
const insertConfig = db.prepare(`INSERT OR IGNORE INTO configuracion (clave, valor) VALUES (?, ?)`);
insertConfig.run('nombre_quiniela', 'Quiniela Insurance USA - Mundial 2026');
insertConfig.run('premio_1', 'Por definir');
insertConfig.run('premio_2', 'Por definir');
insertConfig.run('premio_3', 'Por definir');
insertConfig.run('costo_participacion', 'GRATIS');
insertConfig.run('activa', '1');
insertConfig.run('puntos_resultado_exacto', '3');
insertConfig.run('puntos_ganador_correcto', '1');

// Insertar partidos de grupo si no existen
const countPartidos = db.prepare('SELECT COUNT(*) as cnt FROM partidos').get();
if (countPartidos.cnt === 0) {
  const insertPartido = db.prepare(`
    INSERT INTO partidos (fase, grupo, equipo_local, equipo_visitante, fecha, estadio)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const partidosGrupo = [
    // Grupo A
    ['Grupos', 'A', 'México', 'Ecuador', '2026-06-11', 'Estadio Azteca'],
    ['Grupos', 'A', 'Jamaica', 'Venezuela', '2026-06-11', 'SoFi Stadium'],
    ['Grupos', 'A', 'México', 'Jamaica', '2026-06-15', 'Estadio Azteca'],
    ['Grupos', 'A', 'Venezuela', 'Ecuador', '2026-06-15', 'Rose Bowl'],
    ['Grupos', 'A', 'Ecuador', 'Jamaica', '2026-06-19', 'SoFi Stadium'],
    ['Grupos', 'A', 'Venezuela', 'México', '2026-06-19', 'Estadio Azteca'],
    // Grupo B
    ['Grupos', 'B', 'EE.UU.', 'Panamá', '2026-06-12', 'AT&T Stadium'],
    ['Grupos', 'B', 'Honduras', 'Cuba', '2026-06-12', 'SoFi Stadium'],
    ['Grupos', 'B', 'EE.UU.', 'Honduras', '2026-06-16', 'AT&T Stadium'],
    ['Grupos', 'B', 'Cuba', 'Panamá', '2026-06-16', 'Rose Bowl'],
    ['Grupos', 'B', 'Panamá', 'Honduras', '2026-06-20', 'AT&T Stadium'],
    ['Grupos', 'B', 'Cuba', 'EE.UU.', '2026-06-20', 'Rose Bowl'],
    // Grupo C
    ['Grupos', 'C', 'Canadá', 'Chile', '2026-06-12', 'BMO Field'],
    ['Grupos', 'C', 'Perú', 'Trinidad y Tobago', '2026-06-12', 'BC Place'],
    ['Grupos', 'C', 'Canadá', 'Perú', '2026-06-16', 'BMO Field'],
    ['Grupos', 'C', 'Trinidad y Tobago', 'Chile', '2026-06-16', 'BC Place'],
    ['Grupos', 'C', 'Chile', 'Perú', '2026-06-20', 'BC Place'],
    ['Grupos', 'C', 'Trinidad y Tobago', 'Canadá', '2026-06-20', 'BMO Field'],
    // Grupo D
    ['Grupos', 'D', 'Argentina', 'Bolivia', '2026-06-13', 'Hard Rock Stadium'],
    ['Grupos', 'D', 'Guatemala', 'Haití', '2026-06-13', 'AT&T Stadium'],
    ['Grupos', 'D', 'Argentina', 'Guatemala', '2026-06-17', 'Hard Rock Stadium'],
    ['Grupos', 'D', 'Haití', 'Bolivia', '2026-06-17', 'AT&T Stadium'],
    ['Grupos', 'D', 'Bolivia', 'Guatemala', '2026-06-21', 'Hard Rock Stadium'],
    ['Grupos', 'D', 'Haití', 'Argentina', '2026-06-21', 'AT&T Stadium'],
    // Grupo E
    ['Grupos', 'E', 'Brasil', 'Colombia', '2026-06-13', 'Levi\'s Stadium'],
    ['Grupos', 'E', 'Paraguay', 'Costa Rica', '2026-06-13', 'SoFi Stadium'],
    ['Grupos', 'E', 'Brasil', 'Paraguay', '2026-06-17', 'Levi\'s Stadium'],
    ['Grupos', 'E', 'Costa Rica', 'Colombia', '2026-06-17', 'SoFi Stadium'],
    ['Grupos', 'E', 'Colombia', 'Paraguay', '2026-06-21', 'SoFi Stadium'],
    ['Grupos', 'E', 'Costa Rica', 'Brasil', '2026-06-21', 'Levi\'s Stadium'],
    // Grupo F
    ['Grupos', 'F', 'Francia', 'Marruecos', '2026-06-14', 'MetLife Stadium'],
    ['Grupos', 'F', 'Bélgica', 'Italia', '2026-06-14', 'Gillette Stadium'],
    ['Grupos', 'F', 'Francia', 'Bélgica', '2026-06-18', 'MetLife Stadium'],
    ['Grupos', 'F', 'Italia', 'Marruecos', '2026-06-18', 'Gillette Stadium'],
    ['Grupos', 'F', 'Marruecos', 'Bélgica', '2026-06-22', 'MetLife Stadium'],
    ['Grupos', 'F', 'Italia', 'Francia', '2026-06-22', 'Gillette Stadium'],
    // Grupo G
    ['Grupos', 'G', 'España', 'Croacia', '2026-06-14', 'SoFi Stadium'],
    ['Grupos', 'G', 'Portugal', 'Serbia', '2026-06-14', 'Rose Bowl'],
    ['Grupos', 'G', 'España', 'Portugal', '2026-06-18', 'SoFi Stadium'],
    ['Grupos', 'G', 'Serbia', 'Croacia', '2026-06-18', 'Rose Bowl'],
    ['Grupos', 'G', 'Croacia', 'Portugal', '2026-06-22', 'SoFi Stadium'],
    ['Grupos', 'G', 'Serbia', 'España', '2026-06-22', 'Rose Bowl'],
    // Grupo H
    ['Grupos', 'H', 'Alemania', 'Dinamarca', '2026-06-15', 'Soldier Field'],
    ['Grupos', 'H', 'Países Bajos', 'Polonia', '2026-06-15', 'Arrowhead Stadium'],
    ['Grupos', 'H', 'Alemania', 'Países Bajos', '2026-06-19', 'Soldier Field'],
    ['Grupos', 'H', 'Polonia', 'Dinamarca', '2026-06-19', 'Arrowhead Stadium'],
    ['Grupos', 'H', 'Dinamarca', 'Países Bajos', '2026-06-23', 'Arrowhead Stadium'],
    ['Grupos', 'H', 'Polonia', 'Alemania', '2026-06-23', 'Soldier Field'],
    // Grupo I
    ['Grupos', 'I', 'Inglaterra', 'Nigeria', '2026-06-15', 'MetLife Stadium'],
    ['Grupos', 'I', 'Irán', 'Egipto', '2026-06-15', 'Lincoln Financial Field'],
    ['Grupos', 'I', 'Inglaterra', 'Irán', '2026-06-19', 'MetLife Stadium'],
    ['Grupos', 'I', 'Egipto', 'Nigeria', '2026-06-19', 'Lincoln Financial Field'],
    ['Grupos', 'I', 'Nigeria', 'Irán', '2026-06-23', 'MetLife Stadium'],
    ['Grupos', 'I', 'Egipto', 'Inglaterra', '2026-06-23', 'Lincoln Financial Field'],
    // Grupo J
    ['Grupos', 'J', 'Japón', 'Arabia Saudita', '2026-06-16', 'SoFi Stadium'],
    ['Grupos', 'J', 'Corea del Sur', 'Australia', '2026-06-16', 'Lumen Field'],
    ['Grupos', 'J', 'Japón', 'Corea del Sur', '2026-06-20', 'SoFi Stadium'],
    ['Grupos', 'J', 'Australia', 'Arabia Saudita', '2026-06-20', 'Lumen Field'],
    ['Grupos', 'J', 'Arabia Saudita', 'Corea del Sur', '2026-06-24', 'Lumen Field'],
    ['Grupos', 'J', 'Australia', 'Japón', '2026-06-24', 'SoFi Stadium'],
    // Grupo K
    ['Grupos', 'K', 'Uruguay', 'Ecuador', '2026-06-16', 'Hard Rock Stadium'],
    ['Grupos', 'K', 'Bolivia', 'Senegal', '2026-06-16', 'AT&T Stadium'],
    ['Grupos', 'K', 'Uruguay', 'Bolivia', '2026-06-20', 'Hard Rock Stadium'],
    ['Grupos', 'K', 'Senegal', 'Ecuador', '2026-06-20', 'AT&T Stadium'],
    ['Grupos', 'K', 'Ecuador', 'Bolivia', '2026-06-24', 'Hard Rock Stadium'],
    ['Grupos', 'K', 'Senegal', 'Uruguay', '2026-06-24', 'AT&T Stadium'],
    // Grupo L
    ['Grupos', 'L', 'Turquía', 'Rumania', '2026-06-17', 'AT&T Stadium'],
    ['Grupos', 'L', 'Ucrania', 'Albania', '2026-06-17', 'NRG Stadium'],
    ['Grupos', 'L', 'Turquía', 'Ucrania', '2026-06-21', 'AT&T Stadium'],
    ['Grupos', 'L', 'Albania', 'Rumania', '2026-06-21', 'NRG Stadium'],
    ['Grupos', 'L', 'Rumania', 'Ucrania', '2026-06-25', 'NRG Stadium'],
    ['Grupos', 'L', 'Albania', 'Turquía', '2026-06-25', 'AT&T Stadium'],
  ];

  for (const p of partidosGrupo) {
    insertPartido.run(...p);
  }
}

module.exports = db;
