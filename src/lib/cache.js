import { openDB } from 'idb'

// Cache local (IndexedDB) de la collection, pour consulter les jeux hors ligne.
// On garde une copie de tous les jeux ; en ligne on la rafraîchit, hors ligne
// on la relit.

const DB_NAME = 'kalyx'
const STORE = 'games'

function getDb() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
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
