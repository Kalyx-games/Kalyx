// Le fond révélé DERRIÈRE un jeu qu'on glisse — la même chose en vue liste et en vue grille.
//
// Il montre l'action du côté vers lequel on tire, alignée du côté qui se dégage : on tire à
// droite, l'action apparaît à gauche. Au repos il n'existe pas ; armé, il prend la couleur
// de son action et le libellé se révèle — on voit exactement ce qui va se produire avant
// de lâcher.
export default function FondGlisse({ sens, arme, gauche, droite, className = '' }) {
  const act = sens < 0 ? gauche : sens > 0 ? droite : null
  if (!act) return null
  return (
    <span
      className={`glisse-fond ${sens > 0 ? 'vers-droite' : 'vers-gauche'}${arme ? ' arme' : ''} ${className}`}
      style={arme ? { background: act.bg } : undefined}
      aria-hidden="true"
    >
      <span className="glisse-fond-act">
        {act.node}
        <span>{act.label}</span>
      </span>
    </span>
  )
}
