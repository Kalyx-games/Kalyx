# Kalyx 🎲

Application web installable sur téléphone (PWA) pour répertorier une collection de jeux de société partagée entre plusieurs propriétaires. Données stockées dans le cloud (Supabase), fiches pré-remplies depuis BoardGameGeek (BGG), consultation possible hors ligne.

> Ce README est écrit pour un débutant complet : chaque étape est détaillée, aucune connaissance n'est supposée.

---

## 🌍 Adresse de l'app

**https://kalyx-sepia.vercel.app** — c'est l'adresse à ouvrir sur ton téléphone. Elle ne change pas : chaque nouvelle version se publie à cette même adresse.

## 📍 Où on en est

- [x] **Palier 1 — Hello World** : projet créé, app construite, **déployée en ligne et installée** ✅
- [x] **Palier 2 — base de données Supabase** : table `games` créée, app connectée (local + en ligne) ✅
- [x] **Vue Collection** : cartes, recherche, tri (+ sens), ajout/édition/suppression ✅
- [x] **Filtres** : panneau repliable — propriétaire, nombre de joueurs (+ option « nombre idéal »), durée, complexité, + réinitialiser ✅
- [x] **Hors ligne** : copie locale — consultation/recherche/tri/filtres marchent sans réseau (écriture désactivée) ✅
- [x] **Nouveau logo** dans l'app ✅
- [x] **Barre de navigation** : ❤️ Wishlist · 📚 Collection · ✋ Chwazi, avec **Stats** et **Réglages** en haut à droite + **vue Wishlist** (bouton « déplacer vers la collection ») ✅
- [x] **Réglages** : gestion des propriétaires (nom + initiales + couleur, modifiables, avec confirmation avant suppression) + liens utiles (Melodice, Supabase, Vercel, BGG) ✅
- [x] **Statistiques** : cases propriétaires (filtre) + chiffres clés (total, wishlist, durée & complexité moyennes **et** médianes) + répartitions par joueurs / joueurs idéal / durée / complexité ✅
- [x] **Chwazi** : posez vos doigts, l'app choisit — mode « qui commence » ou « 2 équipes », plein écran, marche hors ligne ✅
- [x] **Remplissage auto depuis Philibert** : bouton qui remplit l'image (et le prix en wishlist) d'un jeu à partir de son nom, avec vignette de vérification ✅
- [x] **Sauvegarde / restauration** : export de **toutes** les données dans un fichier (jeux, propriétaires, tags, **parties**, **fiches de score**) + réimport, et sauvegardes automatiques dans le cloud (dans Réglages) ✅
- [x] **Fiches de score et parties** : fiche par jeu (catégories, coop, équipes, victoire directe), saisie des parties, historique, statistiques par joueur et comparatif ✅
- [x] **Écran Joueurs** : renommer un joueur partout d'un coup (Réglages) ✅
- [x] **Scan de code-barres** : scanne la boîte d'un jeu (ou saisis le code) → le jeu est pré-rempli automatiquement (nom, image, prix) ✅
- [x] **Mode sombre** : thème clair / sombre / automatique (suit le téléphone), réglable dans Réglages ✅
- [x] **Finitions visuelles** : animations (cartes en cascade, fenêtres qui glissent, thème en fondu), cartes « fantômes » au chargement, onglet actif surligné qui glisse, images en fondu ✅
- [x] **Import BoardGameGeek** : recherche par nom → fiche pré-remplie (joueurs, durée, complexité, image) ✅

---

## 🧰 Les outils, expliqués en une phrase

| Outil | À quoi ça sert |
|---|---|
| **Node.js** | Le moteur qui permet de faire tourner les outils de développement sur ton PC. Installé ✅ (version 24.18, dans `C:\Users\AUTOMACHINE - OMEN\AppData\Local\Programs\nodejs`) |
| **npm** | Le "magasin" qui télécharge les bibliothèques de code (livré avec Node.js) |
| **Vite** | L'outil qui assemble tous les fichiers du projet en un site web optimisé |
| **React** | La bibliothèque avec laquelle on écrit l'interface (boutons, listes, écrans) |
| **PWA** | *Progressive Web App* : un site web qui s'installe comme une vraie app, avec icône et mode hors ligne |
| **Supabase** | La base de données dans le cloud où sont stockés les jeux, les parties et les sauvegardes |
| **BGG** | BoardGameGeek, l'encyclopédie mondiale des jeux de société, d'où viennent les fiches pré-remplies |

---

## 💻 Ouvrir un terminal (si tu veux taper les commandes toi-même)

Le plus simple reste de **demander à Claude** de lancer les commandes pour toi. Mais si tu veux le faire à la main :

1. Clic droit sur le bouton Démarrer de Windows (ou touches `Win + X`)
2. Clique sur **« Terminal »**
3. Tape cette commande pour te placer dans le dossier du projet, puis appuie sur Entrée :

```
cd "C:\Users\AUTOMACHINE - OMEN\Desktop\Kalyx"
```

