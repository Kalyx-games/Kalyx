// Fonction serveur (Vercel) : PROXY d'ÉCRITURE vers Supabase.
//
// But sécurité : la clé qui peut MODIFIER la base (clé SECRÈTE Supabase, qui contourne
// la sécurité RLS) reste UNIQUEMENT ici, côté serveur — jamais dans l'appli. Toute écriture
// doit présenter le CODE d'accès de l'appareil (variable APP_WRITE_SECRET) ; sinon → 401.
// Ainsi, même si un robot trouve l'appli et sa clé PUBLIQUE, cette clé est en LECTURE SEULE
// (cf. verrouillage RLS) : il ne peut rien écrire ni supprimer.
//
// L'appli configure un 2e client supabase-js pointant sur /api/sb ; supabase-js construit
// les requêtes REST habituelles (rest/v1/...), on ne fait que les relayer vers Supabase avec
// la vraie clé secrète. On n'autorise QUE le chemin rest/v1/ (l'API de données).

// Reconstitue le corps de la requête (JSON envoyé par supabase-js), quel que soit le mode.
async function getBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') return req.body
    if (Buffer.isBuffer(req.body)) return req.body
    return JSON.stringify(req.body)
  }
  const chunks = []
  for await (const c of req) chunks.push(c)
  return Buffer.concat(chunks)
}

export default async function handler(req, res) {
  const SUPA = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
  const SECRET = process.env.SUPABASE_SECRET_KEY // clé SECRÈTE Supabase (contourne la RLS)
  const CODE = process.env.APP_WRITE_SECRET // code d'accès attendu (choisi par toi)

  if (!SUPA || !SECRET || !CODE) {
    res.status(500).json({ error: 'Proxy non configuré : variables SUPABASE_SECRET_KEY / APP_WRITE_SECRET manquantes.' })
    return
  }

  // Le code d'accès est envoyé par l'appli comme "apikey" (et Authorization) — on le vérifie.
  const sent = req.headers['apikey'] || (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '')
  if (sent !== CODE) {
    res.status(401).json({ error: "Code d'accès invalide." })
    return
  }

  // Chemin après /api/sb/ — doit viser l'API de données PostgREST uniquement.
  const marker = '/api/sb/'
  const i = req.url.indexOf(marker)
  const rest = i >= 0 ? req.url.slice(i + marker.length) : ''
  if (!rest.startsWith('rest/v1/')) {
    res.status(400).json({ error: 'Chemin non autorisé.' })
    return
  }

  const headers = { apikey: SECRET, Authorization: `Bearer ${SECRET}` }
  ;['content-type', 'prefer', 'content-profile', 'accept-profile', 'accept', 'range'].forEach((h) => {
    if (req.headers[h]) headers[h] = req.headers[h]
  })

  const method = req.method || 'GET'
  const body = method === 'GET' || method === 'HEAD' ? undefined : await getBody(req)

  try {
    const r = await fetch(`${SUPA}/${rest}`, { method, headers, body })
    const text = await r.text()
    const cr = r.headers.get('content-range')
    if (cr) res.setHeader('Content-Range', cr)
    res.setHeader('Content-Type', r.headers.get('content-type') || 'application/json')
    res.status(r.status).send(text)
  } catch (e) {
    res.status(502).json({ error: String((e && e.message) || e) })
  }
}
