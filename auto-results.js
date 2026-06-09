const db = require('./db');
const { notificarNuevaFase, notificarRecordatorio } = require('./emails');

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
  'Paraguay': 'Paraguay', 'Japan': 'Japón', 'South Korea': 'Corea del Sur',
  'Australia': 'Australia', 'Saudi Arabia': 'Arabia Saudita', 'Iran': 'Irán',
  'Morocco': 'Marruecos', 'Senegal': 'Senegal', 'Egypt': 'Egipto',
  'South Africa': 'Sudáfrica', 'Croatia': 'Croacia', 'Switzerland': 'Suiza',
  'Turkey': 'Turquía', 'Ghana': 'Ghana', 'Tunisia': 'Túnez',
  'Panama': 'Panamá', 'Haiti': 'Haití', 'Scotland': 'Escocia',
  'Czechia': 'Chequia', 'Czech Republic': 'Chequia',
  'Bosnia and Herzegovina': 'Bosnia-Herzegovina', 'Bosnia-Herzegovina': 'Bosnia-Herzegovina',
  'Qatar': 'Qatar', 'Sweden': 'Suecia', 'Norway': 'Noruega',
  'New Zealand': 'Nueva Zelanda', 'Cape Verde': 'Cabo Verde',
  'Iraq': 'Irak', 'Algeria': 'Argelia', 'Austria': 'Austria',
  'Jordan': 'Jordania', 'DR Congo': 'Congo DR', 'Congo DR': 'Congo DR',
  'Uzbekistan': 'Uzbekistán', 'Ivory Coast': 'Costa de Marfil',
  "Côte d'Ivoire": 'Costa de Marfil', 'Curacao': 'Curazao', 'Curaçao': 'Curazao',
};

function mapTeam(name) {
  return TEAM_MAP[name] || name;
}

async function fetchFromAPI(status) {
  const res = await fetch(`${API_URL}/fixtures?league=${LEAGUE_ID}&season=${SEASON}&status=${status}`, {
    headers: {
      'x-apisports-key': API_KEY,
      'x-rapidapi-host': 'v3.football.api-sports.io'
    }
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.response || [];
}

async function fetchFinishedMatches() {
  if (!API_KEY) {
    console.log('[AutoResults] No API key configurada');
    return;
  }

  try {
    // 1. Actualizar nombres de equipos en eliminatorias (partidos no iniciados con equipo genérico)
    const upcomingFixtures = await fetchFromAPI('NS'); // Not Started
    for (const fixture of upcomingFixtures) {
      const localAPI = mapTeam(fixture.teams.home.name);
      const visitAPI = mapTeam(fixture.teams.away.name);
      const fecha = fixture.fixture.date?.split('T')[0];
      const fase = mapRound(fixture.league.round);

      if (!fase || fase === 'Grupos') continue;

      // Buscar partido genérico de esa fecha y fase para actualizar nombre
      const partido = db.prepare(`
        SELECT * FROM partidos WHERE fase = ? AND fecha = ? AND completado = 0
        AND (equipo_local LIKE 'Ganador%' OR equipo_local LIKE '1ro%' OR equipo_local LIKE '2do%' OR equipo_local LIKE 'Perdedor%')
      `).get(fase, fecha);

      if (partido) {
        db.prepare('UPDATE partidos SET equipo_local=?, equipo_visitante=? WHERE id=?')
          .run(localAPI, visitAPI, partido.id);
        console.log(`[AutoResults] 🔄 ${fase}: ${localAPI} vs ${visitAPI}`);

        // Verificar si TODOS los partidos de esta fase ya tienen equipos reales
        const pendientes = db.prepare(`
          SELECT COUNT(*) as cnt FROM partidos
          WHERE fase = ? AND (equipo_local LIKE 'Ganador%' OR equipo_local LIKE '1ro%' OR equipo_local LIKE '2do%' OR equipo_local LIKE 'Perdedor%')
        `).get(fase);

        if (pendientes.cnt === 0) {
          // Todos los equipos definidos — notificar a participantes
          await notificarNuevaFase(fase, fecha);
        }
      }
    }

    // 2. Procesar partidos terminados y calcular puntos
    const finished = await fetchFromAPI('FT');
    console.log(`[AutoResults] ${finished.length} partidos terminados encontrados`);

    for (const fixture of finished) {
      const localAPI = mapTeam(fixture.teams.home.name);
      const visitAPI = mapTeam(fixture.teams.away.name);
      const golesLocal = fixture.goals.home;
      const golesVisit = fixture.goals.away;

      if (golesLocal === null || golesVisit === null) continue;

      const partido = db.prepare(`
        SELECT * FROM partidos
        WHERE ((equipo_local = ? AND equipo_visitante = ?) OR (equipo_local = ? AND equipo_visitante = ?))
        AND completado = 0
      `).get(localAPI, visitAPI, visitAPI, localAPI);

      if (!partido) continue;

      const invertido = partido.equipo_local === visitAPI;
      const gl = invertido ? golesVisit : golesLocal;
      const gv = invertido ? golesLocal : golesVisit;

      db.prepare('UPDATE partidos SET goles_local=?, goles_visitante=?, completado=1 WHERE id=?')
        .run(gl, gv, partido.id);

      const ganadorReal = gl > gv ? 'L' : gv > gl ? 'V' : 'E';
      const predicciones = db.prepare('SELECT * FROM predicciones WHERE partido_id = ?').all(partido.id);

      for (const pred of predicciones) {
        let puntos = 0;
        const ganadorPred = pred.goles_local > pred.goles_visitante ? 'L' : pred.goles_visitante > pred.goles_local ? 'V' : 'E';
        if (pred.goles_local === gl && pred.goles_visitante === gv) puntos = 3;
        else if (ganadorReal === 'E' && ganadorPred === 'E') puntos = 2;
        else if (ganadorPred === ganadorReal) puntos = 1;
        db.prepare('UPDATE predicciones SET puntos = ? WHERE id = ?').run(puntos, pred.id);
      }

      console.log(`[AutoResults] ✅ ${partido.equipo_local} ${gl}-${gv} ${partido.equipo_visitante}`);
    }
  } catch (err) {
    console.error('[AutoResults] Error:', err.message);
  }
}

function mapRound(round) {
  if (!round) return null;
  if (round.includes('Group')) return 'Grupos';
  if (round.includes('Round of 32')) return 'Ronda de 32';
  if (round.includes('Round of 16')) return 'Octavos de Final';
  if (round.includes('Quarter')) return 'Cuartos de Final';
  if (round.includes('Semi')) return 'Semifinales';
  if (round.includes('3rd')) return 'Tercer Lugar';
  if (round.includes('Final')) return 'Final';
  return null;
}

// Ejecutar cada 30 minutos
function startAutoResults() {
  console.log('[AutoResults] Iniciando actualización automática cada 30 min');
  fetchFinishedMatches(); // correr al iniciar
  setInterval(fetchFinishedMatches, 30 * 60 * 1000);
}

module.exports = { startAutoResults, fetchFinishedMatches };
