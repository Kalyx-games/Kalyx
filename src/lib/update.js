import { hardReload } from './lazyRetry'

// Vérifier soi-même s'il existe une version plus récente EN LIGNE.
//
// Pourquoi ne pas se fier au service worker : quand il se coince (et ça arrive), l'app
// installée continue de servir l'ancienne page indéfiniment, sans que rien ne le signale.
// Ici on va chercher l'index.html au réseau, on compare le nom du bundle qu'il référence
// avec celui que la page a réellement chargé, et si ça diffère on repart de zéro.
//
// Le paramètre d'horodatage est indispensable : sans lui l'URL correspond à une entrée du
// précache et c'est le service worker (donc l'ancienne version) qui répondrait.
export async function checkForUpdate() {
  const res = await fetch('/index.html?u=' + Date.now(), { cache: 'no-store' })
  if (!res.ok) throw new Error('réseau')
  const html = await res.text()
  const enLigne = (html.match(/assets\/index-[^"']+\.js/) || [])[0]
  const charge = [...document.querySelectorAll('script[src]')]
    .map((s) => s.getAttribute('src') || '')
    .map((s) => (s.match(/assets\/index-[^"']+\.js/) || [])[0])
    .find(Boolean)
  if (!enLigne) throw new Error('illisible')
  // Pas de bundle repérable dans la page (cas improbable) : on considère qu'il faut renouveler.
  return { aJour: Boolean(charge) && enLigne === charge, enLigne, charge }
}

// Renouvellement complet : on jette le service worker et ses caches, puis on recharge.
export async function forceUpdate() {
  await hardReload()
}
