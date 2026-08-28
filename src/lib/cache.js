import { openDB } from 'idb'

// Cache local (IndexedDB) de la collection, pour consulter les jeux hors ligne.
// On garde une copie de tous les jeux ; en ligne on la rafraîchit, hors ligne
// on la relit.

const DB_NAME = 'kalyx'
const STORE = 'games'
// Les « bulles » gérées : comptes (propriétaires) et tags. Elles portent le nom, les
// initiales et la couleur des pastilles. ⚠️ Sans ce cache, hors ligne l'app perd les
// initiales et les couleurs choisies et les recalcule — deux prénoms proches tombent
// alors sur les deux mêmes lettres. La clé est le NOM, comme partout ailleurs.
const BULLES = ['owners', 'tags']

function getDb() {
  return openDB(DB_NAME, 2, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
      for (const s of BULLES) {
        if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'name' })
      }
    },
  })
}

// Enregistre toute la liste des jeux dans le cache (remplace l'ancienne).
export async function saveGamesCache(games) {
  try {
    const db = await getDb()
    const tx = db.transaction(STORE, 'readwrite')
    await tx.store.clear()
    for (const g of games) await tx.store.put(g)
    await tx.done
  } catch {
    // Le cache est un confort : en cas d'échec, on ignore silencieusement.
  }
}

// Relit la liste des jeux depuis le cache (utilisé hors ligne).
export async function loadGamesCache() {
  try {
    const db = await getDb()
    return await db.getAll(STORE)
  } catch {
    return []
  }
}

// Comptes / tags : même contrat que les jeux — on remplace la liste entière en ligne,
// on la relit hors ligne. `kind` vaut 'owners' ou 'tags'.
export async function saveBubblesCache(kind, list) {
  if (!BULLES.includes(kind) || !Array.isArray(list)) return
  try {
    const db = await getDb()
    const tx = db.transaction(kind, 'readwrite')
    await tx.store.clear()
    for (const b of list) if (b && b.name) await tx.store.put(b)
    await tx.done
  } catch {
    // Le cache est un confort : en cas d'échec, on ignore silencieusement.
  }
}

export async function loadBubblesCache(kind) {
  if (!BULLES.includes(kind)) return []
  try {
    const db = await getDb()
    return await db.getAll(kind)
  } catch {
    return []
  }
}
