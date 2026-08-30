// Redimensionnement des images par l'optimiseur natif de l'hébergeur (/_vercel/image).
// ⚠️ SEULES les largeurs déclarées dans vercel.json (images.sizes) sont acceptées :
// 128, 200, 256, 384, 640. Toute autre valeur renvoie HTTP 400 et fait retomber l'app
// sur l'image BRUTE (plusieurs centaines de Ko) — invisible en dev, désastreux en prod.
export const IMG_SIZES = [128, 200, 256, 384, 640]

// Miniature : 256 par défaut couvre la vignette de 88 px de la vue LISTE (densité 2,9×).
// La vue GRILLE demande 384. ⚠️ Depuis le réglage de DENSITÉ (src/lib/densite.js) sa tuile va
// de ~72 px (Petites, écran étroit) à ~194 px (Grandes, écran large) : à 194 px et densité 3,
// il faudrait 582 px, on en sert 384. Assumé — le cran suivant est 640, soit près du triple de
// poids pour un gain qui ne se voit qu'en « Grandes ». À rendre dépendant de la densité si le
// flou se remarque (640 est déjà en cache : c'est la taille de la jaquette de fiche).
export function thumbSrc(url, w = 256) {
  return `/_vercel/image?url=${encodeURIComponent(url)}&w=${w}&q=72`
}

// Grande image de la fiche (plafonnée à 240 px de haut à l'écran).
export function heroSrc(url) {
  return thumbSrc(url, 640)
}

// Fond d'ambiance de la fiche : flouté à 30 px, sa définition n'a aucune importance —
// 128 est la plus petite largeur autorisée et pèse quelques kilo-octets.
export function backdropSrc(url) {
  return thumbSrc(url, 128)
}
