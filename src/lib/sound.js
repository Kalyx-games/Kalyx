// Petit synthétiseur pour le Chwazi — 100 % synthétisé (aucun fichier), donc hors ligne.
//  - notes rondes et graves quand on pose un doigt,
//  - un « uplifter » (montée continue) pendant le décompte,
//  - un effet sonore d'impact au moment du choix.
//
// L'AudioContext ne peut être créé qu'après un geste utilisateur (le 1er doigt posé
// en est un). Tout est protégé : si l'audio n'est pas dispo, on ignore en silence.

let ctx = null
let master = null // entrée « sèche » (dry)
let reverbIn = null // entrée de la réverb (wet)

function makeImpulse(context, duration, decay) {
  const rate = context.sampleRate
  const len = Math.floor(rate * duration)
  const buf = context.createBuffer(2, len, rate)
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch)
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay)
    }
  }
  return buf
}

// Soft-clip (courbe tanh) : borne MATHÉMATIQUEMENT le signal à ±1 → aucun « clipping »
// dur n'est plus possible, quel que soit le volume qu'on pousse en amont. Les pics sont
// arrondis en douceur (saturation musicale imperceptible) au lieu d'écrêter sec.
// L'oversample 4× limite le repliement (aliasing) que produirait la non-linéarité.
function makeSoftClip(context) {
  const ws = context.createWaveShaper()
  const n = 2048
  const curve = new Float32Array(n)
  const k = 2.2 // douceur du genou
  const norm = Math.tanh(k)
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1
    curve[i] = Math.tanh(k * x) / norm
  }
  ws.curve = curve
  ws.oversample = '4x'
  return ws
}

function ensure() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume()
    return ctx
  }
  const C = window.AudioContext || window.webkitAudioContext
  if (!C) return null
  ctx = new C()

  // Chaîne de sortie : limiteur (compresseur) → soft-clip → sortie.
  // 1) le compresseur rattrape la dynamique et rapproche du plafond ;
  // 2) le soft-clip garantit qu'AUCUN échantillon ne dépasse ±1 → jamais de saturation
  //    dure, même quand on pousse le volume fort et que plusieurs doigts se superposent.
  const shaper = makeSoftClip(ctx)
  shaper.connect(ctx.destination)

  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -10 // attrape plus tôt → plus fort et plus régulier
  comp.knee.value = 6
  comp.ratio.value = 20
  comp.attack.value = 0.002
  comp.release.value = 0.14
  comp.connect(shaper)

  master = ctx.createGain()
  master.gain.value = 3.4 // fort ; limiteur + soft-clip tiennent le plafond sans écrêter
  master.connect(comp)

  const conv = ctx.createConvolver()
  conv.buffer = makeImpulse(ctx, 1.8, 3.2)
  const wet = ctx.createGain()
  wet.gain.value = 0.16
  conv.connect(wet)
  wet.connect(comp)
  reverbIn = ctx.createGain()
  reverbIn.gain.value = 1
  reverbIn.connect(conv)

  return ctx
}

// Une « voix » ronde : sinus + sous-octave (chaleur/grave) + octave (brillance légère).
function voice(freq, { when = 0, dur = 0.6, level = 0.5, bright = 1600, sub = 0.35, oct = 0.1, attack = 0.02 } = {}) {
  if (!ctx) return
  const t = ctx.currentTime + when

  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(level, t + attack) // attaque douce
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur) // extinction longue et lisse

  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.Q.value = 0.5
  lp.frequency.setValueAtTime(bright, t)
  lp.frequency.exponentialRampToValueAtTime(Math.max(300, bright * 0.4), t + dur)

  const o1 = ctx.createOscillator()
  o1.type = 'sine'
  o1.frequency.value = freq
  o1.connect(lp)

  if (sub > 0) {
    const os = ctx.createOscillator()
    os.type = 'sine'
    os.frequency.value = freq / 2 // sous-octave → rondeur et grave
    const gs = ctx.createGain()
    gs.gain.value = sub
    os.connect(gs)
    gs.connect(lp)
    os.start(t)
    os.stop(t + dur + 0.05)
  }
  if (oct > 0) {
    const oo = ctx.createOscillator()
    oo.type = 'sine'
    oo.frequency.value = freq * 2
    const go = ctx.createGain()
    go.gain.value = oct
    oo.connect(go)
    go.connect(lp)
    oo.start(t)
    oo.stop(t + dur + 0.05)
  }

  lp.connect(g)
  g.connect(master)
  if (reverbIn) g.connect(reverbIn)

  o1.start(t)
  o1.stop(t + dur + 0.05)
}

