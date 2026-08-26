import { useEffect } from 'react'

/**
 * La lettre d'un nom, TELLE QUE LE TRI LA RANGE — jamais telle qu'on aimerait qu'elle soit.
 * Tout ce qui n'est pas A–Z tombe dans « # ».
 *
 * ⚠️ Les sept jeux qui commencent par un chiffre forment CINQ groupes distincts (1, 2, 5, 7)
 * dans les sept premières cartes de la collection : sans cette fusion, l'indicateur
 * clignoterait cinq fois dès l'ouverture. `localeCompare('fr')` les range en un bloc contigu
 * en tête, donc un seul « # » est exact.
 *
 * ⚠️ « Les Aventuriers du Rail » donne **L**, pas A. La lettre suit le TRI : dire A ferait
 * mentir l'indicateur sur l'endroit où l'on se trouve. Si l'article doit être ignoré un
 * jour, c'est la clé de tri qu'il faut changer — et la lettre suivra toute seule.
 */
export function lettreDe(nom) {
  const c = (nom || '').trim().normalize('NFD').replace(/[̀-ͯ]/g, '').charAt(0).toUpperCase()
  return /[A-Z]/.test(c) ? c : '#'
}

// La ligne de lecture : juste sous la barre du haut. C'est la seule constante géométrique.
const LIGNE = 96

/**
 * Suit la traversée de la liste et pousse à l'ascenseur l'étiquette du groupe où l'on est.
 *
 * ⚠️⚠️ PLUS D'IntersectionObserver ICI — il a menti en production, et pour des raisons de
 * STRUCTURE, pas d'accident : (a) une ancre qui redescend sous la ligne en REMONTANT la
 * liste ne tire aucun événement (elle reste « intersecting » tout du long) → l'état ne
 * redescendait jamais, l'étiquette restait figée sur le groupe le plus bas jamais atteint ;
 * (b) un SAUT (la saisie de l'ascenseur fait un scrollTo instantané) fait passer les ancres
 * intermédiaires de « sous l'écran » à « au-dessus » sans qu'elles soient jamais visibles →
 * zéro événement pour elles. Et le banc d'essai ne peut PAS émettre les vrais événements IO
 * (page cachée), donc ces deux défauts étaient INVISIBLES aux tests — j'avais validé en
 * pilotant la callback à la main, ce qui ne prouvait rien.
 *
 * Le mécanisme retenu : un CACHE des ordonnées des ancres (≤ 26 lectures, refait au plus
 * une fois par seconde et au resize) + une recherche sur `scrollY` à chaque événement de
 * défilement. Zéro écriture de style, zéro lecture par carte : rien du calcul que l'audit
 * d'énergie avait fait retirer. Et surtout : `window.dispatchEvent(new Event('scroll'))`
 * exerce EXACTEMENT ce chemin — le test en banc vaut enfin preuve.
 *
 * Avant la première ancre → l'étiquette du PREMIER groupe ; après la dernière → celle du
 * DERNIER : les extrémités disent le début et la fin de la liste, jamais un état périmé.
 *
 * @param listRef  ref du conteneur de la liste (un enfant par jeu affiché)
 * @param ancres   Map(index de la première carte du groupe → étiquette), ou null si éteint
 * @param nb       le nombre de cartes attendues (garde contre les squelettes)
 * @param asc      ref de l'Ascenseur — `prepare(l)` pose sans réveiller, `montre(l)` réveille
 */
export function useLettreDefilement(listRef, ancres, nb, asc) {
  // L'effet ne se rejoue que si la COMPOSITION des groupes change.
  const cle = ancres ? [...ancres].map(([i, l]) => i + ':' + l).join(',') : ''
  useEffect(() => {
    const list = listRef.current
    if (!ancres || !list) return
    // Au-delà de 760px la liste est multi-colonnes : « la carte du haut » désignerait
    // plusieurs jeux. (Le CSS cache déjà l'ascenseur ; on ne calcule pas pour rien.)
    if (window.matchMedia && window.matchMedia('(min-width: 760px)').matches) return
    // Squelettes de chargement ou état vide : les enfants ne sont pas les cartes attendues.
    if (list.children.length !== nb) return

    let offsets = [] // [{ y, etiquette }] en ordre de page
    const recale = () => {
      const base = window.scrollY
      offsets = []
      ancres.forEach((etiquette, i) => {
        const el = list.children[i]
        if (el) offsets.push({ y: el.getBoundingClientRect().top + base, etiquette })
      })
    }
    const courante = () => {
      if (!offsets.length) return null
      // À la butée BASSE, la ligne de lecture montre l'avant-dernier écran — mais ce que la
      // position dit, c'est « la fin de la liste » : on affiche donc la DERNIÈRE étiquette
      // (retour user : les extrémités doivent dire le début et la fin, pas un entre-deux).
      const max = document.documentElement.scrollHeight - window.innerHeight
      if (max > 0 && window.scrollY >= max - 1) return offsets[offsets.length - 1].etiquette
      const ligne = window.scrollY + LIGNE
      // Avant la première ancre, on est DANS le premier groupe : son étiquette, pas du vide.
      let l = offsets[0].etiquette
      for (const o of offsets) {
        if (o.y <= ligne) l = o.etiquette
        else break
      }
      return l
    }

    recale()
    let precedente = courante()
    // La poignée doit être juste DÈS qu'elle apparaît : on pose la valeur sans réveiller.
    asc.current?.prepare?.(precedente)
    let dernierRecalage = Date.now()
    const onScroll = () => {
      // Le layout peut bouger (images, replis) : recalage au plus une fois par seconde —
      // 26 lectures propres, sans écriture préalable, donc sans reflow forcé.
      if (Date.now() - dernierRecalage > 1000) {
        recale()
        dernierRecalage = Date.now()
      }
      const l = courante()
      if (l !== precedente) {
        precedente = l
        asc.current?.montre?.(l)
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', recale)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', recale)
    }
  }, [cle, ancres, listRef, nb, asc])
}
