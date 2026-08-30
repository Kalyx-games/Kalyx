import { useEffect, useState } from 'react'
import NameField from './NameField'
import { DescendreIcon, MonterIcon, XIcon } from './icons'

// LES JOUEURS FRÉQUENTS DU COMPTE — la table qu'on remet en place d'un tap au début d'une
// partie, quel que soit le jeu.
//
// ⚠️ C'est une DONNÉE DU COMPTE (comme les tags), pas un réglage d'apparence : chaque foyer a
// ses habitués. Elle vit donc dans `owners.prefs.joueursFrequents` et suit le compte d'un
// téléphone à l'autre.
//
// ⚠️ La LISTE EST ORDONNÉE : c'est l'ordre dans lequel les joueurs s'assoiront. Le geste de
// réordonnancement est un simple « monter » — répété, il suffit à obtenir n'importe quel
// ordre, sans introduire un glissé de plus dans l'app.
const MAX = 8 // au-delà, ce n'est plus un raccourci ; et aucune table de l'app ne dépasse 8

export default function JoueursFrequents({ liste = [], playerNames = [], online = true, onChange }) {
  const [ajout, setAjout] = useState('')
  const [focused, setFocused] = useState(null)
  // ⚠️ LISTE OPTIMISTE, même principe que `Bascule` : sans elle, chaque ajout attendrait
  // l'écriture EN BASE puis la relecture de la table avant de s'afficher — exactement le délai
  // que l'user avait signalé sur les interrupteurs. Elle exige que `onChange` REJETTE en cas
  // d'échec (c'est le contrat de `handlePrefCompte`), sinon l'optimisme deviendrait un mensonge.
  const [enVol, setEnVol] = useState(null)
  const vue = enVol ?? liste
  // Dès que la valeur réelle rejoint celle qu'on affiche, on lâche l'optimisme.
  useEffect(() => {
    // ⚠️ Comparaison EXACTE : un séparateur qui pourrait apparaître dans un nom
    // confondrait [« Mathieu », « D »] et [« Mathieu D »].
    if (enVol && JSON.stringify(enVol) === JSON.stringify(liste)) setEnVol(null)
  }, [liste, enVol])

  const poser = async (l) => {
    setEnVol(l)
    try {
      await onChange(l)
    } catch {
      setEnVol(null) // l'écriture a échoué : on revient à la vérité
    }
  }

  const dejaLa = (n) => vue.some((x) => x.toLowerCase() === n.trim().toLowerCase())
  const ajouter = (nom) => {
    const n = (nom ?? ajout).trim()
    setAjout('')
    if (!n || vue.length >= MAX || dejaLa(n)) return
    poser([...vue, n])
  }
  const retirer = (i) => poser(vue.filter((_, k) => k !== i))
  // Un seul mécanisme pour les deux flèches : on échange la ligne avec sa voisine.
  const bouger = (i, pas) => {
    const j = i + pas
    if (j < 0 || j >= vue.length) return
    const l = [...vue]
    ;[l[i], l[j]] = [l[j], l[i]]
    poser(l)
  }

  // On ne propose pas ceux qui sont déjà dans la liste.
  const suggestions = playerNames.filter((n) => !dejaLa(n))

  return (
    <section className="settings-card">
      <h3>Joueurs fréquents</h3>

      {vue.length > 0 && (
        <ul className="owner-list">
          {vue.map((nom, i) => (
            <li key={nom}>
              <span className="owner-name-txt">{nom}</span>
              {online && (
                <>
                  {/* ⚠️ Les deux flèches sont TOUJOURS rendues, éteintes aux extrémités : une
                      colonne de boutons qui change de largeur d'une ligne à l'autre se lit
                      comme une erreur. Elles sont collées (elles font un seul contrôle) et ne
                      portent PAS `.owner-del` — réordonner n'est pas supprimer. */}
                  <span className="owner-moves">
                    <button
                      type="button"
                      className="owner-move"
                      onClick={() => bouger(i, -1)}
                      disabled={i === 0}
                      title="Monter"
                      aria-label={`Monter ${nom}`}
                    >
                      <MonterIcon />
                    </button>
                    <button
                      type="button"
                      className="owner-move"
                      onClick={() => bouger(i, 1)}
                      disabled={i === vue.length - 1}
                      title="Descendre"
                      aria-label={`Descendre ${nom}`}
                    >
                      <DescendreIcon />
                    </button>
                  </span>
                  <button
                    type="button"
                    className="owner-del"
                    onClick={() => retirer(i)}
                    title="Retirer"
                    aria-label={`Retirer ${nom}`}
                  >
                    <XIcon size={16} />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {online && vue.length < MAX && (
        <div className="owner-add jf-ajout-row">
          {/* ⚠️ `NameField` remet `focused` à null JUSTE APRÈS avoir appelé `onPick`, et son
              `onMouseDown` fait `preventDefault` : le champ garde le focus du navigateur, donc
              aucun `onFocus` ne se redéclenchera. Les propositions restaient closes pour le nom
              suivant alors que le curseur était encore dans le champ. On les rouvre après coup.
              ⛔ Le bouton « Ajouter » est RETIRÉ (retour user) : on tape une proposition, ou on
              valide avec Entrée — le clavier affiche « OK » grâce à `enterKeyHint`. */}
          <NameField
            id="jf-ajout"
            className="input"
            value={ajout}
            onChange={setAjout}
            onPick={(n) => {
              ajouter(n)
              queueMicrotask(() => setFocused('jf-ajout'))
            }}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              e.preventDefault()
              ajouter()
            }}
            enterKeyHint="done"
            placeholder="Ajouter un joueur"
            playerNames={suggestions}
            focused={focused}
            setFocused={setFocused}
          />
        </div>
      )}

      {/* La seule chose qu'on ne peut PAS deviner depuis cet écran : ce que la liste sert à
          faire, et où. Elle disparaît dès qu'il y a un nom — le geste est alors connu. */}
      {vue.length === 0 && (
        <p className="field-hint">Un bouton les assoit d’un tap au début d’une partie.</p>
      )}
    </section>
  )
}
