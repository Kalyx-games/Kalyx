// ============ Icônes Kalyx — système « pièces de jeu » ============
// RÈGLES (à respecter pour toute nouvelle icône) :
//  · viewBox 24×24, formes GÉOMÉTRIQUES PLEINES (fill), coins arrondis (strokeLinejoin
//    round sur le même tracé, ou rx sur les rects) — comme des pions/jetons de jeu.
//  · UNE seule couleur : currentColor (l'icône hérite du texte à côté d'elle). Les seules
//    icônes multicolores tolérées sont celles de la NAVBAR + le logo Chwazi (choix user).
//  · Les GLYPHES (✓ ✕ flèches chevrons) restent en TRAIT (stroke 2.2-2.4, bouts ronds).
//  · Tailles utilisées : 13-14 (dans une ligne de texte), 20 (boutons), 24 (navbar).
//  · Vocabulaire du jeu : triangle = joueur (pion), étoile = idéal, quartier de cercle =
//    durée, carrés emboîtés = extension, dé = partie, couronne = victoire.
//  · Emoji autorisé uniquement à ≥ 2rem, seul dans son bloc (état vide, anecdote) —
//    jamais dans un bouton ni dans une ligne de texte.

// Enveloppe commune des icônes PLEINES (une couleur, héritée du texte).
function Ico({ size = 20, children }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true" focusable="false" className="ico">
      {children}
    </svg>
  )
}

// 👥 Joueurs = deux PIONS (triangles arrondis), le second en retrait.
export function PlayersIcon({ size = 20 }) {
  return (
    <Ico size={size}>
      <path d="M16.6 5.6 21.2 13.9 H12 Z" opacity=".5" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M8.4 7.4 14.2 17.6 H2.6 Z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
    </Ico>
  )
}

// ⭐ Idéal = étoile pleine.
export function StarIcon({ size = 20 }) {
  return (
    <Ico size={size}>
      <path
        d="M12 3.6l2.47 5 5.53.8-4 3.9.94 5.5L12 16.2l-4.94 2.6.94-5.5-4-3.9 5.53-.8z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </Ico>
  )
}

// 🕑 Durée = cadran avec un QUARTIER plein (le temps qui passe, en géométrie pure).
export function ClockIcon({ size = 20 }) {
  return (
    <Ico size={size}>
      <circle cx="12" cy="12" r="8.4" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <path d="M12 12V6.4A5.6 5.6 0 0 1 17.6 12Z" />
    </Ico>
  )
}

// 🧩 Extension = un MODULE qui s'emboîte (petit carré ajouté au grand).
export function ExtIcon({ size = 20 }) {
  return (
    <Ico size={size}>
      <rect x="2.8" y="8.2" width="13" height="13" rx="3.2" />
      <rect x="13.6" y="2.8" width="7.6" height="7.6" rx="2.2" opacity=".5" />
    </Ico>
  )
}

// 🎲 Partie = dé (points évidés par fill-rule evenodd → une seule couleur).
export function DieIcon({ size = 20 }) {
  return (
    <Ico size={size}>
      <path
        fillRule="evenodd"
        d="M8.4 3.4h7.2a5 5 0 0 1 5 5v7.2a5 5 0 0 1-5 5H8.4a5 5 0 0 1-5-5V8.4a5 5 0 0 1 5-5Zm-2 4.6a1.7 1.7 0 1 0 3.4 0 1.7 1.7 0 0 0-3.4 0Zm3.9 4a1.7 1.7 0 1 0 3.4 0 1.7 1.7 0 0 0-3.4 0Zm3.9 4a1.7 1.7 0 1 0 3.4 0 1.7 1.7 0 0 0-3.4 0Z"
      />
    </Ico>
  )
}

// 🧠 Complexité = trois barres montantes (même langage que la jauge des cartes).
export function BarsIcon({ size = 20 }) {
  return (
    <Ico size={size}>
      <rect x="3.4" y="13.8" width="4.6" height="6.8" rx="1.6" />
      <rect x="9.7" y="9.4" width="4.6" height="11.2" rx="1.6" />
      <rect x="16" y="4.6" width="4.6" height="16" rx="1.6" />
    </Ico>
  )
}

