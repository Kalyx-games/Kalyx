// Le vocabulaire haptique de Kalyx.
//
// POURQUOI UN MODULE plutôt qu'un `navigator.vibrate()` posé à chaque endroit :
//  · pour qu'une même intention rende le même toucher partout — un cran de compteur ne
//    doit pas se sentir comme la prise d'une vignette ;
//  · pour qu'un seul interrupteur les coupe toutes (Réglages → Apparence) ;
//  · pour le LIMITEUR DE CADENCE : un appui maintenu sur « + » ou un glissé de pastille
//    peuvent déclencher des dizaines de crans par seconde, ce qui ne se sent plus comme
//    du grain mais comme un bourdonnement.
//
// ⚠️ La vibration ne marche que sur Chrome et Samsung Internet. **Firefox Android renvoie
// `true` sans rien faire** (l'API y est désactivée depuis la v79) — d'où la formulation
// prudente du réglage, et l'absence de tout message promettant qu'elle fonctionne.

const NIVEAUX = {
  touche: 8, // effleurement : on confirme qu'on a touché
  cran: 12, // un pas franchi (compteur, page, onglet)
  seuil: 22, // une limite atteinte, un choix qui bascule
  prise: 40, // on saisit ou on lâche un objet
  refus: [16, 40, 16], // l'action n'est pas possible
}

const CLE = 'kalyx-haptique'
const ECART_MINI = 55 // ms entre deux vibrations — en dessous, ça bourdonne

export const haptiqueDisponible = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'

let dernier = 0

/** L'utilisateur veut-il des vibrations ? (activées par défaut) */
export function haptiqueActive() {
  try {
    return localStorage.getItem(CLE) !== 'off'
  } catch {
    return true
  }
}

export function setHaptique(actif) {
  try {
    localStorage.setItem(CLE, actif ? 'on' : 'off')
  } catch {
    /* navigation privée : on ne peut pas mémoriser, tant pis */
  }
}

/**
 * Fait vibrer, si l'appareil sait le faire et si l'utilisateur le veut.
 * @param {'touche'|'cran'|'seuil'|'prise'|'refus'} nom
 * @param {{insiste?: boolean}} [options] `insiste` court-circuite le limiteur de cadence :
 *   à réserver aux gestes DISCRETS (poser un doigt sur Chwazi), jamais à une répétition.
 */
export function vibre(nom, options) {
  if (!haptiqueDisponible || !haptiqueActive()) return
  const motif = NIVEAUX[nom]
  if (motif == null) return
  const maintenant = Date.now()
  if (!options?.insiste && maintenant - dernier < ECART_MINI) return
  dernier = maintenant
  try {
    navigator.vibrate(motif)
  } catch {
    /* certains navigateurs la bloquent hors geste utilisateur */
  }
}
