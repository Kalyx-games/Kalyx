// Fonction serveur (Vercel) : PROXY d'ÉCRITURE vers Supabase.
//
// But sécurité : la clé qui peut MODIFIER la base (clé SECRÈTE Supabase, qui contourne
// la sécurité RLS) reste UNIQUEMENT ici, côté serveur — jamais dans l'appli. Toute écriture
// doit présenter le CODE d'accès de l'appareil (variable APP_WRITE_SECRET) ; sinon → 401.
// Ainsi, même si un robot trouve l'appli et sa clé PUBLIQUE, cette clé est en LECTURE SEULE
// (cf. verrouillage RLS) : il ne peut rien écrire ni supprimer.
//
// Routage : vercel.json réécrit /api/sb/rest/v1/... → /api/sbproxy?p=rest/v1/... . L'appli
// configure un 2e client supabase-js pointé sur /api/sb ; supabase-js construit les requêtes
// REST habituelles, on ne fait que les relayer vers Supabase avec la vraie clé secrète.
// On n'autorise QUE le chemin rest/v1/ (l'API de données).

import crypto from 'node:crypto'

const sha256 = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex')

// Hash du code d'accès stocké en base (table app_config), s'il existe. Permet de CHANGER le
// code depuis l'appli : une fois un hash stocké, il fait foi ; sinon on se rabat sur la
// variable Vercel APP_WRITE_SECRET (amorçage). null si pas de hash / table absente.
async function storedCodeHash(SUPA, SECRET) {
  try {
    const r = await fetch(`${SUPA}/rest/v1/app_config?key=eq.write_code_hash&select=value`, {
      headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}` },
    })
    if (!r.ok) return null
    const rows = await r.json()
    return rows && rows[0] ? rows[0].value : null
  } catch {
    return null
  }
}

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
  // Priorité au code stocké en base (modifiable depuis l'appli) ; repli sur la variable Vercel.
  const sent = req.headers['apikey'] || (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '')
  const dbHash = await storedCodeHash(SUPA, SECRET)
  const ok = dbHash ? sha256(sent) === dbHash : sent === CODE
  if (!ok) {
    res.status(401).json({ error: "Code d'accès invalide." })
    return
  }

  // Chemin capturé par la réécriture — doit viser l'API de données. Vercel fournit le chemin
  // à la fois sous "p" (notre alias) ET "path" (nom de la source) → on ignore les deux.
  const q = req.query || {}
  const rawPath = q.p || q.path || ''
  const path = Array.isArray(rawPath) ? rawPath.join('/') : rawPath
  if (!path.startsWith('rest/v1/')) {
    res.status(400).json({ error: 'Chemin non autorisé.' })
    return
  }

  // Reconstitue la query PostgREST (tout sauf nos paramètres internes de routage).
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(q)) {
    if (k === 'p' || k === 'path') continue
    if (Array.isArray(v)) v.forEach((x) => params.append(k, x))
    else params.append(k, v)
  }
  const qs = params.toString()
  const target = `${SUPA}/${path}${qs ? '?' + qs : ''}`

  const headers = { apikey: SECRET, Authorization: `Bearer ${SECRET}` }
  ;['content-type', 'prefer', 'content-profile', 'accept-profile', 'accept', 'range'].forEach((h) => {
    if (req.headers[h]) headers[h] = req.headers[h]
  })

  const method = req.method || 'GET'
  const body = method === 'GET' || method === 'HEAD' ? undefined : await getBody(req)

  try {
    const r = await fetch(target, { method, headers, body })
    const text = await r.text()
    const cr = r.headers.get('content-range')
    if (cr) res.setHeader('Content-Range', cr)
    res.setHeader('Content-Type', r.headers.get('content-type') || 'application/json')
    res.status(r.status).send(text)
  } catch (e) {
    res.status(502).json({ error: String((e && e.message) || e) })
  }
}
