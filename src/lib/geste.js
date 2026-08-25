// La loi de résistance des gestes, partagée par toute l'app.
//
// Au-delà d'une butée, un élément ne doit PAS s'arrêter net : il continue de suivre le doigt,
// de moins en moins. La courbe est asymptotique — on peut tirer aussi fort qu'on veut, on
// n'ira jamais plus loin que `force * souplesse` — ce qui dit « il n'y a rien par là »
// sans jamais donner l'impression que l'écran a cessé d'écouter.
//
// `force` = la part du mouvement rendue au tout début (0,42 = le premier millimètre au-delà
// de la butée reste franchement perceptible). `souplesse` = la vitesse à laquelle ça se ferme.
export function mou(d, force = 0.42, souplesse = 90) {
  return (d * force) / (1 + Math.abs(d) / souplesse)
}