// 🏆 Victoire = couronne (trois pointes sur un socle).
export function CrownIcon({ size = 20 }) {
  return (
    <Ico size={size}>
      <path
        d="M4.4 17h15.2l1-8.2-4.5 3.1L12 5.6 7.9 11.9 3.4 8.8Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <rect x="4.6" y="18.4" width="14.8" height="2.2" rx="1.1" />
    </Ico>
  )
}

// 🏁 Fin de partie / déclencheur = drapeau (triangle sur mât).
export function FlagIcon({ size = 20 }) {
  return (
    <Ico size={size}>
      <rect x="4.6" y="3" width="2.4" height="18" rx="1.2" />
      <path d="M8.6 4.6 19.4 8.3 8.6 12 Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </Ico>
  )
}

// ➕ / ✓ : GLYPHES en trait (bouts ronds) — cf. règles en tête de fichier.
export function PlusIcon({ size = 20 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true" focusable="false" className="ico">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}
export function CheckIcon({ size = 20 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className="ico">
      <path d="M4.5 12.6 9.6 17.7 19.5 7.2" />
    </svg>
  )
}

// 🎯 Scénario / mission = cible (cercles concentriques).
export function TargetIcon({ size = 20 }) {
  return (
    <Ico size={size}>
      <circle cx="12" cy="12" r="8.4" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <circle cx="12" cy="12" r="3.4" />
    </Ico>
  )
}

// 🗓️ Période = calendrier minimal (deux anneaux + page).
export function CalendarIcon({ size = 20 }) {
  return (
    <Ico size={size}>
      <rect x="3.4" y="5.2" width="17.2" height="15.4" rx="3" />
      <rect x="7" y="2.6" width="2.4" height="4.4" rx="1.2" />
      <rect x="14.6" y="2.6" width="2.4" height="4.4" rx="1.2" />
      <rect x="6.4" y="10.6" width="11.2" height="2" rx="1" fill="var(--card, #fff)" opacity=".9" />
    </Ico>
  )
}

// ✏️ Modifier = crayon (silhouette minimale pleine — convention universelle).
export function PencilIcon({ size = 20 }) {
  return (
    <Ico size={size}>
      <path d="M4.2 19.8l.9-4.2L15.9 4.8a2.5 2.5 0 0 1 3.5 3.5L8.6 19.1l-4.4.7z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </Ico>
  )
}

// 🗑️ Supprimer = poubelle minimale (couvercle + corps).
export function TrashIcon({ size = 20 }) {
  return (
    <Ico size={size}>
      <rect x="4" y="4.6" width="16" height="2.3" rx="1.15" />
      <rect x="9.4" y="2.4" width="5.2" height="2.2" rx="1.1" />
      <path d="M6.2 8.6h11.6l-.8 10.4a2.4 2.4 0 0 1-2.4 2.2H9.4a2.4 2.4 0 0 1-2.4-2.2z" />
    </Ico>
  )
}

// ✕ Fermer / retirer = glyphe en trait.
export function XIcon({ size = 20 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true" focusable="false" className="ico">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

// Petites icônes SVG de l'app.
// Collection = bibliothèque verte, Wishlist = cœur rouge, Réglages = engrenage.

export function CollectionIcon({ size = 20, color = '#4e7a5c' }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <g fill={color}>
        <rect x="4.3" y="5.5" width="3" height="14" rx="1" />
        <rect x="8.3" y="7.5" width="3" height="12" rx="1" />
        <rect x="12.3" y="4.5" width="3" height="15" rx="1" />
        <rect x="16" y="8" width="2.9" height="11.5" rx="1" transform="rotate(11 17.45 13.75)" />
        <rect x="3" y="19.2" width="18" height="2.3" rx="1.15" />
      </g>
    </svg>
  )
}

export function WishlistIcon({ size = 20 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <path
        fill="#8e4f6b"
        d="M12 20.3l-1.45-1.32C5.4 14.24 2 11.15 2 7.5 2 4.9 4.1 3 6.7 3c1.5 0 2.9.7 3.8 1.8L12 6.1l1.5-1.3C14.4 3.7 15.8 3 17.3 3 19.9 3 22 4.9 22 7.5c0 3.65-3.4 6.74-8.55 11.48L12 20.3z"
      />
    </svg>
  )
}

export function StatsIcon({ size = 20 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <g fill="#6b5a8e">
        <rect x="3.5" y="13" width="4" height="7" rx="1.2" />
        <rect x="10" y="9" width="4" height="11" rx="1.2" />
        <rect x="16.5" y="5" width="4" height="15" rx="1.2" />
      </g>
    </svg>
  )
}

// Entonnoir (bouton flottant « Filtrer »).
export function FilterIcon({ size = 22, color = '#fff' }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <path fill={color} d="M3.5 5.2c0-.66.54-1.2 1.2-1.2h14.6c.66 0 1.2.54 1.2 1.2 0 .3-.11.58-.3.8L14.8 12.5v5.1c0 .43-.23.82-.6 1.03l-2.9 1.62c-.53.3-1.2-.08-1.2-.7v-7.05L3.8 6c-.19-.22-.3-.5-.3-.8z" />
    </svg>
  )
}

// Chwazi : trois doigts colorés posés sur l'écran.
export function ChwaziIcon({ size = 20 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      {/* Positions choisies pour que le CENTRE D'ENCRE des trois pastilles tombe pile au
          centre du cadre (x 4,05→19,95 et y 4,3→19,7 : centre 12/12), sinon le glyphe
          paraît décalé dans son bouton rond. Les couleurs ne sont que le repli : sur le
          bouton flottant, elles viennent des tokens --chwazi-* (voir index.css). */}
      <circle className="chw-1" cx="7.25" cy="9" r="3.2" fill="#b4553f" />
      <circle className="chw-2" cx="16.75" cy="7.5" r="3.2" fill="#3e6c8e" />
      <circle className="chw-3" cx="12.25" cy="16.5" r="3.2" fill="#4e7a5c" />
    </svg>
  )
}

// Flèche « retour » (chevron gauche net, centré) — utilisée par tous les boutons .back-btn.
export function BackIcon({ size = 22 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 5l-7 7 7 7"
      />
    </svg>
  )
}

export function SettingsIcon({ size = 20 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M19.43 12.98c.04-.32.07-.65.07-.98s-.03-.66-.07-.98l2.11-1.65a.5.5 0 00.12-.64l-2-3.46a.5.5 0 00-.61-.22l-2.49 1a7.3 7.3 0 00-1.69-.98l-.38-2.65A.49.49 0 0014 2h-4a.49.49 0 00-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1a.5.5 0 00-.61.22l-2 3.46a.5.5 0 00.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65a.5.5 0 00-.12.64l2 3.46c.14.24.42.32.61.22l2.49-1c.52.39 1.08.73 1.69.98l.38 2.65c.04.24.25.42.49.42h4c.24 0 .45-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.24.09.5 0 .61-.22l2-3.46a.5.5 0 00-.12-.64l-2.11-1.65zM12 15.5A3.5 3.5 0 1112 8.5a3.5 3.5 0 010 7z"
      />
    </svg>
  )
}

// ✦ Étincelle = anecdote / « le saviez-vous » (4 pointes concaves, pleine).
export function SparkIcon({ size = 20 }) {
  return (
    <Ico size={size}>
      <path
        d="M12 4c1 5.2 2.8 7 8 8-5.2 1-7 2.8-8 8-1-5.2-2.8-7-8-8 5.2-1 7-2.8 8-8Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </Ico>
  )
}

// ▦ Vue grille = quatre tuiles (bascule d'affichage de la collection).
export function GridIcon({ size = 20 }) {
  return (
    <Ico size={size}>
      <rect x="3.5" y="3.5" width="7.4" height="7.4" rx="1.8" />
      <rect x="13.1" y="3.5" width="7.4" height="7.4" rx="1.8" />
      <rect x="3.5" y="13.1" width="7.4" height="7.4" rx="1.8" />
      <rect x="13.1" y="13.1" width="7.4" height="7.4" rx="1.8" />
    </Ico>
  )
}

// ☰ Vue liste = trois rangées (jaquette + texte).
export function ListIcon({ size = 20 }) {
  return (
    <Ico size={size}>
      <rect x="3.5" y="4.6" width="5" height="5" rx="1.4" />
      <rect x="10.5" y="5.6" width="10" height="2.8" rx="1.4" opacity=".55" />
      <rect x="3.5" y="14.4" width="5" height="5" rx="1.4" />
      <rect x="10.5" y="15.4" width="10" height="2.8" rx="1.4" opacity=".55" />
    </Ico>
  )
}

