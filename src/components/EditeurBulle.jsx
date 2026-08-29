import { useMemo, useState } from 'react'
import { ownerColor, ownerInitials, OWNER_COLORS, muteOwnerColor, parseOwners } from '../lib/games'
import Avatar from './Avatar'
import { thumbSrc } from '../lib/img'
import { parseAvatar, formatAvatar, AVATAR_INITIALES, AVATAR_EMOJI, AVATAR_JEU, EMOJIS_PROPOSES } from '../lib/avatar'
import { tagVisiblePour } from '../lib/tags'

// L'ÉDITEUR d'une « bulle » : un COMPTE (avec son image) ou un TAG (sans).
// Extrait de BubbleListManager pour servir aussi l'écran Compte — la même main édite
// un compte, qu'on arrive par la liste des tags ou par le menu du compte.
//
// ⚠️ L'état est interne et initialisé une seule fois : l'appelant doit poser une `key`
// qui change avec la bulle éditée, sinon le formulaire garderait les valeurs de la
// précédente. C'est le motif React habituel, plus sûr qu'un effet de resynchronisation.

const PALETTE = OWNER_COLORS // une seule palette pour toute l'app (tons sourds de la charte)

export default function EditeurBulle({
  bulle, // la ligne à modifier, ou 'new'
  titre,
  namePlaceholder,
  avecAvatar = false,
  avecModeTag = false, // un TAG : il porte en plus son mode de filtrage, propre au compte
  compte = null, // le compte actif : c'est POUR LUI que le mode se règle
  apercuGrand = false, // l aperçu en tête, en grand : quand l éditeur EST l écran
  jeux = [],
  onValider, // (nom, initiales, couleur, avatar|undefined, bulleDOrigine, visibleMoi)
  onAnnuler,
}) {
  const neuf = bulle === 'new'
  const depart = neuf ? null : bulle
  const avatarDepart = parseAvatar(depart?.avatar)

  const [name, setName] = useState(depart?.name || '')
  const [initials, setInitials] = useState(depart ? depart.initials || ownerInitials(depart.name) : '')
  const [color, setColor] = useState(depart ? muteOwnerColor(depart.color) || ownerColor(depart.name) : PALETTE[0])
  const [initialsTouched, setInitialsTouched] = useState(!neuf)
  const [forme, setForme] = useState(avatarDepart.type)
  const [emoji, setEmoji] = useState(avatarDepart.type === AVATAR_EMOJI ? avatarDepart.valeur : '')
  const [jeuId, setJeuId] = useState(avatarDepart.type === AVATAR_JEU ? avatarDepart.valeur : '')
  // Le mode de filtrage du tag, POUR CE COMPTE. Un tag neuf naît masquant : c'est le
  // comportement que l'app a toujours eu, et le seul qui ne fasse rien réapparaître.
  const [visibleMoi, setVisibleMoi] = useState(tagVisiblePour(depart, compte))
  // Les valeurs de DÉPART, figées : elles disent si quelque chose a bougé. Sans ça,
  // un éditeur affiché en permanence propose « Enregistrer » alors qu il n y a rien à
  // enregistrer — le bouton ne dirait plus rien de l état.
  // ⚠️ useMemo sur `depart` et NON useState : dans le menu Compte l'éditeur reste monté après
  // l'enregistrement, et une référence figée au montage laissait « Enregistrer » allumé à vie —
  // ce qui annule exactement ce que cette référence sert à dire.
  const ref0 = useMemo(() => ({
    name: depart?.name || '',
    initials: depart ? depart.initials || ownerInitials(depart.name) : '',
    color: depart ? muteOwnerColor(depart.color) || ownerColor(depart.name) : PALETTE[0],
    avatar: depart?.avatar ?? null,
    // ⚠️ Sans cette valeur de départ, changer UNIQUEMENT le mode laisserait « Enregistrer »
    // éteint : on cliquerait dans le vide.
    visible: tagVisiblePour(depart, compte),
  }), [depart, compte])

  const onNameChange = (v) => {
    setName(v)
    if (!initialsTouched) setInitials(v.trim().slice(0, 2).toUpperCase())
  }

  const previewInitials = (initials || name).trim().slice(0, 2).toUpperCase() || '?'
  const avatarCourant = avecAvatar ? formatAvatar(forme, forme === AVATAR_EMOJI ? emoji : jeuId) : undefined
  // L'aperçu se construit sur les valeurs EN COURS d'édition, pas sur la ligne enregistrée.
  const apercu = { name: name || '?', initials: previewInitials, color, avatar: avatarCourant ?? null }
  const modifie =
    neuf ||
    name.trim() !== ref0.name ||
    (initials || name).trim().slice(0, 2).toUpperCase() !== ref0.initials ||
    color !== ref0.color ||
    (avecAvatar && (avatarCourant ?? null) !== ref0.avatar) ||
    (avecModeTag && visibleMoi !== ref0.visible)

  // Les jaquettes proposées : les jeux DU COMPTE d'abord (c'est sa collection), les autres
  // ensuite — un compte tout neuf n'a encore aucun jeu à son nom.
  const jeuxProposes = useMemo(() => {
    if (!avecAvatar) return []
    const avecImage = jeux.filter((g) => g.image_url)
    const nm = (depart ? depart.name : name).trim()
    if (!nm) return avecImage
    const sien = (g) => parseOwners(g.owner).includes(nm)
    return [...avecImage.filter(sien), ...avecImage.filter((g) => !sien(g))]
  }, [avecAvatar, jeux, depart, name])

  const valider = () => {
    const nm = name.trim()
    if (!nm) return
    // ⚠️ L'argument s'ajoute PAR LA FIN : `depart` doit rester en 5ᵉ position, App le lit là
    // (`if (!origine)`) — l'insérer avant ferait passer chaque édition pour une création.
    onValider(nm, (initials || name).trim().slice(0, 2).toUpperCase(), color, avatarCourant, depart, visibleMoi)
  }

  return (
    <div
      className="owner-editor"
      onKeyDown={(e) => {
        // Entrée sur un champ → on masque le clavier (blur) sur mobile.
        if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
          e.preventDefault()
          e.target.blur()
        }
      }}
    >
      {titre && <div className="owner-editor-title">{titre}</div>}
      {/* L aperçu en grand : un seul avatar, VIVANT (il suit emoji et couleur en direct).
          Deux avatars du même compte à quelques pixels d écart se contrediraient. */}
      {apercuGrand && avecAvatar && <Avatar compte={apercu} jeux={jeux} taille={72} className="oe-apercu-grand" />}

      <input className="oe-name" value={name} onChange={(e) => onNameChange(e.target.value)} placeholder={namePlaceholder} />
      {depart && name.trim() !== depart.name && (
        <p className="oe-rename-hint">Le nom sera aussi mis à jour sur tous les jeux concernés.</p>
      )}

      <div className="oe-row">
        <div className="oe-field">
          <span className="oe-label">Initiales</span>
          <input
            className="oe-initials"
            maxLength={2}
            value={initials}
            onChange={(e) => {
              setInitials(e.target.value.toUpperCase())
              setInitialsTouched(true)
            }}
            placeholder="MA"
          />
        </div>
        {avecAvatar ? (
          apercuGrand ? null : <Avatar compte={apercu} jeux={jeux} taille={44} className="oe-preview" />
        ) : (
          <span className="owner-bubble oe-preview" style={{ background: color }}>{previewInitials}</span>
        )}
      </div>

      {avecAvatar && (
        <div className="oe-field">
          <span className="oe-label">Image</span>
          <div className="chips av-formes">
            <button type="button" className={`fchip ${forme === AVATAR_INITIALES ? 'on' : ''}`} onClick={() => setForme(AVATAR_INITIALES)}>Initiales</button>
            <button type="button" className={`fchip ${forme === AVATAR_EMOJI ? 'on' : ''}`} onClick={() => setForme(AVATAR_EMOJI)}>Emoji</button>
            <button type="button" className={`fchip ${forme === AVATAR_JEU ? 'on' : ''}`} onClick={() => setForme(AVATAR_JEU)}>Jaquette</button>
          </div>

          {forme === AVATAR_EMOJI && (
            <>
              <div className="av-emojis">
                {EMOJIS_PROPOSES.map((e) => (
                  <button key={e} type="button" className={`av-emoji ${emoji === e ? 'sel' : ''}`} onClick={() => setEmoji(e)}>{e}</button>
                ))}
              </div>
              <input
                className="input av-emoji-libre"
                value={emoji}
                onChange={(e) => setEmoji([...e.target.value.trim()].slice(0, 2).join(''))}
                placeholder="ou le vôtre"
                aria-label="Emoji du compte"
              />
            </>
          )}

          {forme === AVATAR_JEU &&
            (jeuxProposes.length === 0 ? (
              <p className="field-hint">Aucun jeu avec une image pour l'instant.</p>
            ) : (
              <div className="av-jeux">
                {jeuxProposes.slice(0, 40).map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    className={`av-jeu ${jeuId === g.id ? 'sel' : ''}`}
                    onClick={() => setJeuId(g.id)}
                    title={g.name}
                    aria-label={g.name}
                  >
                    <img src={thumbSrc(g.image_url, 256)} alt="" loading="lazy" />
                  </button>
                ))}
              </div>
            ))}
        </div>
      )}

      {/* Le mode de filtrage, propre à ce compte : l'écran étant le menu Compte, le
          contexte est déjà posé — le libellé n'a pas à le redire. */}
      {avecModeTag && compte && (
        <div className="oe-field">
          <span className="oe-label">Les jeux tagués</span>
          <div className="chips">
            <button type="button" className={`fchip ${visibleMoi ? '' : 'on'}`} onClick={() => setVisibleMoi(false)}>Masqués</button>
            <button type="button" className={`fchip ${visibleMoi ? 'on' : ''}`} onClick={() => setVisibleMoi(true)}>Visibles</button>
          </div>
          {/* L'indice ne paraît que sur « Masqués » : c'est le seul des deux à laisser une
              question ouverte (« et je les retrouve comment ? »). */}
          {!visibleMoi && <p className="field-hint">Ils reviennent en cochant le tag.</p>}
        </div>
      )}

      <div className="oe-field">
        <span className="oe-label">Couleur</span>
        <div className="palette">
          {PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              className={`swatch ${color === c ? 'sel' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
              aria-label={`Couleur ${c}`}
            />
          ))}
        </div>
      </div>

      <div className="oe-actions">
        {/* Pas d Annuler quand l éditeur est l écran lui-même : il n y aurait rien à refermer. */}
        {onAnnuler && <button type="button" className="btn-ghost" onClick={onAnnuler}>Annuler</button>}
        <button type="button" className="owner-add-btn" onClick={valider} disabled={!name.trim() || !modifie}>
          {neuf ? 'Ajouter' : 'Enregistrer'}
        </button>
      </div>
    </div>
  )
}