const C4 = 261.63
const midi = (semi) => C4 * Math.pow(2, semi / 12)
const PENTA = [0, 2, 4, 7, 9] // gamme pentatonique majeure

// Doigt posé : note ronde et grave qui monte d'un cran à chaque doigt. Volume poussé
// (le soft-clip de la chaîne empêche toute saturation dure).
export function playFinger(index) {
  try {
    if (!ensure()) return
    const octave = Math.floor(index / PENTA.length)
    const semi = PENTA[index % PENTA.length] + 12 * octave - 12 // une octave SOUS le Do4 → grave
    voice(midi(semi), { dur: 1.0, level: 1.7, bright: 1500, sub: 0.4, oct: 0.06, attack: 0.008 })
  } catch {
    /* pas de son : tant pis */
  }
}

// ----- Uplifter du décompte : une montée de notes rondes (pentatonique) qui monte
// en hauteur ET accélère vers la fin, le volume enflant → riser MUSICAL (pas de
// bruit/whoosh). Programmé par petits timers pour pouvoir l'annuler si le décompte
// repart. -----
let riserTimers = []
export function startRiser(duration = 3) {
  try {
    if (!ensure()) return
    stopRiser()
    const N = 15
    const startSemi = -17 // départ grave
    for (let i = 0; i < N; i++) {
      const frac = i / (N - 1)
      // Onsets qui se resserrent vers la fin (accelerando).
      const when = duration * 0.94 * Math.pow(frac, 0.62)
      const semi = startSemi + PENTA[i % PENTA.length] + 12 * Math.floor(i / PENTA.length)
      const level = 0.14 + 0.3 * frac // le volume enfle
      const bright = 1100 + 2200 * frac // s'ouvre un peu vers l'aigu
      const id = setTimeout(() => {
        voice(midi(semi), { dur: 0.5, level, bright, sub: 0.25, oct: 0.08 })
      }, Math.round(when * 1000))
      riserTimers.push(id)
    }
  } catch {
    /* rien */
  }
}
export function stopRiser() {
  riserTimers.forEach(clearTimeout)
  riserTimers = []
}

// ----- Choix : l'apothéose. MÊME timbre rond (cloches sinus) que le reste de l'appli,
// mais en plus GRAND : un empilement OUVERT (fondamentale + quinte + octave, sans
// tierce → épique, pas « guilleret ») qui « éclot » (notes légèrement décalées),
// soutenu par un grave, avec une longue résonance. Se détache par la taille, pas
// par un timbre étranger. -----
export function playReveal() {
  try {
    if (!ensure()) return
    // Accord OUVERT avec une NEUVIÈME (add9, sans tierce) → couleur flottante,
    // en suspension (ne se referme pas), pas une cadence conclusive.
    // [demi-ton, when (décalage d'éclosion), dur, level, brillance, sous-octave]
    const notes = [
      [-12, 0.0, 2.9, 0.46, 1500, 0.5], // fondamentale grave (poids)
      [0, 0.03, 2.9, 0.42, 2000, 0.28], // fondamentale
      [7, 0.06, 2.8, 0.34, 2400, 0.15], // quinte
      [14, 0.1, 2.8, 0.32, 3000, 0.0], // NEUVIÈME → suspension/flottement
      [26, 0.15, 2.3, 0.14, 4600, 0.0], // neuvième aiguë → scintillement aérien
    ]
    notes.forEach(([semi, when, dur, level, bright, sub]) =>
      voice(midi(semi), { when, dur, level, bright, sub, oct: 0.14 })
    )
  } catch {
    /* rien */
  }
}

// Libère complètement l'audio (à la fermeture du Chwazi). Sans ça, le contexte reste
// « running » : le fil audio continue de tourner en arrière-plan et consomme de la
// batterie alors qu'on ne joue plus rien. Le prochain usage recréera tout via ensure().
export function closeAudio() {
  try {
    stopRiser()
    if (ctx) {
      ctx.close()
      ctx = null
      master = null
      reverbIn = null
    }
  } catch {
    /* rien */
  }
}
