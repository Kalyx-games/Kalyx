import { useEffect, useState } from 'react'

// UN RÉGLAGE À DEUX ÉTATS — deux segments accolés et une pastille qui glisse dessous.
//
// Retour user : « quand j'appuie, ça met un petit délai avant de basculer d'un bouton à
// l'autre. Ça pourrait être bien d'avoir un toggle pour ce genre de bouton à 2 états (en règle
// générale) et d'avoir un feedback si un chargement est en cours ».
//
// Deux choses, donc, et elles vivent toutes les deux ICI plutôt que chez chaque appelant :
//
//  1. ⚠️ LA BASCULE EST OPTIMISTE. Le délai venait de l'aller-retour : on écrivait en base, on
//     rechargeait la table, et l'état ne changeait qu'ensuite. La pastille glisse désormais au
//     doigt, et l'écriture suit. Si elle échoue, on revient à la valeur réelle — c'est la seule
//     façon de rester rapide sans mentir.
//  2. Pendant l'écriture, la pastille RESPIRE (une pulsation douce). Discret, mais on sait que
//     quelque chose est en cours, et un second tap est ignoré.
//
// La pastille qui glisse est la grammaire du bac de navigation (`.navbar-pill`) : c'est déjà
// la façon dont cette app dit « on passe d'un état à l'autre ».
//
// `onChange` peut être synchrone (un simple setState) ou rendre une promesse (une écriture) :
// le composant s'adapte, il n'attend que ce qui est attendable.
export default function Bascule({ options, valeur, onChange, disabled = false, ariaLabel }) {
  // La valeur cliquée, tant que la vraie ne l'a pas rejointe. `undefined` = rien en attente
  // (et non `null`, qui pourrait être une valeur légitime).
  const [optimiste, setOptimiste] = useState(undefined)
  const [enCours, setEnCours] = useState(false)
  const affichee = optimiste !== undefined ? optimiste : valeur
  const idx = Math.max(0, options.findIndex((o) => o.valeur === affichee))

  // Dès que la valeur réelle rejoint celle qu'on affiche, on lâche l'optimisme.
  useEffect(() => {
    if (optimiste !== undefined && valeur === optimiste) setOptimiste(undefined)
  }, [valeur, optimiste])

  const choisir = async (v) => {
    if (disabled || enCours || v === affichee) return
    setOptimiste(v)
    setEnCours(true)
    try {
      await onChange(v)
    } catch {
      setOptimiste(undefined) // l'écriture a échoué : on revient à la vérité
    } finally {
      setEnCours(false)
    }
  }

  return (
    <div className={`bascule${enCours ? ' en-cours' : ''}`} role="group" aria-label={ariaLabel}>
      <span
        className="bascule-pastille"
        style={{ transform: `translateX(${idx * 100}%)` }}
        aria-hidden="true"
      />
      {options.map((o) => (
        <button
          key={String(o.valeur)}
          type="button"
          className={`bascule-seg${o.valeur === affichee ? ' on' : ''}`}
          onClick={() => choisir(o.valeur)}
          disabled={disabled}
          aria-pressed={o.valeur === affichee}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
