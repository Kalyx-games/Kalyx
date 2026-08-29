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
// Pas de libellé sur une action DISPONIBLE : le dé, le logo BoardGameGeek et l'icône de
// collection se lisent seuls, et un texte ne tiendrait pas sur une tuile de grille.
// ⚠️ EXCEPTION, et c'est tout l'intérêt : quand l'action n'est PAS disponible (jeu sans fiche
// BoardGameGeek, ou appareil hors ligne), on affiche quand même un fond — gris, barré, avec
// sa raison écrite. Ne rien montrer laissait croire à une panne.
export default function FondGlisse({ sens, arme, gauche, droite, className = '' }) {
  const act = sens < 0 ? gauche : sens > 0 ? droite : null
  if (!act) return null
  const off = Boolean(act.indispo)
  return (
    <span
      className={`glisse-fond ${sens > 0 ? 'vers-droite' : 'vers-gauche'}${arme ? ' arme' : ''}${off ? ' indispo' : ''} ${className}`}
      style={off ? undefined : { background: act.bg }}
      aria-hidden="true"
    >
      <span className="glisse-fond-act">
        {act.node}
        {off && act.label && <span className="glisse-fond-raison">{act.label}</span>}
      </span>
    </span>
  )
}
