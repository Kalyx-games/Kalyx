// LA DENSITÉ DE LA VUE GRILLE — combien de jeux tiennent sur une rangée.
//
// ⚠️ RÉGLAGE D'APPAREIL (localStorage), et non de compte : ce qu'on accommode ici, c'est la
// taille d'un écran, pas un goût qui devrait suivre la personne d'un téléphone à l'autre.
// C'est pourquoi il vit dans Réglages → Apparence, à côté du thème, et non dans le menu
// Compte où sont les préférences qui voyagent.
//
// ⚠️ LES TROIS CHOIX SONT NOMMÉS PAR LA TAILLE DES TUILES, jamais par un nombre de colonnes :
// ce nombre dépend de la largeur du téléphone (voir `.list.list-grid` dans index.css, qui
// refuse de descendre sous un plancher et rend alors moins de colonnes). Un libellé
// « 4 colonnes » mentirait sur un petit écran.
//
// Calqué sur `theme.js` : même clé unique, même attribut sur <html>, même valeur par défaut
// sans attribut — et le script anti-FOUC d'index.html le pose AVANT le rendu, sinon la grille
// se redessinerait sous les yeux au démarrage.

const KEY = 'kalyx-densite'

export const DENSITES = [
  { valeur: 'grandes', label: 'Grandes' },
  { valeur: 'moyennes', label: 'Moyennes' },
  { valeur: 'petites', label: 'Petites' },
]

export function getDensite() {
  try {
    const d = localStorage.getItem(KEY)
    return d === 'grandes' || d === 'petites' ? d : 'moyennes'
  } catch {
    return 'moyennes'
  }
}

export function applyDensite(d) {
  try {
    localStorage.setItem(KEY, d)
  } catch {
    /* stockage indispo : tant pis, le réglage vaut pour la session */
  }
  const root = document.documentElement
  // « moyennes » = AUCUN attribut : c'est la valeur par défaut du CSS, donc la grille
  // d'aujourd'hui reste exactement ce qu'elle est pour qui ne touche à rien.
  if (d === 'grandes' || d === 'petites') root.setAttribute('data-densite', d)
  else root.removeAttribute('data-densite')
}