> ⚠️ Si le terminal était déjà ouvert avant l'installation de Node.js, ferme-le et rouvre-le, sinon il ne connaîtra pas les commandes `npm`.

---

## ▶️ Lancer l'app sur l'ordinateur (mode développement)

Dans le terminal, dans le dossier du projet :

```
npm run dev
```

Puis ouvre ton navigateur à l'adresse affichée : **http://localhost:5173**

L'app se recharge toute seule à chaque modification du code. Pour arrêter : `Ctrl + C` dans le terminal.

## 📦 Construire la version finale

```
npm run build
```

Cela crée un dossier `dist/` : c'est le site final, optimisé, prêt à être mis en ligne. Pour le tester en local :

```
npm run preview
```

Puis ouvre **http://localhost:4173**

---

## 🌐 Déployer sur internet (Vercel)

C'est ce qui donne à Kalyx une adresse web en `https://…` accessible depuis ton téléphone. Hébergeur choisi : **Vercel** (gratuit).

**1. Créer ton compte (à faire une seule fois, ~2 minutes) :**
1. Va sur https://vercel.com/signup
2. Choisis le plan **Hobby** (gratuit) — « I'm working on personal projects »
3. Clique **« Continue with Email »**, entre ton adresse email
4. Ouvre l'email reçu et confirme

**2. Déployer :** fait ✅. Le compte est connecté, le projet `kalyx` est créé sur Vercel, et l'app est en ligne à **https://kalyx-sepia.vercel.app**.

**3. Les fois suivantes :** chaque nouvelle version se publie avec la commande `vercel deploy --prod` (Claude la lance) — même adresse, et l'app installée sur le téléphone se met à jour toute seule à l'ouverture suivante.

---

## 📱 Installer sur ton téléphone

Une fois l'app déployée (adresse `https://…`), ouvre cette adresse sur ton téléphone :

