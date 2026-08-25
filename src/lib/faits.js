import { playWinners, scoreCounts } from './plays'

/**
 * LE FAIT NOTABLE D'UNE PARTIE QU'ON VIENT D'ENREGISTRER.
 *
 * Quatre faits, un seul annoncé à la fois, par ordre de priorité. Le reste du temps —
 * quatre parties sur cinq — l'app dit simplement « Partie enregistrée. »
 *
 * ⚠️⚠️ TOUT CE FICHIER EST ÉCRIT CONTRE UNE BASE QU'ON A MESURÉE. Un fait FAUX est bien
 * pire que pas de fait, et cette base piège de cinq façons connues :
 *   1. `played_at` est l'heure de SAISIE, pas celle de la soirée (`played_at === created_at`
 *      sur 213 lignes sur 213). Une seule journée porte 48 % des parties, et 46 % des
 *      parties partagent leur minute avec une autre. → AUCUN fait ne parle de « quand ».
 *   2. En COOPÉRATIF, `playWinners` couronne toute la table, et le score est celui du
 *      groupe. → exclu de tout ce qui compare des joueurs ou des scores.
 *   3. En ÉQUIPES, le score de l'équipe est RECOPIÉ sur chaque membre. → exclu des scores.
 *   4. Une VICTOIRE DIRECTE a des scores nuls ou incomplets (deux parties de la base ont
 *      tous les totaux à zéro). → `scoreCounts` les écarte.
 *   5. Un nom qui contient un chiffre n'est pas une personne (cinq codes tapés de travers
 *      en base). → `vraiNom`.
 *
 * Fréquences MESURÉES sur les 213 parties existantes, en simulant l'ordre chronologique :
 * record 4 · palier 5 · record personnel 3 · première victoire 7 = **19, soit 8,9 %**.
 * Sur les seules journées calmes (≤ 8 parties), qui ressemblent le plus à l'usage à venir :
 * 8 faits sur 40, soit 20 %. Aucun fait pris seul ne dépasse 3,3 %.
 */

// Même règle que `anecdotes.js` : un nom qui contient un chiffre est un code tapé de travers.
const vraiNom = (n) => Boolean(n) && !/\d/.test(n)
const estCoop = (p) => Boolean(p?.outcome)
const estEquipes = (p) => (p?.players || []).some((x) => x && x.team)
const pluriel = (n, mot, plur) => `${n} ${n > 1 ? plur || mot + 's' : mot}`
const NBSP = ' '
// « Record de Abyss » ne se dit pas. On élide devant une voyelle — et devant elle SEULE :
// le h des noms propres est trop imprévisible pour être deviné (« de Hanabi » passe, « d'Hanabi »
// aussi ; on choisit la forme qui ne peut pas être fautive).
const de = (nom) => (/^[aàâeéèêëiîïoôuûùyAÀÂEÉÈÊËIÎÏOÔUÛÙY]/.test(nom || '') ? `d'${nom}` : `de ${nom}`)

/**
 * Une partie est COMPARABLE si elle porte des scores qui veulent dire quelque chose ET
 * qu'il y avait quelqu'un à battre. 54 parties sur 213 (25,4 %) ne le sont pas.
 * Renvoie `{ valeur, table }` — `table` = le nombre de sièges, qui sert à ne comparer que
 * ce qui est comparable : neuf jeux de la collection se jouent à des tailles de table
 * différentes (Fantasy Realms va de 178 points à 2 joueurs à 354 à 5).
 */
function comparable(p, sens) {
  if (sens === 'none') return null
  if (estCoop(p) || estEquipes(p) || !scoreCounts(p)) return null
  const totaux = (p?.players || [])
    .filter((x) => vraiNom((x?.name || '').trim()))
    .map((x) => Number(x?.total))
    .filter(Number.isFinite)
  if (totaux.length < 2) return null // solo : personne à battre
  return {
    valeur: sens === 'low' ? Math.min(...totaux) : Math.max(...totaux),
    table: (p?.players || []).length,
  }
}

const jourDe = (iso) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

