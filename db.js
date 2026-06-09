const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// En Render usar disco persistente, en local usar directorio del proyecto
const DB_DIR = process.env.RENDER ? '/var/data' : __dirname;
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(path.join(DB_DIR, 'quiniela.db'));

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
insertConfig.run('puntos_empate_correcto', '2');
insertConfig.run('puntos_ganador_correcto', '1');

// Resetear partidos si son los viejos (versión incorrecta)
const firstPartido = db.prepare("SELECT equipo_local FROM partidos LIMIT 1").get();
if (firstPartido && firstPartido.equipo_local === 'México' &&
    !db.prepare("SELECT id FROM partidos WHERE equipo_local='Sudáfrica' OR equipo_local='Sudáfrica'").get()) {
  db.prepare('DELETE FROM partidos').run();
  db.prepare('DELETE FROM predicciones').run();
  console.log('Partidos viejos eliminados, insertando partidos correctos del Mundial 2026');
}

// Insertar partidos de grupo si no existen
const countPartidos = db.prepare('SELECT COUNT(*) as cnt FROM partidos').get();
if (countPartidos.cnt === 0) {
  const insertPartido = db.prepare(`
    INSERT INTO partidos (fase, grupo, equipo_local, equipo_visitante, fecha, estadio)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const partidosGrupo = [
    // GRUPO A: México, Sudáfrica, Corea del Sur, Chequia
    ['Grupos', 'A', 'México', 'Sudáfrica', '2026-06-11', 'Estadio Azteca'],
    ['Grupos', 'A', 'Corea del Sur', 'Chequia', '2026-06-11', 'SoFi Stadium'],
    ['Grupos', 'A', 'México', 'Chequia', '2026-06-15', 'Estadio Azteca'],
    ['Grupos', 'A', 'Sudáfrica', 'Corea del Sur', '2026-06-15', 'SoFi Stadium'],
    ['Grupos', 'A', 'Chequia', 'Sudáfrica', '2026-06-19', 'Rose Bowl'],
    ['Grupos', 'A', 'Corea del Sur', 'México', '2026-06-19', 'Estadio Azteca'],
    // GRUPO B: Canadá, Bosnia-Herzegovina, Qatar, Suiza
    ['Grupos', 'B', 'Canadá', 'Bosnia-Herzegovina', '2026-06-12', 'BMO Field'],
    ['Grupos', 'B', 'Qatar', 'Suiza', '2026-06-12', 'BC Place'],
    ['Grupos', 'B', 'Canadá', 'Qatar', '2026-06-16', 'BMO Field'],
    ['Grupos', 'B', 'Bosnia-Herzegovina', 'Suiza', '2026-06-16', 'BC Place'],
    ['Grupos', 'B', 'Suiza', 'Canadá', '2026-06-20', 'BC Place'],
    ['Grupos', 'B', 'Bosnia-Herzegovina', 'Qatar', '2026-06-20', 'BMO Field'],
    // GRUPO C: Brasil, Marruecos, Haití, Escocia
    ['Grupos', 'C', 'Brasil', 'Marruecos', '2026-06-13', 'MetLife Stadium'],
    ['Grupos', 'C', 'Haití', 'Escocia', '2026-06-13', 'AT&T Stadium'],
    ['Grupos', 'C', 'Brasil', 'Haití', '2026-06-17', 'MetLife Stadium'],
    ['Grupos', 'C', 'Marruecos', 'Escocia', '2026-06-17', 'AT&T Stadium'],
    ['Grupos', 'C', 'Escocia', 'Brasil', '2026-06-21', 'MetLife Stadium'],
    ['Grupos', 'C', 'Marruecos', 'Haití', '2026-06-21', 'AT&T Stadium'],
    // GRUPO D: EE.UU., Australia, Paraguay, Turquía
    ['Grupos', 'D', 'EE.UU.', 'Australia', '2026-06-13', 'SoFi Stadium'],
    ['Grupos', 'D', 'Paraguay', 'Turquía', '2026-06-13', 'Hard Rock Stadium'],
    ['Grupos', 'D', 'EE.UU.', 'Paraguay', '2026-06-17', 'SoFi Stadium'],
    ['Grupos', 'D', 'Australia', 'Turquía', '2026-06-17', 'Hard Rock Stadium'],
    ['Grupos', 'D', 'Turquía', 'EE.UU.', '2026-06-21', 'SoFi Stadium'],
    ['Grupos', 'D', 'Australia', 'Paraguay', '2026-06-21', 'Hard Rock Stadium'],
    // GRUPO E: Alemania, Ecuador, Costa de Marfil, Curazao
    ['Grupos', 'E', 'Alemania', 'Ecuador', '2026-06-14', 'Levi\'s Stadium'],
    ['Grupos', 'E', 'Costa de Marfil', 'Curazao', '2026-06-14', 'Arrowhead Stadium'],
    ['Grupos', 'E', 'Alemania', 'Costa de Marfil', '2026-06-18', 'Levi\'s Stadium'],
    ['Grupos', 'E', 'Ecuador', 'Curazao', '2026-06-18', 'Arrowhead Stadium'],
    ['Grupos', 'E', 'Curazao', 'Alemania', '2026-06-22', 'Levi\'s Stadium'],
    ['Grupos', 'E', 'Ecuador', 'Costa de Marfil', '2026-06-22', 'Arrowhead Stadium'],
    // GRUPO F: Japón, Países Bajos, Suecia, Túnez
    ['Grupos', 'F', 'Japón', 'Países Bajos', '2026-06-14', 'Gillette Stadium'],
    ['Grupos', 'F', 'Suecia', 'Túnez', '2026-06-14', 'Lincoln Financial Field'],
    ['Grupos', 'F', 'Japón', 'Suecia', '2026-06-18', 'Gillette Stadium'],
    ['Grupos', 'F', 'Países Bajos', 'Túnez', '2026-06-18', 'Lincoln Financial Field'],
    ['Grupos', 'F', 'Túnez', 'Japón', '2026-06-22', 'Gillette Stadium'],
    ['Grupos', 'F', 'Suecia', 'Países Bajos', '2026-06-22', 'Lincoln Financial Field'],
    // GRUPO G: Bélgica, Egipto, Irán, Nueva Zelanda
    ['Grupos', 'G', 'Bélgica', 'Egipto', '2026-06-15', 'Soldier Field'],
    ['Grupos', 'G', 'Irán', 'Nueva Zelanda', '2026-06-15', 'Lumen Field'],
    ['Grupos', 'G', 'Bélgica', 'Irán', '2026-06-19', 'Soldier Field'],
    ['Grupos', 'G', 'Egipto', 'Nueva Zelanda', '2026-06-19', 'Lumen Field'],
    ['Grupos', 'G', 'Nueva Zelanda', 'Bélgica', '2026-06-23', 'Soldier Field'],
    ['Grupos', 'G', 'Egipto', 'Irán', '2026-06-23', 'Lumen Field'],
    // GRUPO H: España, Arabia Saudita, Uruguay, Cabo Verde
    ['Grupos', 'H', 'España', 'Arabia Saudita', '2026-06-15', 'Rose Bowl'],
    ['Grupos', 'H', 'Uruguay', 'Cabo Verde', '2026-06-15', 'NRG Stadium'],
    ['Grupos', 'H', 'España', 'Uruguay', '2026-06-19', 'Rose Bowl'],
    ['Grupos', 'H', 'Arabia Saudita', 'Cabo Verde', '2026-06-19', 'NRG Stadium'],
    ['Grupos', 'H', 'Cabo Verde', 'España', '2026-06-23', 'Rose Bowl'],
    ['Grupos', 'H', 'Arabia Saudita', 'Uruguay', '2026-06-23', 'NRG Stadium'],
    // GRUPO I: Francia, Senegal, Noruega, Irak
    ['Grupos', 'I', 'Francia', 'Senegal', '2026-06-16', 'MetLife Stadium'],
    ['Grupos', 'I', 'Noruega', 'Irak', '2026-06-16', 'AT&T Stadium'],
    ['Grupos', 'I', 'Francia', 'Noruega', '2026-06-20', 'MetLife Stadium'],
    ['Grupos', 'I', 'Senegal', 'Irak', '2026-06-20', 'AT&T Stadium'],
    ['Grupos', 'I', 'Irak', 'Francia', '2026-06-24', 'MetLife Stadium'],
    ['Grupos', 'I', 'Senegal', 'Noruega', '2026-06-24', 'AT&T Stadium'],
    // GRUPO J: Argentina, Argelia, Austria, Jordania
    ['Grupos', 'J', 'Argentina', 'Argelia', '2026-06-16', 'Hard Rock Stadium'],
    ['Grupos', 'J', 'Austria', 'Jordania', '2026-06-16', 'SoFi Stadium'],
    ['Grupos', 'J', 'Argentina', 'Austria', '2026-06-20', 'Hard Rock Stadium'],
    ['Grupos', 'J', 'Argelia', 'Jordania', '2026-06-20', 'SoFi Stadium'],
    ['Grupos', 'J', 'Jordania', 'Argentina', '2026-06-24', 'Hard Rock Stadium'],
    ['Grupos', 'J', 'Argelia', 'Austria', '2026-06-24', 'SoFi Stadium'],
    // GRUPO K: Portugal, Colombia, Congo DR, Uzbekistán
    ['Grupos', 'K', 'Portugal', 'Colombia', '2026-06-17', 'Levi\'s Stadium'],
    ['Grupos', 'K', 'Congo DR', 'Uzbekistán', '2026-06-17', 'BC Place'],
    ['Grupos', 'K', 'Portugal', 'Congo DR', '2026-06-21', 'Levi\'s Stadium'],
    ['Grupos', 'K', 'Colombia', 'Uzbekistán', '2026-06-21', 'BC Place'],
    ['Grupos', 'K', 'Uzbekistán', 'Portugal', '2026-06-25', 'Levi\'s Stadium'],
    ['Grupos', 'K', 'Congo DR', 'Colombia', '2026-06-25', 'BC Place'],
    // GRUPO L: Inglaterra, Croacia, Panamá, Ghana
    ['Grupos', 'L', 'Inglaterra', 'Croacia', '2026-06-17', 'Gillette Stadium'],
    ['Grupos', 'L', 'Panamá', 'Ghana', '2026-06-17', 'BMO Field'],
    ['Grupos', 'L', 'Inglaterra', 'Panamá', '2026-06-21', 'Gillette Stadium'],
    ['Grupos', 'L', 'Croacia', 'Ghana', '2026-06-21', 'BMO Field'],
    ['Grupos', 'L', 'Ghana', 'Inglaterra', '2026-06-25', 'Gillette Stadium'],
    ['Grupos', 'L', 'Croacia', 'Panamá', '2026-06-25', 'BMO Field'],
  ];

  for (const p of partidosGrupo) {
    insertPartido.run(...p);
  }
}

module.exports = db;