**Sur Android (Chrome) :**
1. Ouvre l'adresse de l'app dans Chrome
2. Touche le menu `⋮` en haut à droite
3. Touche **« Ajouter à l'écran d'accueil »** (ou « Installer l'application »)
4. Confirme → l'icône **K** violette apparaît sur ton écran d'accueil

**Sur iPhone (Safari obligatoirement) :**
1. Ouvre l'adresse de l'app dans Safari
2. Touche le bouton **Partager** (le carré avec une flèche vers le haut)
3. Fais défiler et touche **« Sur l'écran d'accueil »**
4. Confirme → l'icône **K** violette apparaît sur ton écran d'accueil

L'app s'ouvre alors en plein écran, comme une vraie application, sans barre de navigateur.

**🧪 Test bonus :** une fois l'app installée et ouverte au moins une fois, passe en mode avion et rouvre-la → elle s'affiche quand même. C'est le « service worker » qui garde une copie locale.

---

## 🗄️ Base de données Supabase (Palier 2)

Supabase héberge dans le cloud la liste de tes jeux, partagée entre toi et ton ami. C'est gratuit et il n'y a pas de carte bancaire à donner.

### A. Créer le compte et le projet (une seule fois)

1. Va sur **https://supabase.com** et clique **« Start your project »** (ou « Sign up »).
2. Inscris-toi (le plus simple : « Continue with Email », ou avec un compte Google/GitHub si tu en as un).
3. Une fois connecté, clique **« New project »**.
4. Remplis :
   - **Name** : `kalyx`
   - **Database Password** : clique sur **« Generate a password »** puis **copie-le et colle-le quelque part** (un fichier, un gestionnaire de mots de passe). On n'en a pas besoin pour l'app, mais c'est le mot de passe maître de ta base — à garder.
   - **Region** : choisis **« Central EU (Frankfurt) »** (le plus proche = le plus rapide pour toi).
5. Clique **« Create new project »**. La base se prépare pendant ~2 minutes (petit sablier). Patiente.

### B. Créer la table (copier-coller un script)

1. Dans le menu de gauche, clique **« SQL Editor »** (icône `</>`).
2. Clique **« New query »**.
3. Ouvre le fichier **`supabase/schema.sql`** de ce projet, copie **tout** son contenu, et colle-le dans l'éditeur.
4. Clique **« Run »** (en bas à droite, ou `Ctrl + Entrée`). Un message vert « Success » confirme. Les 6 tables sont créées (jeux, propriétaires, tags, sauvegardes, fiches de score, parties), **vides** : c'est normal.

> 📌 **Un seul fichier à lancer : `schema.sql`.** Les fichiers `migration_*.sql` à côté ne sont que l'historique des ajouts successifs — ils font double emploi, ne les lance pas en plus.

### C. Récupérer l'adresse et la clé

1. En bas du menu de gauche, clique **« Project Settings »** (roue crantée ⚙️).
2. Clique **« API Keys »** (ou **« API »** selon la version).
3. Il te faut **deux valeurs** :
   - **Project URL** : de la forme `https://xxxxxxxx.supabase.co`
   - **La clé publique** : appelée **« anon public »** ou **« Publishable key »** selon la version (celle marquée « public », **pas** celle marquée « secret »/« service_role »).
4. **Colle-moi ces deux valeurs dans le chat** : je les installe (en local + sur Vercel) et je republie l'app. Ton écran passera au **vert « Connecté à la base »**. ✅

> 💡 Ces deux valeurs ne sont pas secrètes : la clé publique est conçue pour vivre dans le navigateur. Elles finissent dans `.env` (local) et dans les variables d'environnement Vercel (en ligne) — Claude s'en occupe.

## 🎲 Import BoardGameGeek — **fait** ✅

Depuis juillet 2025, BGG exige que chaque application soit **enregistrée** et utilise un **jeton d'autorisation**. En plus, BGG bloque les appels directs depuis un navigateur. Solution retenue : une petite **fonction relais côté serveur**, `api/bgg.js`, hébergée **avec le site** (pas sur Supabase), qui appelle BGG et garde le jeton secret.

C'est en place : l'app Kalyx est enregistrée chez BGG et le jeton est rangé dans une variable d'environnement **`BGG_TOKEN`** chez l'hébergeur (Vercel → Settings → Environment Variables). Il n'apparaît jamais dans le code ni dans le navigateur.

> Si un jour tu recrées le projet ailleurs : recrée un jeton sur https://boardgamegeek.com/applications/create et redéfinis `BGG_TOKEN` chez le nouvel hébergeur. Sans lui, tout le reste de l'app marche, seul le bouton « Chercher sur BoardGameGeek » répond « BGG_TOKEN absent côté serveur ».

---

## 🖥️ Ce que l'hébergeur doit savoir faire

Kalyx n'est **pas** un site 100 % statique. En plus des fichiers du dossier `dist/`, l'hébergeur doit pouvoir **exécuter les fonctions du dossier `api/`** (petits fichiers Node) :

| Fichier | À quoi il sert | Si absent |
|---|---|---|
| `api/bgg.js` | Relais vers BoardGameGeek (recherche + fiche) | L'import BGG ne marche plus |
| `api/price.js` | Prix et image depuis Philibert | Les boutons Philibert ne marchent plus |

Sur un hébergeur purement statique (GitHub Pages par exemple), l'app s'affiche et la collection fonctionne, mais ces boutons échouent.

**Autre point à connaître :** les vignettes des cartes passent par l'optimiseur d'images de Vercel (`/_vercel/image`, configuré dans `vercel.json`). Ailleurs, un repli automatique affiche l'image d'origine : rien ne casse, mais les images sont beaucoup plus lourdes (~1,3 Mo au lieu de ~13 Ko). Le cas échéant, il faudra adapter `thumbSrc()` dans `src/components/GameCard.jsx`.

---

## 💾 Ce que contient une sauvegarde

Le bouton **Exporter** (Réglages → Sauvegarde) produit un fichier `kalyx-sauvegarde-AAAA-MM-JJ.json`, lisible dans n'importe quel éditeur de texte. Il contient **tout** :

| Contenu | Détail |
|---|---|
| `games` | tous les jeux, toutes leurs colonnes |
| `owners` / `tags` | les propriétaires et les tags (nom, initiales, couleur) |
| `plays` | **toutes les parties enregistrées** (joueurs, scores, dates, gagnants, notes) |
| `scoresheets` | **toutes les fiches de score** |

Les sauvegardes automatiques (stockées dans Supabase) contiennent exactement la même chose.

> ⚠️ **Supprimer un jeu supprime aussi ses parties et sa fiche de score** (la base les efface en cascade). L'app le rappelle dans la fenêtre de confirmation. Pense à exporter avant une grosse opération.

---

## 🔩 Fiche technique

- **Stack** : React 19 + Vite 8 + vite-plugin-pwa 1.3 (PWA), Supabase (base de données), IndexedDB via `idb` (cache hors ligne), `@zxing/browser` (scan de code-barres). Les graphiques sont faits « maison » en CSS — aucune bibliothèque de graphiques.
- **Variables d'environnement** : voir `.env.example` (2 obligatoires côté navigateur, 1 facultative côté serveur).
- **Structure du projet :**

```
Kalyx/
├── index.html               ← la page de base
├── package.json             ← la liste des bibliothèques utilisées
├── package-lock.json        ← versions exactes (à conserver : garantit un build identique)
├── vite.config.js           ← configuration de Vite + PWA (manifest, icônes…)
├── vercel.json              ← optimiseur d'images (spécifique à Vercel)
├── .env.example             ← modèle des variables ; à copier en .env (le .env est privé)
├── api/                     ← fonctions serveur (relais BGG, prix Philibert)
├── supabase/schema.sql      ← création de TOUTE la base (à coller dans Supabase)
├── public/                  ← icônes de l'app (générées)
├── src/
│   ├── main.jsx             ← point d'entrée React
│   ├── App.jsx              ← écran principal (navigation, listes, sauvegardes)
│   ├── index.css            ← les styles (couleurs, mise en page)
│   ├── lib/                 ← accès aux données (supabase, games, plays, backup…)
│   └── components/          ← les écrans et briques d'interface
└── dist/                    ← version construite, prête à déployer (créée par npm run build)
```
