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
    numero INTEGER,
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

  CREATE TABLE IF NOT EXISTS reset_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expira TEXT NOT NULL,
    usado INTEGER DEFAULT 0
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

// Migración: agregar columna numero si no existe
try { db.prepare('ALTER TABLE partidos ADD COLUMN numero INTEGER').run(); } catch(e) {}

// Migración: recrear si M15 tiene fecha incorrecta (debe ser 06-15)
const checkHora = db.prepare("SELECT fecha FROM partidos WHERE numero=15").get();
if (checkHora && !checkHora.fecha.includes('06-15')) {
  db.prepare('DELETE FROM predicciones').run();
  db.prepare('DELETE FROM partidos').run();
  try { db.prepare("DELETE FROM sqlite_sequence WHERE name='partidos'").run(); } catch(e) {}
  console.log('Migración: corrigiendo horarios oficiales FIFA');
}

// Migración: recrear partidos si no tienen número (solo si hay partidos sin número)
const sinNumero = db.prepare("SELECT COUNT(*) as c FROM partidos WHERE numero IS NULL").get();
if (sinNumero.c > 0) {
  db.prepare('DELETE FROM predicciones').run();
  db.prepare('DELETE FROM partidos').run();
  // Reset autoincrement para que IDs empiecen desde 1
  try { db.prepare("DELETE FROM sqlite_sequence WHERE name='partidos'").run(); } catch(e) {}
  console.log('Migración: recreando todos los partidos con números oficiales FIFA');
}

