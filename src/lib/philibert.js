// Lien de recherche Philibert pour un jeu (ouvert dans un nouvel onglet).
// On n'auto-remplit pas le prix : la page Philibert mélange produits mis en avant
// et vrais résultats (le 1er est souvent un accessoire), donc le prix serait peu
// fiable. Mieux vaut ouvrir la recherche et laisser l'utilisateur saisir le prix.
export function philibertSearchUrl(name) {
  // Le bon paramètre est `search_query` : avec `s=`, Philibert redirige vers l'accueil.
  return `https://www.philibertnet.com/fr/recherche?controller=search&search_query=${encodeURIComponent(name)}`
}
