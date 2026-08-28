import Avatar from './Avatar'

// L'ÉCRAN DE DÉMARRAGE : « qui regarde ? », à la manière d'une plateforme de streaming.
// Il ne paraît qu'au PREMIER lancement (le choix est ensuite mémorisé) et se rouvre
// depuis les Réglages. Choisir un compte pose le filtre par propriétaire — le mécanisme
// qui existe déjà et qui est persistant.
//
// ⚠️ Ce n'est PAS une couche de navigation : il ne s'empile pas, ne pousse aucune entrée
// d'historique, et le bouton retour ne le ferme pas. C'est la porte d'entrée, pas un écran
// dont on revient.
export default function EcranComptes({ comptes = [], jeux = [], compteActif = null, onChoisir, onFermer }) {
  return (
    <div className="ecran-comptes">
      <div className="ec-corps">
        <h1 className="ec-titre">Qui regarde&nbsp;?</h1>
        <p className="ec-sous">Votre choix ouvre la collection sur vos jeux. Vous verrez toujours ceux des autres.</p>

        <div className="ec-grille">
          {comptes.map((c) => (
            <button
              key={c.id || c.name}
              type="button"
              className={`ec-compte${compteActif === c.name ? ' actif' : ''}`}
              onClick={() => onChoisir(c.name)}
            >
              <Avatar compte={c} jeux={jeux} taille={96} className="ec-avatar" />
              <span className="ec-nom">{c.name}</span>
            </button>
          ))}
        </div>

        {/* Ne rien choisir est un choix légitime — et il se mémorise, sinon l'écran
            reviendrait à chaque lancement chez qui ne veut pas de filtre. */}
        <button type="button" className="ec-tout" onClick={() => onChoisir(null)}>
          Voir toute la collection
        </button>

        {/* Présent seulement quand l'écran a été rouvert volontairement (depuis les
            Réglages) : au tout premier lancement, il n'y a rien derrière où revenir. */}
        {onFermer && (
          <button type="button" className="ec-annuler" onClick={onFermer}>
            Annuler
          </button>
        )}
      </div>
    </div>
  )
}
