// Fonction serveur (Vercel) appelée par l'app (/api/price?name=...).
// Renvoie le NOM complet + le PRIX + l'IMAGE du 1er résultat Philibert.
// (Okkazeo a été testé pour l'image mais bloque les serveurs via Cloudflare "Just a
//  moment" → impossible côté serveur ; l'image fiable viendra de BGG plus tard.)
// Téléchargement côté serveur (pas sur le téléphone), on renvoie du JSON léger.

async function fetchPhilibert(name) {
  const url = `https://www.philibertnet.com/fr/recherche?controller=search&search_query=${encodeURIComponent(name)}`
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 8000)
  try {
    const r = await fetch(url, { signal: ac.signal, headers: { 'User-Agent': 'Mozilla/5.0 (Kalyx)', 'Accept-Language': 'fr' } })
    if (!r.ok) return { found: false, url }
    const doc = await r.text()
    // On se limite aux VRAIS résultats (conteneur #product-list), pas aux carrousels.
    const i = doc.indexOf('id="product-list"')
    const zone = i >= 0 ? doc.slice(i, i + 140000) : ''
    const priceM = zone.match(/product-card__price[^"]*color-(?:text|status-error)[^"]*">\s*([^<]+)/)
    const imgM = zone.match(/product-card__thumb[^>]*src="([^"]+)"/)
    const nameM = zone.match(/product-card__title[^>]*>\s*([^<]+?)\s*</)
    const hrefM = zone.match(/product-card__title[^>]*href="([^"]+)"/)
    if (!priceM && !nameM) return { found: false, url }
    const decode = (s) =>
      s.replace(/&amp;/g, '&').replace(/&#0?39;/g, "'").replace(/&quot;/g, '"').replace(/&eacute;/g, 'é').trim()
    const price = priceM ? parseFloat(priceM[1].replace(/[^\d,]/g, '').replace(',', '.')) : null
    let productUrl = hrefM ? hrefM[1] : url
    if (productUrl.startsWith('/')) productUrl = `https://www.philibertnet.com${productUrl}`
    return {
      found: true,
      name: nameM ? decode(nameM[1]) : null,
      price: price > 0 ? price : null,
      image: imgM ? imgM[1] : null,
      url: productUrl,
      source: url,
    }
  } catch (e) {
    return { found: false, url, error: String((e && e.message) || e) }
  } finally {
    clearTimeout(timer)
  }
}

export default async function handler(req, res) {
  const name = (req.query?.name || '').toString().trim()
  if (!name) {
    res.status(400).json({ error: 'name manquant' })
    return
  }

  const phil = await fetchPhilibert(name)
  if (!phil.found) {
    res.status(200).json({ found: false })
    return
  }

  // Cache CDN Vercel : 1 jour (et sert l'ancien pendant 7 j en rafraîchissant).
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800')
  res.status(200).json({
    found: true,
    name: phil.name || null,
    price: phil.price ?? null,
    currency: 'EUR',
    image: phil.image || null,
    url: phil.url || null,
    source: phil.source || null,
  })
}
