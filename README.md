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
- [x] **Sauvegarde / restauration** : export de toute la collection dans un fichier + réimport (dans Réglages) ✅
- [x] **Scan de code-barres** : scanne la boîte d'un jeu (ou saisis le code) → le jeu est pré-rempli automatiquement (nom, image, prix) ✅
- [x] **Mode sombre** : thème clair / sombre / automatique (suit le téléphone), réglable dans Réglages ✅
- [x] **Finitions visuelles** : animations (cartes en cascade, fenêtres qui glissent, thème en fondu), cartes « fantômes » au chargement, onglet actif surligné qui glisse, images en fondu ✅
- [ ] **Import BoardGameGeek** (recherche → fiche pré-remplie) — app BGG enregistrée ✅, reste à récupérer le jeton

---

## 🧰 Les outils, expliqués en une phrase

| Outil | À quoi ça sert |
|---|---|
| **Node.js** | Le moteur qui permet de faire tourner les outils de développement sur ton PC. Installé ✅ (version 24.18, dans `C:\Users\AUTOMACHINE - OMEN\AppData\Local\Programs\nodejs`) |
| **npm** | Le "magasin" qui télécharge les bibliothèques de code (livré avec Node.js) |
| **Vite** | L'outil qui assemble tous les fichiers du projet en un site web optimisé |
| **React** | La bibliothèque avec laquelle on écrit l'interface (boutons, listes, écrans) |
| **PWA** | *Progressive Web App* : un site web qui s'installe comme une vraie app, avec icône et mode hors ligne |
| **Supabase** | La base de données dans le cloud où seront stockés les jeux (à venir) |
| **BGG** | BoardGameGeek, l'encyclopédie mondiale des jeux de société, d'où on importera les fiches (à venir) |

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
4. Clique **« Run »** (en bas à droite, ou `Ctrl + Entrée`). Un message vert « Success » confirme. La table `games` est créée, avec 3 jeux de démo.

### C. Récupérer l'adresse et la clé

1. En bas du menu de gauche, clique **« Project Settings »** (roue crantée ⚙️).
2. Clique **« API Keys »** (ou **« API »** selon la version).
3. Il te faut **deux valeurs** :
   - **Project URL** : de la forme `https://xxxxxxxx.supabase.co`
   - **La clé publique** : appelée **« anon public »** ou **« Publishable key »** selon la version (celle marquée « public », **pas** celle marquée « secret »/« service_role »).
4. **Colle-moi ces deux valeurs dans le chat** : je les installe (en local + sur Vercel) et je republie l'app. Ton écran passera au **vert « Connecté à la base »**. ✅

> 💡 Ces deux valeurs ne sont pas secrètes : la clé publique est conçue pour vivre dans le navigateur. Elles finissent dans `.env` (local) et dans les variables d'environnement Vercel (en ligne) — Claude s'en occupe.

### D. ⚡ Petite mise à jour (« joueurs idéal » en plage)

Pour que le champ *joueurs idéal* accepte une **plage** (« 2-4 ») ou des **valeurs séparées** (« 2, 4 »), il faut passer cette colonne en texte. **À faire une fois** : SQL Editor → New query → colle le contenu de **`supabase/migration_ideal_texte.sql`** → Run. Tant que ce n'est pas fait, saisir une plage dans « idéal » renverra une erreur.

## 🎲 Import BoardGameGeek (Palier 4)

⚠️ Depuis juillet 2025, BGG exige que chaque application soit **enregistrée** et utilise un **jeton d'autorisation** (sans quoi l'API répond « Unauthorized »). En plus, l'API BGG bloque les appels directs depuis un navigateur (CORS). Solution retenue : une petite **fonction relais** hébergée sur Supabase appellera BGG à notre place, en gardant le jeton secret.

**Ce que tu dois faire (une seule fois) :**
1. Crée un compte gratuit sur https://boardgamegeek.com (bouton « Sign Up »).
2. Une fois connecté, va sur **https://boardgamegeek.com/applications/create**.
3. Remplis le formulaire d'enregistrement de l'application :
   - **Nom** : `Kalyx`
   - **Description** : par ex. « Petit catalogue personnel de jeux de société pour un usage privé entre amis. »
   - **Lien / URL** (si demandé) : `https://kalyx-sepia.vercel.app`
4. Valide. BGG te fournit un **jeton (token)** — parfois immédiatement, parfois après une courte validation manuelle de leur part.
5. **Colle-moi ce jeton dans le chat** dès que tu l'as. Je le range dans un **coffre-fort côté serveur** (secret Supabase), il ne sera jamais visible dans l'app ni dans le code.

> Tant que le jeton n'est pas là, tu peux déjà utiliser Kalyx en **saisie manuelle** (bouton +). L'import BGG viendra s'ajouter par-dessus, sans rien casser.

---

## 🔩 Fiche technique

- **Stack** : React 19 + Vite 8 + vite-plugin-pwa 1.3 (PWA), Supabase (base de données, à venir), IndexedDB (cache hors ligne, à venir)
- Versions vérifiées sur le registre npm le **08/07/2026** : vite 8.1.3 · @vitejs/plugin-react 6.0.3 · vite-plugin-pwa 1.3.0 · react 19.2.7 · @supabase/supabase-js 2.110.1 · idb 8.0.3 · recharts 3.9.2
- **Structure du projet :**

```
Kalyx/
├── index.html               ← la page de base
├── package.json             ← la liste des bibliothèques utilisées
├── vite.config.js           ← configuration de Vite + PWA (manifest, icônes…)
├── .env                     ← tes identifiants Supabase (privé, non partagé)
├── supabase/schema.sql      ← script de création de la table (à coller dans Supabase)
├── public/                  ← icônes de l'app (générées)
├── src/
│   ├── main.jsx             ← point d'entrée React
│   ├── App.jsx              ← écran principal (vue Collection : liste, recherche, tri…)
│   ├── index.css            ← les styles (couleurs, mise en page)
│   ├── lib/
│   │   ├── supabase.js      ← connexion à la base
│   │   └── games.js         ← lire/ajouter/modifier/supprimer un jeu
│   └── components/
│       ├── GameCard.jsx     ← une carte de jeu
│       └── GameForm.jsx     ← le formulaire d'ajout/modification
└── dist/                    ← version construite, prête à déployer (créée par npm run build)
```
