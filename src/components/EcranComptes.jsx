import Avatar from './Avatar'
import { PlusIcon } from './icons'

// L'ÉCRAN DE DÉMARRAGE : « qui regarde ? », à la manière d'une plateforme de streaming.
// Il ne paraît qu'au PREMIER lancement (le choix est ensuite mémorisé) et se rouvre
// depuis les Réglages. Choisir un compte pose le filtre par propriétaire — le mécanisme
// qui existe déjà et qui est persistant.
//
// ⚠️ Ce n'est PAS une couche de navigation : il ne s'empile pas, ne pousse aucune entrée
// d'historique, et le bouton retour ne le ferme pas. C'est la porte d'entrée, pas un écran
// dont on revient.
export default function EcranComptes({ comptes = [], jeux = [], compteActif = null, online = true, onChoisir, onAjouter, onFermer }) {
  return (
    <div className="ecran-comptes">
      {/* Aucun titre, aucune phrase : trois visages et leurs noms se comprennent seuls
          (demande user). L'écran ne dit rien parce qu'il n'y a rien à expliquer. */}
      <div className="ec-corps">
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

        {/* Pas d'échappatoire « tout voir » (demande user) : qui ouvre l'app a un compte,
            et depuis n'importe lequel les filtres donnent accès aux jeux des autres. */}

        {/* Créer un compte se fait ICI, là où on les voit tous — plus dans les Réglages. */}
        {online && onAjouter && (
          <button type="button" className="ec-ajouter" onClick={onAjouter}>
            <PlusIcon size={14} /> Ajouter un compte
          </button>
        )}

        {/* Présent seulement quand l'écran a été rouvert volontairement (depuis le menu
            Compte) : au tout premier lancement, il n'y a rien derrière où revenir. */}
        {onFermer && (
          <button type="button" className="ec-annuler" onClick={onFermer}>
            Annuler
          </button>
        )}
      </div>
    </div>
  )
}