// Recrear eliminatorias si tienen datos viejos
const checkElim = db.prepare("SELECT equipo_local, fecha FROM partidos WHERE fase='Ronda de 32' LIMIT 1").get();
const elimCorrectas = checkElim && checkElim.fecha && checkElim.fecha.includes('ET');
if (checkElim && !elimCorrectas) {
  db.prepare("DELETE FROM partidos WHERE fase != 'Grupos'").run();
  console.log('Eliminatorias viejas borradas, recreando con horarios ET oficiales');
}
// Insertar todos los partidos si no existen
const countPartidos = db.prepare('SELECT COUNT(*) as cnt FROM partidos').get();
if (countPartidos.cnt === 0) {
  const insertPartido = db.prepare(`
    INSERT INTO partidos (numero, fase, grupo, equipo_local, equipo_visitante, fecha, estadio)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  // Todos los 104 partidos con número oficial FIFA
  // Formato: [numero, fase, grupo, local, visitante, fecha, estadio]
  const todosLosPartidos = [
    // GRUPO A (M1-M6)
    // ========================================================
    // NÚMEROS OFICIALES FIFA — Calendario v17, 10 abril 2026
    // ========================================================

    // JORNADA 1 (M1-M24) — 11-17 junio
    [1, 'Grupos','A','México','Sudáfrica',          '2026-06-11 15:00 ET','Estadio Azteca - Ciudad de México'],
    [2, 'Grupos','A','Corea del Sur','Chequia',      '2026-06-11 22:00 ET','Estadio Akron - Guadalajara'],
    [3, 'Grupos','B','Canadá','Bosnia-Herzegovina',  '2026-06-12 15:00 ET','BMO Field - Toronto'],
    [4, 'Grupos','D','EE.UU.','Paraguay',            '2026-06-12 21:00 ET','SoFi Stadium - Los Ángeles'],
    [5, 'Grupos','C','Haití','Escocia',              '2026-06-13 21:00 ET','Gillette Stadium - Boston'],
    [6, 'Grupos','D','Australia','Turquía',          '2026-06-14 00:00 ET','BC Place - Vancouver'],
    [7, 'Grupos','C','Brasil','Marruecos',           '2026-06-13 18:00 ET','MetLife Stadium - Nueva York/Nueva Jersey'],
    [8, 'Grupos','B','Qatar','Suiza',                '2026-06-13 15:00 ET',"Levi's Stadium - San Francisco"],
    [9, 'Grupos','E','Costa de Marfil','Ecuador',    '2026-06-14 19:00 ET','Lincoln Financial Field - Filadelfia'],
    [10,'Grupos','E','Alemania','Curazao',           '2026-06-14 13:00 ET','NRG Stadium - Houston'],
    [11,'Grupos','F','Países Bajos','Japón',         '2026-06-14 16:00 ET','AT&T Stadium - Dallas'],
    [12,'Grupos','F','Suecia','Túnez',               '2026-06-14 22:00 ET','Estadio BBVA - Monterrey'],
    [13,'Grupos','H','Arabia Saudita','Uruguay',     '2026-06-15 18:00 ET','Hard Rock Stadium - Miami'],
    [14,'Grupos','H','España','Cabo Verde',          '2026-06-15 12:00 ET','Mercedes-Benz Stadium - Atlanta'],
    [15,'Grupos','G','Irán','Nueva Zelanda',         '2026-06-15 21:00 ET','SoFi Stadium - Los Ángeles'],
    [16,'Grupos','G','Bélgica','Egipto',             '2026-06-15 15:00 ET','Lumen Field - Seattle'],
    [17,'Grupos','I','Francia','Senegal',            '2026-06-16 15:00 ET','MetLife Stadium - Nueva York/Nueva Jersey'],
    [18,'Grupos','I','Irak','Noruega',               '2026-06-16 18:00 ET','Gillette Stadium - Boston'],
    [19,'Grupos','J','Argentina','Argelia',          '2026-06-16 21:00 ET','Arrowhead Stadium - Kansas City'],
    [20,'Grupos','J','Austria','Jordania',           '2026-06-17 00:00 ET',"Levi's Stadium - San Francisco"],
    [21,'Grupos','L','Ghana','Panamá',               '2026-06-17 19:00 ET','BMO Field - Toronto'],
    [22,'Grupos','L','Inglaterra','Croacia',         '2026-06-17 16:00 ET','AT&T Stadium - Dallas'],
    [23,'Grupos','K','Portugal','Congo DR',          '2026-06-17 13:00 ET','NRG Stadium - Houston'],
    [24,'Grupos','K','Uzbekistán','Colombia',        '2026-06-17 22:00 ET','Estadio Azteca - Ciudad de México'],

    // JORNADA 2 (M25-M48) — 18-23 junio
    [25,'Grupos','A','Chequia','Sudáfrica',          '2026-06-18 12:00 ET','Mercedes-Benz Stadium - Atlanta'],
    [26,'Grupos','B','Suiza','Bosnia-Herzegovina',   '2026-06-18 15:00 ET','SoFi Stadium - Los Ángeles'],
    [27,'Grupos','B','Canadá','Qatar',               '2026-06-18 18:00 ET','BC Place - Vancouver'],
    [28,'Grupos','A','México','Corea del Sur',       '2026-06-18 21:00 ET','Estadio Akron - Guadalajara'],
    [29,'Grupos','C','Brasil','Haití',               '2026-06-19 20:30 ET','Lincoln Financial Field - Filadelfia'],
    [30,'Grupos','C','Escocia','Marruecos',          '2026-06-19 18:00 ET','Gillette Stadium - Boston'],
    [31,'Grupos','D','Turquía','Paraguay',           '2026-06-19 23:00 ET',"Levi's Stadium - San Francisco"],
    [32,'Grupos','D','EE.UU.','Australia',           '2026-06-19 15:00 ET','Lumen Field - Seattle'],
    [33,'Grupos','E','Alemania','Costa de Marfil',   '2026-06-20 16:00 ET','BMO Field - Toronto'],
    [34,'Grupos','E','Ecuador','Curazao',            '2026-06-20 20:00 ET','Arrowhead Stadium - Kansas City'],
    [35,'Grupos','F','Países Bajos','Suecia',        '2026-06-20 13:00 ET','NRG Stadium - Houston'],
    [36,'Grupos','F','Túnez','Japón',                '2026-06-21 00:00 ET','Estadio BBVA - Monterrey'],
    [37,'Grupos','H','Uruguay','Cabo Verde',         '2026-06-21 18:00 ET','Hard Rock Stadium - Miami'],
    [38,'Grupos','H','España','Arabia Saudita',      '2026-06-21 12:00 ET','Mercedes-Benz Stadium - Atlanta'],
    [39,'Grupos','G','Bélgica','Irán',               '2026-06-21 15:00 ET','SoFi Stadium - Los Ángeles'],
    [40,'Grupos','G','Nueva Zelanda','Egipto',       '2026-06-21 21:00 ET','BC Place - Vancouver'],
    [41,'Grupos','I','Noruega','Senegal',            '2026-06-22 20:00 ET','MetLife Stadium - Nueva York/Nueva Jersey'],
    [42,'Grupos','I','Francia','Irak',               '2026-06-22 17:00 ET','Lincoln Financial Field - Filadelfia'],
    [43,'Grupos','J','Argentina','Austria',          '2026-06-22 13:00 ET','AT&T Stadium - Dallas'],
    [44,'Grupos','J','Jordania','Argelia',           '2026-06-22 23:00 ET',"Levi's Stadium - San Francisco"],
    [45,'Grupos','L','Inglaterra','Ghana',           '2026-06-23 16:00 ET','Gillette Stadium - Boston'],
    [46,'Grupos','L','Panamá','Croacia',             '2026-06-23 19:00 ET','BMO Field - Toronto'],
    [47,'Grupos','K','Portugal','Uzbekistán',        '2026-06-23 13:00 ET','NRG Stadium - Houston'],
    [48,'Grupos','K','Colombia','Congo DR',          '2026-06-23 22:00 ET','Estadio Akron - Guadalajara'],

    // JORNADA 3 (M49-M72) — 24-27 junio (simultáneos por grupo)
    [49,'Grupos','C','Escocia','Brasil',             '2026-06-24 18:00 ET','Hard Rock Stadium - Miami'],
    [50,'Grupos','C','Marruecos','Haití',            '2026-06-24 18:00 ET','Mercedes-Benz Stadium - Atlanta'],
    [51,'Grupos','B','Suiza','Canadá',               '2026-06-24 15:00 ET','BC Place - Vancouver'],
    [52,'Grupos','B','Bosnia-Herzegovina','Qatar',   '2026-06-24 15:00 ET','Lumen Field - Seattle'],
    [53,'Grupos','A','Chequia','México',             '2026-06-24 21:00 ET','Estadio Azteca - Ciudad de México'],
    [54,'Grupos','A','Sudáfrica','Corea del Sur',    '2026-06-24 21:00 ET','Estadio BBVA - Monterrey'],
    [55,'Grupos','E','Curazao','Costa de Marfil',    '2026-06-25 16:00 ET','Lincoln Financial Field - Filadelfia'],
    [56,'Grupos','E','Ecuador','Alemania',           '2026-06-25 16:00 ET','MetLife Stadium - Nueva York/Nueva Jersey'],
    [57,'Grupos','F','Japón','Suecia',               '2026-06-25 19:00 ET','AT&T Stadium - Dallas'],
    [58,'Grupos','F','Túnez','Países Bajos',         '2026-06-25 19:00 ET','Arrowhead Stadium - Kansas City'],
    [59,'Grupos','D','Turquía','EE.UU.',             '2026-06-25 22:00 ET','SoFi Stadium - Los Ángeles'],
    [60,'Grupos','D','Paraguay','Australia',         '2026-06-25 22:00 ET',"Levi's Stadium - San Francisco"],
    [61,'Grupos','I','Noruega','Francia',            '2026-06-26 15:00 ET','Gillette Stadium - Boston'],
    [62,'Grupos','I','Senegal','Irak',               '2026-06-26 15:00 ET','BMO Field - Toronto'],
    [63,'Grupos','G','Egipto','Irán',                '2026-06-26 23:00 ET','Lumen Field - Seattle'],
    [64,'Grupos','G','Nueva Zelanda','Bélgica',      '2026-06-26 23:00 ET','BC Place - Vancouver'],
    [65,'Grupos','H','Cabo Verde','Arabia Saudita',  '2026-06-26 20:00 ET','NRG Stadium - Houston'],
    [66,'Grupos','H','Uruguay','España',             '2026-06-26 20:00 ET','Estadio Akron - Guadalajara'],
    [67,'Grupos','L','Panamá','Inglaterra',          '2026-06-27 17:00 ET','MetLife Stadium - Nueva York/Nueva Jersey'],
    [68,'Grupos','L','Croacia','Ghana',              '2026-06-27 17:00 ET','Lincoln Financial Field - Filadelfia'],
    [69,'Grupos','J','Argelia','Austria',            '2026-06-27 22:00 ET','Arrowhead Stadium - Kansas City'],
    [70,'Grupos','J','Jordania','Argentina',         '2026-06-27 22:00 ET','AT&T Stadium - Dallas'],
    [71,'Grupos','K','Colombia','Portugal',          '2026-06-27 19:30 ET','Hard Rock Stadium - Miami'],
    [72,'Grupos','K','Congo DR','Uzbekistán',        '2026-06-27 19:30 ET','Mercedes-Benz Stadium - Atlanta'],
    // RONDA DE 32 (M73-M88)
    [73,'Ronda de 32',null,'2do Grupo A','2do Grupo B','2026-06-28 15:00 ET','SoFi Stadium - Los Ángeles'],
    [74,'Ronda de 32',null,'1ro Grupo E','3er Clasificado','2026-06-29 16:30 ET','Gillette Stadium - Boston'],
    [75,'Ronda de 32',null,'1ro Grupo F','2do Grupo C','2026-06-29 21:00 ET','Estadio BBVA - Monterrey'],
    [76,'Ronda de 32',null,'1ro Grupo C','2do Grupo F','2026-06-29 13:00 ET','NRG Stadium - Houston'],
    [77,'Ronda de 32',null,'1ro Grupo I','3er Clasificado','2026-06-30 17:00 ET','MetLife Stadium - Nueva York/Nueva Jersey'],
    [78,'Ronda de 32',null,'2do Grupo E','2do Grupo I','2026-06-30 13:00 ET','AT&T Stadium - Dallas'],
    [79,'Ronda de 32',null,'1ro Grupo A','3er Clasificado','2026-06-30 21:00 ET','Estadio Azteca - Ciudad de México'],
    [80,'Ronda de 32',null,'1ro Grupo L','3er Clasificado','2026-07-01 12:00 ET','Mercedes-Benz Stadium - Atlanta'],
    [81,'Ronda de 32',null,'1ro Grupo D','3er Clasificado','2026-07-01 20:00 ET','Levi\'s Stadium - San Francisco'],
    [82,'Ronda de 32',null,'1ro Grupo G','3er Clasificado','2026-07-01 16:00 ET','Lumen Field - Seattle'],
    [83,'Ronda de 32',null,'2do Grupo K','2do Grupo L','2026-07-02 19:00 ET','BMO Field - Toronto'],
    [84,'Ronda de 32',null,'1ro Grupo H','2do Grupo J','2026-07-02 15:00 ET','SoFi Stadium - Los Ángeles'],
    [85,'Ronda de 32',null,'1ro Grupo B','3er Clasificado','2026-07-02 23:00 ET','BC Place - Vancouver'],
    [86,'Ronda de 32',null,'1ro Grupo J','2do Grupo H','2026-07-03 18:00 ET','Hard Rock Stadium - Miami'],
    [87,'Ronda de 32',null,'1ro Grupo K','3er Clasificado','2026-07-03 21:30 ET','Arrowhead Stadium - Kansas City'],
    [88,'Ronda de 32',null,'2do Grupo D','2do Grupo G','2026-07-03 14:00 ET','AT&T Stadium - Dallas'],
    // OCTAVOS DE FINAL (M89-M96)
    [89,'Octavos de Final',null,'Ganador M74','Ganador M77','2026-07-04 17:00 ET','Lincoln Financial Field - Filadelfia'],
    [90,'Octavos de Final',null,'Ganador M73','Ganador M75','2026-07-04 13:00 ET','NRG Stadium - Houston'],
    [91,'Octavos de Final',null,'Ganador M76','Ganador M78','2026-07-05 16:00 ET','MetLife Stadium - Nueva York/Nueva Jersey'],
    [92,'Octavos de Final',null,'Ganador M79','Ganador M80','2026-07-05 20:00 ET','Estadio Azteca - Ciudad de México'],
    [93,'Octavos de Final',null,'Ganador M83','Ganador M84','2026-07-06 15:00 ET','AT&T Stadium - Dallas'],
    [94,'Octavos de Final',null,'Ganador M81','Ganador M82','2026-07-06 20:00 ET','Lumen Field - Seattle'],
    [95,'Octavos de Final',null,'Ganador M86','Ganador M88','2026-07-07 12:00 ET','Mercedes-Benz Stadium - Atlanta'],
    [96,'Octavos de Final',null,'Ganador M85','Ganador M87','2026-07-07 16:00 ET','BC Place - Vancouver'],
    // CUARTOS DE FINAL (M97-M100)
    [97,'Cuartos de Final',null,'Ganador M89','Ganador M90','2026-07-09 16:00 ET','Gillette Stadium - Boston'],
    [98,'Cuartos de Final',null,'Ganador M93','Ganador M94','2026-07-10 15:00 ET','SoFi Stadium - Los Ángeles'],
    [99,'Cuartos de Final',null,'Ganador M91','Ganador M92','2026-07-11 17:00 ET','Hard Rock Stadium - Miami'],
    [100,'Cuartos de Final',null,'Ganador M95','Ganador M96','2026-07-11 21:00 ET','Arrowhead Stadium - Kansas City'],
    // SEMIFINALES (M101-M102)
    [101,'Semifinales',null,'Ganador M97','Ganador M98','2026-07-14 15:00 ET','AT&T Stadium - Dallas'],
    [102,'Semifinales',null,'Ganador M99','Ganador M100','2026-07-15 15:00 ET','Mercedes-Benz Stadium - Atlanta'],
    // TERCER LUGAR (M103)
    [103,'Tercer Lugar',null,'Perdedor M101','Perdedor M102','2026-07-18 17:00 ET','Hard Rock Stadium - Miami'],
    // FINAL (M104)
    [104,'Final',null,'Ganador M101','Ganador M102','2026-07-19 15:00 ET','MetLife Stadium - Nueva York/Nueva Jersey'],
  ];

  for (const p of todosLosPartidos) {
    insertPartido.run(...p);
  }
}

module.exports = db;
