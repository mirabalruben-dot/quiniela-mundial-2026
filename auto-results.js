const db = require('./db');

const API_KEY = process.env.API_FOOTBALL_KEY;
const API_URL = 'https://v3.football.api-sports.io';
// FIFA World Cup 2026 - league_id=1, season=2026
const LEAGUE_ID = 1;
const SEASON = 2026;

// Mapeo de nombres de equipos API → nombres en nuestra DB
const TEAM_MAP = {
  'Mexico': 'México', 'United States': 'EE.UU.', 'Canada': 'Canadá',
  'Argentina': 'Argentina', 'Brazil': 'Brasil', 'France': 'Francia',
  'Germany': 'Alemania', 'Spain': 'España', 'Portugal': 'Portugal',
  'England': 'Inglaterra', 'Netherlands': 'Países Bajos', 'Belgium': 'Bélgica',
  'Uruguay': 'Uruguay', 'Colombia': 'Colombia', 'Ecuador': 'Ecuador',
  'Chile': 'Chile', 'Peru': 'Perú', 'Bolivia': 'Bolivia', 'Paraguay': 'Paraguay',
  'Venezuela': 'Venezuela', 'Japan': 'Japón', 'South Korea': 'Corea del Sur',
  'Australia': 'Australia', 'Saudi Arabia': 'Arabia Saudita', 'Iran': 'Irán',
  'Morocco': 'Marruecos', 'Senegal': 'Senegal', 'Nigeria': 'Nigeria',
  'Egypt': 'Egipto', 'South Africa': 'Sudáfrica', 'Croatia': 'Croacia',
  'Serbia': 'Serbia', 'Poland': 'Polonia', 'Denmark': 'Dinamarca',
  'Switzerland': 'Suiza', 'Turkey': 'Turquía', 'Ukraine': 'Ucrania',
  'Romania': 'Rumania', 'Albania': 'Albania', 'Hungary': 'Hungría',
  'Slovakia': 'Eslovaquia', 'Costa Rica': 'Costa Rica', 'Panama': 'Panamá',
  'Honduras': 'Honduras', 'Jamaica': 'Jamaica', 'Cuba': 'Cuba',
  'Guatemala': 'Guatemala', 'Haiti': 'Haití', 'Trinidad and Tobago': 'Trinidad y Tobago',
  'Indonesia': 'Indonesia', 'Israel': 'Israel', 'Ghana': 'Ghana',
  'Cameroon': 'Camerún', 'Tunisia': 'Túnez', 'Wales': 'Gales',
  'Kosovo': 'Kosovo', 'Syria': 'Siria', "Ivory Coast": 'Costa de Marfil',
  'DR Congo': 'Congo', 'Bolivia': 'Bolivia',
};

function mapTeam(name) {
  return TEAM_MAP[name] || name;
}

async function fetchFinishedMatches() {
  if (!API_KEY) {
    console.log('[AutoResults] No API key configurada');
    return;
  }

  try {
    const res = await fetch(`${API_URL}/fixtures?league=${LEAGUE_ID}&season=${SEASON}&status=FT`, {
      headers: {
        'x-apisports-key': API_KEY,
        'x-rapidapi-host': 'v3.football.api-sports.io'
      }
    });

    if (!res.ok) {
      console.log('[AutoResults] Error API:', res.status);
      return;
    }

    const data = await res.json();
    const fixtures = data.response || [];
    console.log(`[AutoResults] ${fixtures.length} partidos terminados encontrados`);

    for (const fixture of fixtures) {
      const localAPI = mapTeam(fixture.teams.home.name);
      const visitAPI = mapTeam(fixture.teams.away.name);
      const golesLocal = fixture.goals.home;
      const golesVisit = fixture.goals.away;

      if (golesLocal === null || golesVisit === null) continue;

      // Buscar el partido en nuestra DB
      const partido = db.prepare(`
        SELECT * FROM partidos
        WHERE (equipo_local = ? AND equipo_visitante = ?)
        OR (equipo_local = ? AND equipo_visitante = ?)
        AND completado = 0
      `).get(localAPI, visitAPI, visitAPI, localAPI);

      if (!partido) continue;

      // Determinar si los equipos están invertidos
      const invertido = partido.equipo_local === visitAPI;
      const gl = invertido ? golesVisit : golesLocal;
      const gv = invertido ? golesLocal : golesVisit;

      // Actualizar resultado
      db.prepare('UPDATE partidos SET goles_local=?, goles_visitante=?, completado=1 WHERE id=?')
        .run(gl, gv, partido.id);

      // Calcular puntos
      const ganadorReal = gl > gv ? 'L' : gv > gl ? 'V' : 'E';
      const predicciones = db.prepare('SELECT * FROM predicciones WHERE partido_id = ?').all(partido.id);

      for (const pred of predicciones) {
        let puntos = 0;
        const ganadorPred = pred.goles_local > pred.goles_visitante ? 'L' : pred.goles_visitante > pred.goles_local ? 'V' : 'E';

        if (pred.goles_local === gl && pred.goles_visitante === gv) {
          puntos = 3;
        } else if (ganadorReal === 'E' && ganadorPred === 'E') {
          puntos = 2;
        } else if (ganadorPred === ganadorReal) {
          puntos = 1;
        }
        db.prepare('UPDATE predicciones SET puntos = ? WHERE id = ?').run(puntos, pred.id);
      }

      console.log(`[AutoResults] ✅ ${partido.equipo_local} ${gl}-${gv} ${partido.equipo_visitante}`);
    }
  } catch (err) {
    console.error('[AutoResults] Error:', err.message);
  }
}

// Ejecutar cada 30 minutos
function startAutoResults() {
  console.log('[AutoResults] Iniciando actualización automática cada 30 min');
  fetchFinishedMatches(); // correr al iniciar
  setInterval(fetchFinishedMatches, 30 * 60 * 1000);
}

module.exports = { startAutoResults, fetchFinishedMatches };
