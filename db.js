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

// Resetear partidos si no tienen el estadio correcto (migración)
const checkPartido = db.prepare("SELECT estadio FROM partidos WHERE equipo_local='México' LIMIT 1").get();
if (checkPartido && !checkPartido.estadio.includes('Ciudad de México')) {
  db.prepare('DELETE FROM predicciones').run();
  db.prepare('DELETE FROM partidos').run();
  console.log('Migración: partidos incorrectos eliminados, insertando calendario oficial FIFA 2026');
}

// Agregar eliminatorias si faltan
const countEliminatorias = db.prepare("SELECT COUNT(*) as c FROM partidos WHERE fase != 'Grupos'").get();
if (countEliminatorias.c === 0) {
  console.log('Agregando partidos eliminatorios...');
  const ie = db.prepare('INSERT INTO partidos (fase,grupo,equipo_local,equipo_visitante,fecha,estadio) VALUES (?,?,?,?,?,?)');
  const elims = [
    ['Ronda de 32',null,'1ro Grupo A','2do Grupo C','2026-06-28','AT&T Stadium - Dallas'],
    ['Ronda de 32',null,'1ro Grupo C','2do Grupo A','2026-06-28','Lumen Field - Seattle'],
    ['Ronda de 32',null,'1ro Grupo B','3ro Grupo','2026-06-28','MetLife Stadium - Nueva York'],
    ['Ronda de 32',null,'1ro Grupo D','2do Grupo B','2026-06-29','SoFi Stadium - Los Ángeles'],
    ['Ronda de 32',null,'1ro Grupo E','3ro Grupo','2026-06-29','Hard Rock Stadium - Miami'],
    ['Ronda de 32',null,'1ro Grupo F','2do Grupo E','2026-06-29','Mercedes-Benz Stadium - Atlanta'],
    ['Ronda de 32',null,'1ro Grupo G','2do Grupo H','2026-06-30','Estadio Azteca - Ciudad de México'],
    ['Ronda de 32',null,'1ro Grupo H','2do Grupo G','2026-06-30','Arrowhead Stadium - Kansas City'],
    ['Ronda de 32',null,'1ro Grupo I','3ro Grupo','2026-06-30','NRG Stadium - Houston'],
    ['Ronda de 32',null,'1ro Grupo J','2do Grupo I','2026-07-01','Gillette Stadium - Boston'],
    ['Ronda de 32',null,'1ro Grupo K','3ro Grupo','2026-07-01','BMO Field - Toronto'],
    ['Ronda de 32',null,'1ro Grupo L','2do Grupo K','2026-07-01','Lincoln Financial Field - Filadelfia'],
    ['Ronda de 32',null,'2do Grupo D','3ro Grupo','2026-07-02','BC Place - Vancouver'],
    ['Ronda de 32',null,'2do Grupo F','3ro Grupo','2026-07-02','Estadio BBVA - Monterrey'],
    ['Ronda de 32',null,'2do Grupo J','3ro Grupo','2026-07-02','Estadio Akron - Guadalajara'],
    ['Ronda de 32',null,'2do Grupo L','3ro Grupo','2026-07-02','Levi\'s Stadium - San Francisco'],
    ['Octavos de Final',null,'Ganador R32-1','Ganador R32-2','2026-07-04','MetLife Stadium - Nueva York'],
    ['Octavos de Final',null,'Ganador R32-3','Ganador R32-4','2026-07-04','AT&T Stadium - Dallas'],
    ['Octavos de Final',null,'Ganador R32-5','Ganador R32-6','2026-07-05','SoFi Stadium - Los Ángeles'],
    ['Octavos de Final',null,'Ganador R32-7','Ganador R32-8','2026-07-05','Mercedes-Benz Stadium - Atlanta'],
    ['Octavos de Final',null,'Ganador R32-9','Ganador R32-10','2026-07-06','Hard Rock Stadium - Miami'],
    ['Octavos de Final',null,'Ganador R32-11','Ganador R32-12','2026-07-06','Estadio Azteca - Ciudad de México'],
    ['Octavos de Final',null,'Ganador R32-13','Ganador R32-14','2026-07-07','Lumen Field - Seattle'],
    ['Octavos de Final',null,'Ganador R32-15','Ganador R32-16','2026-07-07','NRG Stadium - Houston'],
    ['Cuartos de Final',null,'Ganador OF-1','Ganador OF-2','2026-07-10','MetLife Stadium - Nueva York'],
    ['Cuartos de Final',null,'Ganador OF-3','Ganador OF-4','2026-07-10','AT&T Stadium - Dallas'],
    ['Cuartos de Final',null,'Ganador OF-5','Ganador OF-6','2026-07-11','SoFi Stadium - Los Ángeles'],
    ['Cuartos de Final',null,'Ganador OF-7','Ganador OF-8','2026-07-11','Mercedes-Benz Stadium - Atlanta'],
    ['Semifinales',null,'Ganador CF-1','Ganador CF-2','2026-07-14','MetLife Stadium - Nueva York'],
    ['Semifinales',null,'Ganador CF-3','Ganador CF-4','2026-07-15','AT&T Stadium - Dallas'],
    ['Tercer Lugar',null,'Perdedor SF-1','Perdedor SF-2','2026-07-18','Hard Rock Stadium - Miami'],
    ['Final',null,'Ganador SF-1','Ganador SF-2','2026-07-19','MetLife Stadium - Nueva York'],
  ];
  for (const p of elims) ie.run(...p);
  console.log(`${elims.length} partidos eliminatorios agregados`);
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
    ['Grupos', 'A', 'México', 'Sudáfrica', '2026-06-11', 'Estadio Azteca - Ciudad de México'],
    ['Grupos', 'A', 'Corea del Sur', 'Chequia', '2026-06-11', 'Estadio Akron - Guadalajara'],
    ['Grupos', 'A', 'Chequia', 'Sudáfrica', '2026-06-18', 'Mercedes-Benz Stadium - Atlanta'],
    ['Grupos', 'A', 'México', 'Corea del Sur', '2026-06-18', 'Estadio Akron - Guadalajara'],
    ['Grupos', 'A', 'Chequia', 'México', '2026-06-24', 'Estadio Azteca - Ciudad de México'],
    ['Grupos', 'A', 'Sudáfrica', 'Corea del Sur', '2026-06-24', 'Estadio BBVA - Monterrey'],
    // GRUPO B: Canadá, Bosnia-Herzegovina, Qatar, Suiza
    ['Grupos', 'B', 'Canadá', 'Bosnia-Herzegovina', '2026-06-12', 'BMO Field - Toronto'],
    ['Grupos', 'B', 'Qatar', 'Suiza', '2026-06-13', "Levi's Stadium - San Francisco"],
    ['Grupos', 'B', 'Suiza', 'Canadá', '2026-06-18', 'SoFi Stadium - Los Ángeles'],
    ['Grupos', 'B', 'Canadá', 'Qatar', '2026-06-18', 'BC Place - Vancouver'],
    ['Grupos', 'B', 'Suiza', 'Bosnia-Herzegovina', '2026-06-24', 'BC Place - Vancouver'],
    ['Grupos', 'B', 'Qatar', 'Canadá', '2026-06-24', 'Lumen Field - Seattle'],
    // GRUPO C: Brasil, Marruecos, Haití, Escocia
    ['Grupos', 'C', 'Brasil', 'Marruecos', '2026-06-13', 'MetLife Stadium - Nueva York/Nueva Jersey'],
    ['Grupos', 'C', 'Haití', 'Escocia', '2026-06-13', 'Gillette Stadium - Boston'],
    ['Grupos', 'C', 'Escocia', 'Marruecos', '2026-06-19', 'Gillette Stadium - Boston'],
    ['Grupos', 'C', 'Brasil', 'Haití', '2026-06-19', 'Lincoln Financial Field - Filadelfia'],
    ['Grupos', 'C', 'Escocia', 'Brasil', '2026-06-24', 'Hard Rock Stadium - Miami'],
    ['Grupos', 'C', 'Marruecos', 'Haití', '2026-06-24', 'Mercedes-Benz Stadium - Atlanta'],
    // GRUPO D: EE.UU., Paraguay, Australia, Turquía
    ['Grupos', 'D', 'EE.UU.', 'Paraguay', '2026-06-12', 'SoFi Stadium - Los Ángeles'],
    ['Grupos', 'D', 'Australia', 'Turquía', '2026-06-13', 'BC Place - Vancouver'],
    ['Grupos', 'D', 'EE.UU.', 'Australia', '2026-06-19', 'Lumen Field - Seattle'],
    ['Grupos', 'D', 'Turquía', 'Paraguay', '2026-06-19', "Levi's Stadium - San Francisco"],
    ['Grupos', 'D', 'Turquía', 'EE.UU.', '2026-06-25', 'SoFi Stadium - Los Ángeles'],
    ['Grupos', 'D', 'Paraguay', 'Australia', '2026-06-25', "Levi's Stadium - San Francisco"],
    // GRUPO E: Alemania, Curazao, Costa de Marfil, Ecuador
    ['Grupos', 'E', 'Alemania', 'Curazao', '2026-06-14', 'NRG Stadium - Houston'],
    ['Grupos', 'E', 'Costa de Marfil', 'Ecuador', '2026-06-14', 'Lincoln Financial Field - Filadelfia'],
    ['Grupos', 'E', 'Alemania', 'Costa de Marfil', '2026-06-20', 'BMO Field - Toronto'],
    ['Grupos', 'E', 'Ecuador', 'Curazao', '2026-06-20', 'Arrowhead Stadium - Kansas City'],
    ['Grupos', 'E', 'Ecuador', 'Alemania', '2026-06-25', 'MetLife Stadium - Nueva York/Nueva Jersey'],
    ['Grupos', 'E', 'Curazao', 'Costa de Marfil', '2026-06-25', 'Lincoln Financial Field - Filadelfia'],
    // GRUPO F: Países Bajos, Japón, Suecia, Túnez
    ['Grupos', 'F', 'Países Bajos', 'Japón', '2026-06-14', 'AT&T Stadium - Dallas'],
    ['Grupos', 'F', 'Suecia', 'Túnez', '2026-06-14', 'Estadio BBVA - Monterrey'],
    ['Grupos', 'F', 'Países Bajos', 'Suecia', '2026-06-20', 'NRG Stadium - Houston'],
    ['Grupos', 'F', 'Túnez', 'Japón', '2026-06-21', 'Estadio BBVA - Monterrey'],
    ['Grupos', 'F', 'Japón', 'Suecia', '2026-06-25', 'AT&T Stadium - Dallas'],
    ['Grupos', 'F', 'Túnez', 'Países Bajos', '2026-06-25', 'Arrowhead Stadium - Kansas City'],
    // GRUPO G: Irán, Nueva Zelanda, Bélgica, Egipto
    ['Grupos', 'G', 'Irán', 'Nueva Zelanda', '2026-06-15', 'SoFi Stadium - Los Ángeles'],
    ['Grupos', 'G', 'Bélgica', 'Egipto', '2026-06-15', 'Lumen Field - Seattle'],
    ['Grupos', 'G', 'Bélgica', 'Irán', '2026-06-21', 'SoFi Stadium - Los Ángeles'],
    ['Grupos', 'G', 'Nueva Zelanda', 'Egipto', '2026-06-21', 'BC Place - Vancouver'],
    ['Grupos', 'G', 'Egipto', 'Irán', '2026-06-26', 'Lumen Field - Seattle'],
    ['Grupos', 'G', 'Nueva Zelanda', 'Bélgica', '2026-06-26', 'BC Place - Vancouver'],
    // GRUPO H: España, Cabo Verde, Arabia Saudita, Uruguay
    ['Grupos', 'H', 'España', 'Cabo Verde', '2026-06-15', 'Mercedes-Benz Stadium - Atlanta'],
    ['Grupos', 'H', 'Arabia Saudita', 'Uruguay', '2026-06-15', 'Hard Rock Stadium - Miami'],
    ['Grupos', 'H', 'España', 'Arabia Saudita', '2026-06-21', 'Mercedes-Benz Stadium - Atlanta'],
    ['Grupos', 'H', 'Uruguay', 'Cabo Verde', '2026-06-21', 'Hard Rock Stadium - Miami'],
    ['Grupos', 'H', 'Uruguay', 'España', '2026-06-26', 'Estadio Akron - Guadalajara'],
    ['Grupos', 'H', 'Cabo Verde', 'Arabia Saudita', '2026-06-26', 'NRG Stadium - Houston'],
    // GRUPO I: Francia, Senegal, Irak, Noruega
    ['Grupos', 'I', 'Francia', 'Senegal', '2026-06-16', 'MetLife Stadium - Nueva York/Nueva Jersey'],
    ['Grupos', 'I', 'Irak', 'Noruega', '2026-06-16', 'Gillette Stadium - Boston'],
    ['Grupos', 'I', 'Francia', 'Irak', '2026-06-22', 'Lincoln Financial Field - Filadelfia'],
    ['Grupos', 'I', 'Noruega', 'Senegal', '2026-06-22', 'MetLife Stadium - Nueva York/Nueva Jersey'],
    ['Grupos', 'I', 'Noruega', 'Francia', '2026-06-26', 'Gillette Stadium - Boston'],
    ['Grupos', 'I', 'Senegal', 'Irak', '2026-06-26', 'BMO Field - Toronto'],
    // GRUPO J: Argentina, Argelia, Austria, Jordania
    ['Grupos', 'J', 'Argentina', 'Argelia', '2026-06-16', 'Arrowhead Stadium - Kansas City'],
    ['Grupos', 'J', 'Austria', 'Jordania', '2026-06-17', "Levi's Stadium - San Francisco"],
    ['Grupos', 'J', 'Argentina', 'Austria', '2026-06-22', 'AT&T Stadium - Dallas'],
    ['Grupos', 'J', 'Jordania', 'Argelia', '2026-06-22', "Levi's Stadium - San Francisco"],
    ['Grupos', 'J', 'Jordania', 'Argentina', '2026-06-27', 'AT&T Stadium - Dallas'],
    ['Grupos', 'J', 'Argelia', 'Austria', '2026-06-27', 'Arrowhead Stadium - Kansas City'],
    // GRUPO K: Portugal, Congo DR, Uzbekistán, Colombia
    ['Grupos', 'K', 'Portugal', 'Congo DR', '2026-06-17', 'NRG Stadium - Houston'],
    ['Grupos', 'K', 'Uzbekistán', 'Colombia', '2026-06-17', 'Estadio Azteca - Ciudad de México'],
    ['Grupos', 'K', 'Portugal', 'Uzbekistán', '2026-06-23', 'NRG Stadium - Houston'],
    ['Grupos', 'K', 'Colombia', 'Congo DR', '2026-06-23', 'Estadio Akron - Guadalajara'],
    ['Grupos', 'K', 'Colombia', 'Portugal', '2026-06-27', 'Hard Rock Stadium - Miami'],
    ['Grupos', 'K', 'Congo DR', 'Uzbekistán', '2026-06-27', 'Mercedes-Benz Stadium - Atlanta'],
    // GRUPO L: Inglaterra, Croacia, Ghana, Panamá
    ['Grupos', 'L', 'Inglaterra', 'Croacia', '2026-06-17', 'AT&T Stadium - Dallas'],
    ['Grupos', 'L', 'Ghana', 'Panamá', '2026-06-17', 'BMO Field - Toronto'],
    ['Grupos', 'L', 'Inglaterra', 'Ghana', '2026-06-23', 'Gillette Stadium - Boston'],
    ['Grupos', 'L', 'Panamá', 'Croacia', '2026-06-23', 'BMO Field - Toronto'],
    ['Grupos', 'L', 'Panamá', 'Inglaterra', '2026-06-27', 'MetLife Stadium - Nueva York/Nueva Jersey'],
    ['Grupos', 'L', 'Croacia', 'Ghana', '2026-06-27', 'Lincoln Financial Field - Filadelfia'],
  ];

  for (const p of partidosGrupo) {
    insertPartido.run(...p);
  }

  // RONDA DE 32 (16 partidos) — equipos se actualizan automáticamente via API
  const r32 = [
    ['Ronda de 32', null, '1ro Grupo A', '2do Grupo C', '2026-06-28', 'AT&T Stadium - Dallas'],
    ['Ronda de 32', null, '1ro Grupo C', '2do Grupo A', '2026-06-28', 'Lumen Field - Seattle'],
    ['Ronda de 32', null, '1ro Grupo B', '3ro Grupo', '2026-06-28', 'MetLife Stadium - Nueva York/Nueva Jersey'],
    ['Ronda de 32', null, '1ro Grupo D', '2do Grupo B', '2026-06-29', 'SoFi Stadium - Los Ángeles'],
    ['Ronda de 32', null, '1ro Grupo E', '3ro Grupo', '2026-06-29', 'Hard Rock Stadium - Miami'],
    ['Ronda de 32', null, '1ro Grupo F', '2do Grupo E', '2026-06-29', 'Mercedes-Benz Stadium - Atlanta'],
    ['Ronda de 32', null, '1ro Grupo G', '2do Grupo H', '2026-06-30', 'Estadio Azteca - Ciudad de México'],
    ['Ronda de 32', null, '1ro Grupo H', '2do Grupo G', '2026-06-30', 'Arrowhead Stadium - Kansas City'],
    ['Ronda de 32', null, '1ro Grupo I', '3ro Grupo', '2026-06-30', 'NRG Stadium - Houston'],
    ['Ronda de 32', null, '1ro Grupo J', '2do Grupo I', '2026-07-01', 'Gillette Stadium - Boston'],
    ['Ronda de 32', null, '1ro Grupo K', '3ro Grupo', '2026-07-01', 'BMO Field - Toronto'],
    ['Ronda de 32', null, '1ro Grupo L', '2do Grupo K', '2026-07-01', 'Lincoln Financial Field - Filadelfia'],
    ['Ronda de 32', null, '2do Grupo D', '3ro Grupo', '2026-07-02', 'BC Place - Vancouver'],
    ['Ronda de 32', null, '2do Grupo F', '3ro Grupo', '2026-07-02', 'Estadio BBVA - Monterrey'],
    ['Ronda de 32', null, '2do Grupo J', '3ro Grupo', '2026-07-02', 'Estadio Akron - Guadalajara'],
    ['Ronda de 32', null, '2do Grupo L', '3ro Grupo', '2026-07-02', 'Levi\'s Stadium - San Francisco'],
  ];
  for (const p of r32) insertPartido.run(...p);

  // OCTAVOS DE FINAL (8 partidos)
  const r16 = [
    ['Octavos de Final', null, 'Ganador R32-1', 'Ganador R32-2', '2026-07-04', 'MetLife Stadium - Nueva York/Nueva Jersey'],
    ['Octavos de Final', null, 'Ganador R32-3', 'Ganador R32-4', '2026-07-04', 'AT&T Stadium - Dallas'],
    ['Octavos de Final', null, 'Ganador R32-5', 'Ganador R32-6', '2026-07-05', 'SoFi Stadium - Los Ángeles'],
    ['Octavos de Final', null, 'Ganador R32-7', 'Ganador R32-8', '2026-07-05', 'Mercedes-Benz Stadium - Atlanta'],
    ['Octavos de Final', null, 'Ganador R32-9', 'Ganador R32-10', '2026-07-06', 'Hard Rock Stadium - Miami'],
    ['Octavos de Final', null, 'Ganador R32-11', 'Ganador R32-12', '2026-07-06', 'Estadio Azteca - Ciudad de México'],
    ['Octavos de Final', null, 'Ganador R32-13', 'Ganador R32-14', '2026-07-07', 'Lumen Field - Seattle'],
    ['Octavos de Final', null, 'Ganador R32-15', 'Ganador R32-16', '2026-07-07', 'NRG Stadium - Houston'],
  ];
  for (const p of r16) insertPartido.run(...p);

  // CUARTOS DE FINAL (4 partidos)
  const qf = [
    ['Cuartos de Final', null, 'Ganador OF-1', 'Ganador OF-2', '2026-07-10', 'MetLife Stadium - Nueva York/Nueva Jersey'],
    ['Cuartos de Final', null, 'Ganador OF-3', 'Ganador OF-4', '2026-07-10', 'AT&T Stadium - Dallas'],
    ['Cuartos de Final', null, 'Ganador OF-5', 'Ganador OF-6', '2026-07-11', 'SoFi Stadium - Los Ángeles'],
    ['Cuartos de Final', null, 'Ganador OF-7', 'Ganador OF-8', '2026-07-11', 'Mercedes-Benz Stadium - Atlanta'],
  ];
  for (const p of qf) insertPartido.run(...p);

  // SEMIFINALES (2 partidos)
  const sf = [
    ['Semifinales', null, 'Ganador CF-1', 'Ganador CF-2', '2026-07-14', 'MetLife Stadium - Nueva York/Nueva Jersey'],
    ['Semifinales', null, 'Ganador CF-3', 'Ganador CF-4', '2026-07-15', 'AT&T Stadium - Dallas'],
  ];
  for (const p of sf) insertPartido.run(...p);

  // TERCER LUGAR
  insertPartido.run('Tercer Lugar', null, 'Perdedor SF-1', 'Perdedor SF-2', '2026-07-18', 'Hard Rock Stadium - Miami');

  // FINAL
  insertPartido.run('Final', null, 'Ganador SF-1', 'Ganador SF-2', '2026-07-19', 'MetLife Stadium - Nueva York/Nueva Jersey');
}

module.exports = db;
