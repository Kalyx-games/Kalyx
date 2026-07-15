// Fonction serveur (Vercel) : trouve le meilleur LIVRET DE RÈGLES d'un jeu sur
// BoardGameGeek et REDIRIGE le navigateur droit sur sa page de fichier (aperçu +
// téléchargement immédiats). Français si dispo, sinon anglais, sinon autre langue.
// Repli : la page « Files » du jeu si aucun livret clair n'est trouvé.
//
//   /api/rules?id=BGG_ID  → 302 vers https://boardgamegeek.com/filepage/...
//
// NB : l'API de fichiers de BGG (api.geekdo.com) est publique (pas de jeton). Les URLs
// de téléchargement direct sont, elles, protégées (Cloudflare + lien signé JS) → on
// envoie donc l'utilisateur sur la PAGE du bon fichier, où le PDF est en un geste.

const FILES_API = 'https://api.geekdo.com/api/files'

// Ce qui ressemble à un livret de règles (dans le NOM du fichier / le titre).
const RULES_RE = /r[eè]gle|rulebook|rules|livret|spielregeln/i
// Ce qui n'est PAS le livret officiel (variantes, aides, résumés, versions 2 joueurs,
// éditions annotées de fans…), à écarter.
const BAD_RE = /blunder|solo|variant|player.?aid|aide.?de.?jeu|summary|r[eé]sum|score.?sheet|scoresheet|faq|errata|cheat|reference|quick|token|sleeve|promo|expansion|scenario|annotated|almanac|campaign|2.?player|two.?player|deux.?joueur|redesign|fan.?|homebrew|custom/i

// Choisit le meilleur livret : « règles » dans le NOM (+100, sinon +20 si seulement dans la
// description), langue FR (+60) / EN (+20) / autre (−35, on évite d'envoyer sur un PDF en
// japonais…), variantes/aides (−70), popularité (+20 max). On n'accepte qu'un vrai livret
// FR/EN (seuil 80) — sinon on renverra vers la liste complète des fichiers.
function pickRulebook(files) {
  let best = null
  let bestScore = -1
  for (const f of files) {
    const name = `${f.filename || ''} ${f.title || ''}`.toLowerCase()
    const desc = ((f.description && f.description.rendered) || '').toLowerCase()
    let s = 0
    if (RULES_RE.test(name)) s += 100
    else if (RULES_RE.test(desc)) s += 20
    if (BAD_RE.test(`${name} ${desc}`)) s -= 70
    const lang = f.language || ''
    if (lang === 'French') s += 60
    else if (lang === 'English') s += 20
    else s -= 35
    s += Math.min(Number(f.numpositive) || 0, 200) / 10
    if (s > bestScore) {
      bestScore = s
      best = f
    }
  }
  return bestScore >= 80 ? best : null
}

export default async function handler(req, res) {
  const id = (req.query?.id || '').toString().trim()
  if (!/^\d+$/.test(id)) {
    res.status(400).send('id manquant')
    return
  }

  const filesPage = `https://boardgamegeek.com/boardgame/${id}/files`
  let target = filesPage
  try {
    const r = await fetch(
      `${FILES_API}?ajax=1&objectid=${id}&objecttype=thing&pageid=1&showcount=75&sort=hot`,
      { headers: { Accept: 'application/json', 'User-Agent': 'Kalyx' } }
    )
    if (r.ok) {
      const data = await r.json()
      const files = Array.isArray(data.files) ? data.files : []
      const best = pickRulebook(files)
      if (best && best.href) target = `https://boardgamegeek.com${best.href}`
    }
  } catch {
    /* réseau BGG en échec : on retombe sur la liste des fichiers */
  }

  // Redirection (le cache CDN évite de re-taper BGG à chaque clic).
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800')
  res.statusCode = 302
  res.setHeader('Location', target)
  res.end()
}
