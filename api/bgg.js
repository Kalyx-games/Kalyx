// Fonction serveur (Vercel) : proxy vers l'API XML de BoardGameGeek.
// Garde le jeton secret (BGG_TOKEN, variable Vercel), gère le retry sur 202
// (« en préparation »), parse le XML et renvoie du JSON propre à l'app.
//
//   /api/bgg?q=NOM   → { results: [{ id, name, year }] }
//   /api/bgg?id=ID   → { found, bgg_id, name, year, image, players_min, players_max,
//                        players_best, duration, complexity, minage }

const BGG = 'https://boardgamegeek.com/xmlapi2'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Appelle BGG avec le jeton. Réessaie si 202 (BGG prépare la réponse).
async function bggFetch(url, token) {
  let last
  for (let i = 0; i < 4; i++) {
    last = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/xml, text/xml', 'User-Agent': 'Kalyx' },
    })
    if (last.status === 202) {
      await sleep(1400)
      continue
    }
    return last
  }
  return last
}

// Minuscules + sans accents, pour comparer un nom à la requête (tri par pertinence).
const DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g')
const normalize = (s) => (s || '').normalize('NFD').replace(DIACRITICS, '').toLowerCase().trim()

const decode = (s) =>
  (s || '')
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()

// Valeur d'une balise auto-fermante : <tag value="X" /> → "X".
function tagValue(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}[^>]*\\bvalue="([^"]*)"`, 'i'))
  return m ? m[1] : null
}
const num = (v) => {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isNaN(n) ? null : n
}

// Meilleur nombre de joueurs, d'après le résumé du sondage BGG puis le sondage détaillé.
function bestPlayers(xml) {
  // 1) Résumé : <result name="bestwith" value="Best with 2 players" /> (gère les ex æquo).
  const sumM = xml.match(/<result name="bestwith" value="([^"]*)"/i)
  if (sumM) {
    const toks = sumM[1].replace(/[–—]/g, '-').match(/\d+(?:-\d+)?/g)
    if (toks && toks.length) return toks.join(', ')
  }
  // 2) Repli : le nb de joueurs avec le plus de votes « Best » dans le sondage détaillé.
  const pollM = xml.match(/<poll name="suggested_numplayers"[\s\S]*?<\/poll>/i)
  if (!pollM) return null
  const re = /<results numplayers="([^"]+)">([\s\S]*?)<\/results>/gi
  let m
  let best = null
  let bestVotes = 0
  while ((m = re.exec(pollM[0]))) {
    const bm = m[2].match(/value="Best" numvotes="(\d+)"/i)
    const votes = bm ? Number(bm[1]) : 0
    if (votes > bestVotes) {
      bestVotes = votes
      best = m[1].replace('+', '')
    }
  }
  return best
}

export default async function handler(req, res) {
  const token = process.env.BGG_TOKEN
  if (!token) {
    res.status(200).json({ error: 'BGG_TOKEN absent côté serveur.' })
    return
  }
  const q = (req.query?.q || '').toString().trim()
  const id = (req.query?.id || '').toString().trim()

  try {
    // --- Recherche : liste de jeux (nom + année) ---
    if (q && !id) {
      const r = await bggFetch(`${BGG}/search?query=${encodeURIComponent(q)}&type=boardgame`, token)
      // 202 = BGG prépare encore la réponse (après plusieurs essais) → on le dit clairement.
      if (r.status === 202) {
        res.status(200).json({ results: [], error: 'BoardGameGeek prépare la réponse, réessaie dans un instant.' })
        return
      }
      if (!r.ok) {
        res.status(200).json({ results: [], error: `BGG a répondu ${r.status}` })
        return
      }
      const doc = await r.text()
      const results = []
      const re = /<item type="boardgame" id="(\d+)">([\s\S]*?)<\/item>/gi
      let m
      while ((m = re.exec(doc)) && results.length < 300) {
        const name = m[2].match(/<name[^>]*value="([^"]*)"/i)
        const year = m[2].match(/<yearpublished value="(\d+)"/i)
        if (name) results.push({ id: Number(m[1]), name: decode(name[1]), year: year ? Number(year[1]) : null })
      }
      // BGG renvoie les résultats par ordre alphabétique → le bon jeu (ex. "Vinci") peut
      // être noyé après plein d'autres ("Da Vinci…"). On les RE-TRIE par pertinence :
      // correspondance exacte, puis "commence par", puis le reste (alpha).
      const nq = normalize(q)
      const score = (name) => {
        const n = normalize(name)
        if (n === nq) return 0
        if (n.startsWith(nq)) return 1
        return 2
      }
      results.sort((a, b) => score(a.name) - score(b.name) || a.name.localeCompare(b.name, 'fr'))
      res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800')
      res.status(200).json({ results: results.slice(0, 40) })
      return
    }

    // --- Fiche d'un jeu ---
    if (id) {
      const r = await bggFetch(`${BGG}/thing?id=${encodeURIComponent(id)}&stats=1`, token)
      // 202 = BGG prépare encore la réponse (après plusieurs essais) → message clair.
      if (r.status === 202) {
        res.status(200).json({ found: false, error: 'BoardGameGeek prépare la fiche, réessaie dans un instant.' })
        return
      }
      if (!r.ok) {
        res.status(200).json({ found: false, error: `BGG a répondu ${r.status}` })
        return
      }
      const doc = await r.text()
      const nameM = doc.match(/<name type="primary"[^>]*value="([^"]*)"/i)
      const imageM = doc.match(/<image>([^<]*)<\/image>/i)
      const weight = tagValue(doc, 'averageweight')
      const complexity = weight != null && Number(weight) > 0 ? Math.round(Number(weight) * 100) / 100 : null
      // Une seule durée : la durée MAX annoncée (comme choisi dans l'app).
      const duration = num(tagValue(doc, 'maxplaytime')) || num(tagValue(doc, 'playingtime')) || num(tagValue(doc, 'minplaytime'))

      res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800')
      res.status(200).json({
        found: Boolean(nameM),
        bgg_id: Number(id),
        name: nameM ? decode(nameM[1]) : null,
        year: num(tagValue(doc, 'yearpublished')),
        image: imageM ? imageM[1].trim() : null,
        players_min: num(tagValue(doc, 'minplayers')),
        players_max: num(tagValue(doc, 'maxplayers')),
        players_best: bestPlayers(doc),
        duration,
        complexity,
        minage: num(tagValue(doc, 'minage')),
      })
      return
    }

    res.status(400).json({ error: 'Donne ?q=NOM (recherche) ou ?id=ID (fiche).' })
  } catch (e) {
    res.status(200).json({ error: String((e && e.message) || e) })
  }
}
