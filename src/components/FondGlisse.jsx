// Le fond révélé DERRIÈRE un jeu qu'on glisse — le même en vue liste et en vue grille.
//
// Il montre l'action du côté vers lequel on tire, alignée du côté qui SE DÉGAGE : on tire à
// droite, l'icône apparaît à gauche, donc visible dès le premier millimètre.
//
// ⚠️ La couleur de l'action est là DÈS LE DÉBUT du geste, pas au franchissement du seuil :
// on sait tout de suite ce qu'on est en train de faire. C'est l'ICÔNE qui dit l'armement
// (pleine opacité, léger grossissement) — l'état reste ainsi visible et réversible avant de
// lâcher, sans que la couleur clignote en cours de route.
//
// Pas de libellé : le dé, le logo BoardGameGeek et l'icône de collection se lisent seuls, et
// un texte ne tiendrait de toute façon pas sur une tuile de grille.
export default function FondGlisse({ sens, arme, gauche, droite, className = '' }) {
  const act = sens < 0 ? gauche : sens > 0 ? droite : null
  if (!act) return null
  return (
    <span
      className={`glisse-fond ${sens > 0 ? 'vers-droite' : 'vers-gauche'}${arme ? ' arme' : ''} ${className}`}
      style={{ background: act.bg }}
      aria-hidden="true"
    >
      <span className="glisse-fond-act">{act.node}</span>
    </span>
  )
}