/**
 * Le fait notable, ou null.
 *
 * @param jeu        la ligne `games`
 * @param parties    TOUTES les parties du jeu, la nouvelle comprise
 * @param nouvelleId l'id de la partie qu'on vient d'écrire
 * @param template   la fiche de score du jeu (pour le SENS du score)
 * @param dejaDit    Map(game_id → 'AAAA-M-J'), mémoire de SESSION — jamais persistée
 */
export function faitNotable({ jeu, parties, nouvelleId, template, dejaDit }) {
  if (!jeu || !Array.isArray(parties)) return null
  const nouvelle = parties.find((p) => p.id === nouvelleId)
  if (!nouvelle) return null
  const sens = template?.scoring || 'high'
  const autres = parties.filter((p) => p.id !== nouvelleId)

  // ── Deux gardes de contexte, communes aux quatre faits ────────────────────────────────
  // (a) LA RAFALE. On ne crie pas pendant qu'on tape un historique : 108 des 212 écarts
  //     entre parties consécutives de la base sont sous la minute, et la pire journée
  //     aurait produit quatorze records d'affilée.
  const t0 = Date.parse(nouvelle.played_at)
  const precedente = autres
    .map((p) => Date.parse(p.played_at))
    .filter((t) => Number.isFinite(t) && t <= t0)
    .sort((a, b) => b - a)[0]
  const rafale = Number.isFinite(t0) && Number.isFinite(precedente) && t0 - precedente < 120000

  // (b) UN SEUL FAIT PAR JEU ET PAR JOUR. Sans elle, une soirée de rattrapage décernerait
  //     six titres au même jeu.
  const aujourdhui = jourDe(nouvelle.played_at) || jourDe(new Date().toISOString())
  if (dejaDit && dejaDit.get(jeu.id) === aujourdhui) return null

  const retenir = (fait) => {
    if (dejaDit) dejaDit.set(jeu.id, aujourdhui)
    return fait
  }

  // ══ FAIT 1 — LE RECORD DU JEU ═════════════════════════════════════════════════════════
  // Mesuré : 4 fois sur 213 (1,9 %) ; ~7 % en régime calme.
  // ⚠️ La formulation ne parle JAMAIS de fraîcheur (« ce soir », « à l'instant ») : un
  // record peut tomber sur une partie réellement jouée il y a quatre ans et saisie ce matin.
  const c = comparable(nouvelle, sens)
  if (c && !rafale) {
    const passe = autres
      .map((p) => comparable(p, sens))
      .filter((x) => x && x.table === c.table)
      .map((x) => x.valeur)
    // ≥ 3 parties antérieures À LA MÊME TABLE : sans ce seuil, le « record » se déclenche
    // 46 % du temps aux parties 2-3 d'un jeu — c'est un détecteur de nouveauté déguisé.
    if (passe.length >= 3) {
      const ancien = sens === 'low' ? Math.min(...passe) : Math.max(...passe)
      const bat = sens === 'low' ? c.valeur < ancien : c.valeur > ancien // égaler n'est pas battre
      if (bat) {
        const noms = (nouvelle.players || [])
          .filter((x) => Number(x?.total) === c.valeur && vraiNom((x?.name || '').trim()))
          .map((x) => x.name.trim())
        return retenir({
          cle: 'record',
          titre: `Record ${de(jeu.name)} : ${ancien}${NBSP}→${NBSP}${c.valeur}`,
          sous: `${noms.join(', ')}, à ${c.table} joueurs${sens === 'low' ? ' — le plus petit score gagne' : ''}.`,
        })
      }
    }
  }

  // ══ FAIT 2 — LE PALIER DE PARTIES ═════════════════════════════════════════════════════
  // Le seul fait qui ne peut structurellement pas mentir : il compte des lignes.
  // Il marche donc aussi sur les 48 parties sans points et les 28 coopératives.
  // Mesuré : 5 fois sur 213 (2,3 %). Les paliers 50 et 100 dorment (le jeu le plus joué en
  // est à 26 parties) — ils ne coûtent rien et ne mentiront jamais.
  if ([10, 25, 50, 100].includes(parties.length)) {
    const personnes = new Set(
      parties.flatMap((p) => (p.players || []).map((x) => (x?.name || '').trim())).filter(vraiNom),
    )
    return retenir({
      cle: 'palier',
      titre: `${jeu.name} : ${parties.length}ᵉ partie enregistrée`,
      // Une sous-ligne qui se calcule sur la MÊME liste, donc invérifiable nulle part ailleurs
      // et impossible à contredire. On se tait plutôt que d'affirmer « un des plus joués »,
      // qu'il faudrait comparer aux autres jeux pour le savoir.
      sous: personnes.size > 1 ? `${pluriel(personnes.size, 'personne')} y ont joué.` : null,
    })
  }

  // ══ FAIT 3 — LE RECORD PERSONNEL ══════════════════════════════════════════════════════
  // Mesuré : 3 fois sur 213 (1,4 %). Sans le seuil de 3 parties antérieures, il sortirait
  // 29 % du temps — au-dessus de la barre d'une partie sur quatre.
  if (c && !rafale) {
    const candidats = []
    for (const j of nouvelle.players || []) {
      const nom = (j?.name || '').trim()
      const total = Number(j?.total)
      if (!vraiNom(nom) || !Number.isFinite(total)) continue
      const passe = autres
        .filter((p) => comparable(p, sens)?.table === c.table)
        .map((p) => (p.players || []).find((x) => (x?.name || '').trim() === nom))
        .map((x) => Number(x?.total))
        .filter(Number.isFinite)
      if (passe.length < 3) continue
      const ancien = sens === 'low' ? Math.min(...passe) : Math.max(...passe)
      if (sens === 'low' ? total < ancien : total > ancien) {
        candidats.push({ nom, ancien, nouveau: total, k: passe.length + 1 })
      }
    }
    if (candidats.length) {
      // Dans une partie à quatre, quatre records personnels peuvent tomber ensemble : on
      // n'en annonce qu'un, le plus gros écart (départage : ordre d'apparition).
      const g = candidats.reduce((a, b) => (Math.abs(b.nouveau - b.ancien) > Math.abs(a.nouveau - a.ancien) ? b : a))
      return retenir({
        cle: 'record-perso',
        titre: `${g.nom} bat son record à ${jeu.name} : ${g.ancien}${NBSP}→${NBSP}${g.nouveau}`,
        sous: `Sur ${pluriel(g.k, 'partie')} à ${c.table} joueurs.`,
      })
    }
  }

  // ══ FAIT 4 — LA PREMIÈRE VICTOIRE ═════════════════════════════════════════════════════
  // Mesuré : 7 fois sur 213 (3,3 %). Le plus fréquent des quatre, et le SEUL qui fonctionne
  // sur un jeu sans points — donc le seul qui couvre les 22,5 % de parties sans score.
  // ⚠️ hors coopératif : les 18 coops gagnées de la base décerneraient 61 « premières
  // victoires » d'un coup, puisque `playWinners` y couronne toute la table.
  if (!estCoop(nouvelle)) {
    const gagnants = playWinners(nouvelle).filter(vraiNom)
    const candidats = []
    for (const g of gagnants) {
      // On ne compte que les parties qui ont couronné QUELQU'UN : une partie sans vainqueur
      // enregistré (solo) n'est une défaite pour personne.
      const jouees = autres.filter(
        (p) => !estCoop(p)
          && playWinners(p).length > 0
          && (p.players || []).some((x) => (x?.name || '').trim() === g),
      )
      const v = jouees.filter((p) => playWinners(p).includes(g)).length
      const d = jouees.length - v
      if (v === 0 && d >= 2) candidats.push({ nom: g, d })
    }
    if (candidats.length) {
      const g = candidats.reduce((a, b) => (b.d > a.d ? b : a))
      return retenir({
        cle: 'premiere-victoire',
        titre: `Première victoire de ${g.nom} à ${jeu.name}`,
        sous: `Après ${pluriel(g.d, 'défaite')}.`,
      })
    }
  }

  return null
}
