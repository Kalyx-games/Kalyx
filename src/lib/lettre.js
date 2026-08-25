import { useEffect } from 'react'

/**
 * La lettre d'un nom, TELLE QUE LE TRI LA RANGE — jamais telle qu'on aimerait qu'elle soit.
 * Tout ce qui n'est pas A–Z tombe dans « # ».
 *
 * ⚠️ Les sept jeux qui commencent par un chiffre forment CINQ groupes distincts (1, 2, 5, 6, 7)
 * dans les sept premières cartes de la collection : sans cette fusion, l'indicateur clignoterait
 * cinq fois dès l'ouverture. `localeCompare('fr')` les range en un bloc contigu en tête, donc
 * un seul « # » est exact.
 *
 * ⚠️ « Les Aventuriers du Rail » donne **L**, pas A. La lettre suit le TRI : dire A ferait mentir
 * l'indicateur sur l'endroit où l'on se trouve dans la liste. Si l'article doit être ignoré,
 * c'est la clé de tri qu'il faut changer — et la lettre suivra toute seule.
 */
export function lettreDe(nom) {
  const c = (nom || '').trim().normalize('NFD').replace(/[̀-ͯ]/g, '').charAt(0).toUpperCase()
  return /[A-Z]/.test(c) ? c : '#'
}

// La ligne de lecture : juste sous la barre du haut. C'est la seule constante géométrique.
const LIGNE = 96

/**
 * Suit la traversée de la liste et annonce la lettre du groupe où l'on se trouve.
 *
 * ⚠️⚠️ CE HOOK EXISTE POUR NE PAS REFAIRE LE CALCUL QUE L'AUDIT D'ÉNERGIE A RETIRÉ.
 * Ce calcul-là écrivait un style (qui invalide la mise en page) puis lisait
 * `getBoundingClientRect()` deux fois par carte — 288 lectures sur 144 cartes, chacune forçant
 * un recalcul complet et synchrone, à chaque frappe dans la recherche (~20 ms mesurés sur 89).
 *
 * Ici : **zéro `getBoundingClientRect`, zéro écriture de style, zéro nœud créé.** On observe les
 * cartes qui existent déjà — une par groupe, 26 au maximum — et on lit `boundingClientRect` de
 * l'entrée, que le navigateur a DE TOUTE FAÇON calculé pour sa propre passe d'intersection.
 * Le travail par déclenchement : un balayage de vingt-six booléens.
 *
 * @param listRef  ref du conteneur de la liste (un enfant par jeu affiché)
 * @param ancres   Map(index de la première carte du groupe → lettre), ou null si éteint
 * @param nb       le nombre de cartes attendues (garde contre les squelettes)
 * @param montre   (lettre) => void — appelé sur le composant d'affichage, PAS sur App
 */
export function useLettreDefilement(listRef, ancres, nb, montre) {
  // L'effet ne se rejoue que si la COMPOSITION des groupes change. Ajouter une carte à
  // l'intérieur d'un groupe ne change ni sa première carte ni son nœud : rien à refaire.
  const cle = ancres ? [...ancres].map(([i, l]) => i + ':' + l).join(',') : ''
  useEffect(() => {
    const list = listRef.current
    if (!ancres || !list) return
    // Au-delà de 760px la liste passe elle-même en plusieurs colonnes : « la carte du haut »
    // désignerait alors plusieurs jeux, donc plusieurs lettres.
    if (window.matchMedia && window.matchMedia('(min-width: 760px)').matches) return
    // Squelettes de chargement ou état vide : les enfants ne sont pas les cartes attendues.
    if (list.children.length !== nb) return

    const etats = []
    const parEl = new Map()
    ;[...ancres].forEach(([i, lettre], k) => {
      const el = list.children[i]
      if (!el) return
      etats[k] = { lettre, dessus: false }
      parEl.set(el, k)
    })
    if (!parEl.size) return

    let premier = true
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const k = parEl.get(e.target)
          if (k != null && etats[k]) etats[k].dessus = e.boundingClientRect.top <= LIGNE
        }
        let cour = null
        for (const s of etats) if (s && s.dessus) cour = s.lettre
        // La première salve rapporte l'état de chaque cible : la consommer sans rien afficher,
        // sinon la lettre clignote au montage et à chaque restauration d'écran.
        if (premier) { premier = false; return }
        if (cour && window.scrollY > 48) montre(cour)
      },
      { rootMargin: `-${LIGNE}px 0px 0px 0px`, threshold: 0 },
    )
    parEl.forEach((_, el) => io.observe(el))
    return () => io.disconnect()
  }, [cle, ancres, listRef, nb, montre])
}
