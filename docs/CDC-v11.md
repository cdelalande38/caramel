# CDC — « La course de Caramel » · Reprise v11

> Document de passation pour nouvelle session (Claude / Claude Code).
> Rédigé le 22/07/2026. Source de vérité du code : le repo Git (section 2).

## 1. Contexte & objectif

App web de **fluence de lecture** (lecture à voix haute) pour enfants du primaire, créée pour la fille de Cédric (9 ans, CE2, point faible : vitesse de lecture / MCLM — repère fin CE2 ≈ 90 mots correctement lus par minute). Principe : l'enfant lit une histoire à voix haute, la reconnaissance vocale suit la lecture **mot à mot** (karaoké), chaque mot validé fait avancer son compagnon 🐴 qui fait la course contre « Zip » le papillon 🦋 (vitesse cible par histoire). Pauses de ponctuation = obstacles à sauter. Étoiles, histoires à débloquer, progression sauvegardée en local. **Aucun backend** : site statique, la voix ne quitte jamais l'appareil.

Utilisateur principal : la fille de Cédric, sur **Chrome Android** (téléphone + app installée sur l'écran d'accueil). Testé aussi sur PC Chrome. iOS non supporté pour la reco (assumé).

Le projet a fait l'objet d'un post LinkedIn (à publier / publié) — voir §2 pour le lien de feedback à mettre à jour.

## 2. Liens, accès & déploiement

- **App (prod)** : https://cdelalande38.github.io/caramel/
- **Repo** : https://github.com/cdelalande38/caramel — GitHub Pages servi depuis `main`, racine
- **Déployer = `git push origin main`** (build Pages auto, ~40-60 s ; poller `GET /repos/cdelalande38/caramel/pages/builds/latest` jusqu'à `built`)
- **Auth** : token GitHub *classic* avec scope `repo`, généré par Cédric sur github.com/settings/tokens et fourni en début de session dans le chat. **Ne jamais committer un token. Révoquer après chaque session d'itération.** ⚠️ Le token utilisé jusqu'ici a beaucoup circulé : à révoquer et régénérer.
- Depuis la sandbox Claude : `github.com` et `api.github.com` sont dans la liste réseau autorisée. Cloner avec `https://x-access-token:$TOKEN@github.com/cdelalande38/caramel.git`. **Gros fichiers (> ~40 Mo) : passer par `git push`, l'API contents/blobs les refuse (422).**
- **Footer app** : `LINKEDIN_PROFILE = https://www.linkedin.com/in/cedric-delalande-57bb7860/` ; la constante `FEEDBACK_URL` (début du `<script>`) doit être remplacée par **l'URL du post LinkedIn** dès que Cédric la fournit.

### Fichiers du repo
| Fichier | Rôle |
|---|---|
| `index.html` | Toute l'app (v11 en prod) — fichier unique HTML/CSS/JS |
| `models/fr.tar.gz` | Modèle Vosk français `vosk-model-small-fr-pguyot-0.3` (44 Mo) |
| `sw.js` | Service worker : rappels quotidiens (periodic sync `caramel-daily`) + coquille hors-ligne (exclut `/models/`) |
| `manifest.webmanifest`, `icon.svg`, `icon-192/512.png`, `favicon-32.png` | PWA / icônes (tête de Caramel) |
| `docs/CDC-v11.md` | Ce document |

## 3. Architecture actuelle (v10, en prod)

Fichier unique, zéro framework. Écrans : accueil (liste histoires par niveaux à déblocage), lecture (barre micro en haut, piste de course animée, texte karaoké pleine hauteur avec autoscroll), résultats (récap XL). PWA installable, fonctionne hors ligne après première visite.

**Fonctionnalités en prod** : 15 histoires CE2 templatées par thème (décors de piste dédiés : ciel/sol/décos/obstacle emoji par histoire), déblocage par paliers d'étoiles (`need` par histoire, 0→30), sauvegarde `localStorage` clé `caramel-progress-v1` (`{stars:{id:best}}`) + bouton reset avec confirm, détection des **pauses de ponctuation** (obstacles 🍂 sur la piste : pause marquée → grand saut + ✨, lue à travers → trébuche), stats fin de course (MCLM, précision, sauts x/y, badge « Lecture expressive » ≥80 %), mots à apprivoiser listés, notifications quotidiennes opt-in (messages type Duolingo dans `sw.js`), footer LinkedIn.

## 4. Moteur de reconnaissance — spécifications fines (NE PAS RÉGRESSER)

- **Vosk WASM** via CDN `https://cdn.jsdelivr.net/npm/vosk-browser@0.0.8/dist/vosk.js`, modèle auto-hébergé `models/fr.tar.gz`, mis en cache **Cache Storage** (`vosk-model-v1`) avec téléchargement à progression affichée (1re fois ~44 Mo). Fallback automatique : Web Speech API (`fr-FR`) — indispensable car l'API Chrome↔Google était muette sur le téléphone de Cédric alors que le code marche (bug système connu).
- Capture : `getUserMedia` (echoCancellation, noiseSuppression, mono) → `AudioContext({sampleRate:16000})` (fréquence native du modèle, fallback défaut) → `ScriptProcessor(4096)` → `recognizer.acceptWaveform` ; gain 0 vers destination (évite le larsen). `new model.KaldiRecognizer(sampleRate, grammar)`.
- **Grammaire contrainte** : vocabulaire = mots de l'histoire courante (lowercase, accents conservés, regex `[^\p{L}0-9]`) + `'[unk]'` → gain de précision majeur.
- **Alignement** : fenêtre d'avance de 4 mots ; `isMatch` = égalité, ou Levenshtein ≤1 dès 3 lettres, ≤2 dès 7 lettres ; mots ≤2 lettres = égalité stricte.
- **Indulgence mots-outils** (`FORGIVE` : le, la, les, un, une, des, de, du, au, aux, et, en, y, a, ce, se, sa, son, ses, ne, que, qui, il, ils, elle, ou) : un mot-outil sauté est marqué `read` (l'ASR les avale, pas l'enfant).
- **Wildcard `[unk]`** : un token `unk` ne peut valider qu'un **nom propre** attendu dans la fenêtre (`computeProper` : mot toujours capitalisé, en milieu de phrase ou ≥2 occurrences). C'est ce qui permet des prénoms hors vocabulaire (Léa, prénoms personnalisés). **Le nom de la monture courante est aussi ajouté à cet ensemble** (v11.2) : « licorne » et « capybara » sont absents du lexique du modèle (vérifié dans `HCLr.fst`/`Gr.fst` — comme « tortue » ou « tigre », le petit modèle est lacunaire) ; sans cela, la reco Vosk ne validerait jamais ces mots.
- **Pauses** : horodatage des mots validés ; baseline = médiane des écarts entre mots sans ponctuation (40 derniers) ; pause OK si écart ≥ `clamp(baseline+280ms, 550, 2000)`. Mots porteurs de ponctuation détectés à la tokenisation (ponctuation détachée « ! » « : » rattachée au mot précédent).
- **Diagnostic intégré** : ligne 👂 (5 derniers mots entendus), messages d'erreur explicites (`ERR_MSG`), watchdog « je ne t'entends pas » à 7 s, statut moteur sur l'accueil.

## 5. État d'avancement

- ✅ v1→v10 : livrées et en prod (historique git parlant, une version = un commit)
- 🚧 **v11 : périmètre validé par Cédric, implémentation commencée** — partie 1 committée dans `wip/index_v11_part1.html` (structure HTML/CSS complète du compagnon/boutique/réglages + données MOUNTS/FOODS/SHOP). **Manquent : le bloc STORIES 27 histoires templatées (annexe A + retrofit des 15 CE2 depuis `index.html` prod) et toute la partie 2 du script** (§6).
- ⚠️ Anomalie connue : la sandbox est partagée entre branches de conversation → des artefacts « fantômes » peuvent exister (un commit v6 non sollicité, un `index_v11.html` parallèle de 1425 lignes incomplet : **résolu, la v11 réelle est en prod**). Toujours `git pull --rebase` et vérifier `git log` avant de pousser.

## 6. Spécification v11 (périmètre validé — « une grosse version »)

### 6.1 Économie 🍎 & streak
- Deux monnaies : **⭐ étoiles** (progression/déblocage, jamais dépensables) et **🍎 pommes** (dépensables).
- Gains : fin de course = `étoiles × 10` 🍎 ; streak quotidien : +10 🍎 au premier jour joué (+50 tous les 7 jours). `bumpStreak()` : même jour → rien ; hier → count+1 ; sinon → count=1.
- Affichage : ligne `#wallet` accueil « ⭐ x/81 · 🍎 y · 🔥 z j » ; ligne `#res-apples` sur les résultats.

### 6.2 Sauvegarde v2 + migration
Clé `caramel-save-v2` :
```json
{ "stars":{}, "apples":0, "streak":{"count":0,"last":""},
  "hero":{"name":"Léa","g":"f"},
  "mount":{"type":"pony","name":"Caramel","owned":["pony"]},
  "equip":{"owned":[],"worn":[]},
  "pet":{"faim":80,"forme":80,"joie":80,"last":0,"brushLast":0,"walkDay":""} }
```
Migration depuis `caramel-progress-v1` : reprendre `stars` + **rétro-crédit `apples = totalStars × 10`** (la fille a déjà fini tout le CE2). Tout accès localStorage en try/catch. Reset = suppression v2 + v1.

### 6.3 Niveaux & histoires (27 au total)
Ordre du tableau `STORIES` : CE1 (idx 0-5, `need:0` partout), CE2 (idx 6-20, `need` existants 0,0,0,2,4,6,8,10,12,15,18,21,24,27,30), CM1 (idx 21-26, `need` 33,37,41,45,50,55). `LEVELS` : « CE1 · Premiers galops 🐣 » (0-5), « CE2 · Petit trot 🌱 » (6-10), « CE2 · Grand galop 🐎 » (11-15), « CE2 · Champion 🏆 » (16-20), « CM1 · Cavalier émérite 🎖️ » (21-26). `PACE_LABEL` élargi (lent ≤45, moyen ≤60, rapide ≤75, très rapide ≤88, éclair au-delà).
- **Textes CE1 (6, cibles 30→45) et CM1 (6, cibles 72→100) : annexe A, prêts à coller** (déjà templatés, validés sans apostrophes).
- **CE2 : retrofit des 15 textes de `index.html` prod** avec les tokens (§6.4) : Léa→`{P}`, Caramel→`{N}`, Le/le poney→`{LeM}/{leM}`, Son/son poney→`{SonM}/{sonM}`, du poney→`{duM}`, il/Il (compagnon)→`{ilM}/{IlM}`, Elle/elle (héros)→`{El}/{el}`, content→`{contentM}`, surpris→`{surprisM}`, léger→`{legerM}`, fière→`{fiere}`. Attention : dans « tresor », « Elle montre » = la carte (ne pas templater) ; « plage » : remplacer « pose un sabot »→« pose une patte » et « la crinière de Caramel »→« les décoiffe tous les deux » (compat dragon) ; « fee » : « la crinière de »→« la tête de ». Titres : `'{N} {leM}'`, `'{N} au cirque'`, `'Le trésor {duM} pirate'`, etc.
- **Obstacles sur textes longs** : si plus de 10 mots-pause → obstacles uniquement sur les fins de phrase (`/[.!?…»]$/` du raw) ; l'évaluation statistique des pauses reste sur TOUTES les ponctuations ; les anims saut/chute ne jouent que si un obstacle existe.

### 6.4 Templating héros / monture
`fillTemplate(str)` appliqué au texte ET au titre à `openStory`/`renderHome` (remplacement `\{(\w+)\}` via `tplMap()`). Dictionnaire :
`P` prénom héros · `El/el` Elle-Il/elle-il (genre héros) · `fiere` fière/fier · `N` nom compagnon · `leM/LeM` le poney-la licorne-le dragon · `sonM/SonM` son/sa · `duM` du/de la · `IlM/ilM` (genre monture : licorne=f) · `contentM, surprisM, legerM, rassureM, fascineM` accordés au genre monture. Sanitiser les prénoms saisis : strip `{}`, max 14 car. Un prénom hors vocabulaire Vosk sort en `[unk]` → couvert par le wildcard noms propres (aucun travail supplémentaire).
Titre de l'app dynamique : `MOUNTS[type].em + ' La course de ' + mount.name`.

### 6.5 Compagnon (tamagotchi) — **bienveillant, jamais punitif**
- Scène `#pet-stage` sur l'accueil (HTML/CSS déjà dans le WIP) : compagnon **SVG généré** `mountSVG(type, worn, size, moodClass)` — corps/pattes/queue/tête/crinière, variantes licorne (corne + crinière rose, robe claire) et dragon (vert, pics dorsaux, petite aile, pas de crinière). Classes CSS d'animation déjà écrites : `.m-body` (respiration), `.m-tail` (balancement), `.m-lid` (clignement), `.sad` (oreilles baissées), `.joy` (rebond), `.walk` (`.m-legF/.m-legB` pas). Le MÊME SVG sert en course dans `#pony` (46 px mobile / 72 px desktop) → **les équipements se voient en course**.
- Jauges 0-100, plancher 15 (jamais de mort) : faim −100/48 h, forme −100/72 h, joie −100/96 h, décroissance calculée à la volée depuis `pet.last`. Humeur : moyenne <40 → classe `sad` + message doux (« {N} a un petit creux 🍎 »).
- Actions : **Nourrir** (FOODS : carotte 5🍎/+15, pomme 10/+30+5 joie, tarte 25/+70+12) ; **Brosser** gratuit, cooldown 4 h, +15 joie + ✨ ; **Promener** gratuit 1×/jour (`walkDay`), +25 forme +8 joie, animation `#pet-holder.walking` 4 s + classe `walk` + clip-clop (beeps graves) ; **tap** sur la scène : +2 joie, cœur ❤ flottant à la position du clic, rebond `joy`, hennissement (2 beeps).
- **Boutique** : 8 équipements (données SHOP dans le WIP) par slots `head/neck/back/tail/face/wings` — achat si 🍎 suffisantes, un seul porté par slot, re-render compagnon. **Montures** : poney gratuit, licorne/dragon 150 🍎, sélection = re-render global (titres d'histoires compris).
- **Réglages** (panel dans le WIP) : prénom héros + toggle fille/garçon (`seg-f/seg-m`), nom du compagnon, bouton Enregistrer → persist + re-render.

### 6.6 Assemblage & garde-fous
Partie 2 du script à écrire = save/migration, économie/streak, template, module compagnon (SVG + logique + panneaux), **moteur vocal copié VERBATIM de `index.html` prod** (aucune régression), sons/confettis, renderHome (wallet + titres templatés), openStory (fillTemplate + thème + règle obstacles + SVG dans `#pony`), processTranscript (idem prod + anims pause conditionnées à l'existence de l'obstacle), finishExercise (+🍎, +streak, `#res-apples`), notifs (idem prod), boot (`loadSave→liens→SW→renderPet→renderHome→maybeShowNotifCard` + `setInterval(renderPet, 60000)`). Vérifier `node --check` sur le JS extrait avant push. Un commit = « v11 : ... ».

## 7. Backlog après v11 (cadré, non commencé)
1. **Lot 3 — Entraînement « mots à apprivoiser »** : persistance des mots ratés (compteur par mot), mini-jeu mot isolé en grand (grammaire Vosk réduite à ce seul mot), 2 réussites consécutives = apprivoisé + 🍎 bonus.
2. **Lot 4 — Espace parents** : porte anti-enfant (calcul mental), historique des courses (à logger dès v11 si simple : `history[]` plafonné 200), courbe MCLM en SVG maison, bilan hebdo partageable (Web Share / PNG).
3. **Lot 5 — Rétention** : 12 badges de collection, gel de série achetable en 🍎, ambiances sonores génératives WebAudio par thème (toggle mémorisé).
4. **Plus tard** : vraies push serveur planifiées + synchro multi-appareils (backend FastAPI/PostgreSQL — stack de Cédric), test modèle `vosk-model-small-fr-0.22` (meilleur WER ; source à fournir par Cédric, alphacephei inaccessible depuis la sandbox), multi-profils enfants.

## 8. Pièges connus & conventions
- **Textes : JAMAIS d'apostrophes ni de traits d'union** (tokenisation reco) — réécrire autour (pas de « l' », « d' », « qu' », « c'est », « au-dessus »...). Le mot « unk » est réservé.
- Ponctuation française détachée (« ! », « : ») gérée par la tokenisation (rattachée au mot précédent).
- Emoji de succès d'obstacle : `✨` (obstacle thème remplacé au saut réussi).
- localStorage/caches toujours en try/catch (previews artifact les bloquent).
- GitHub Pages cache ~10 min : demander un rechargement forcé après déploiement.
- Accord de genre : héros (fille/garçon) ET monture (licorne = féminin) sont deux axes distincts.
- Public : enfant de 8-10 ans → ton toujours encourageant, minimum 1 étoile, aucun mécanisme culpabilisant.

## 9. Checklist de démarrage de la nouvelle session
1. Demander à Cédric : **un token GitHub neuf** (et révocation de l'ancien) + **l'URL du post LinkedIn** si toujours manquante (→ `FEEDBACK_URL`).
2. Cloner le repo, `git log` (vérifier l'absence de commits inattendus), lire `index.html` (v11 = référence moteur + compagnon).
3. Recueillir le retour du test terrain v11 (téléphone de la fille de Cédric), corriger si besoin, puis attaquer le **Lot 3** (§7).
4. Mettre à jour ce CDC (`docs/CDC-v11.md`) : état, décisions, prochain lot.

---

## Annexe A — Nouvelles histoires (templatées, prêtes à coller)

### CE1 (need:0)
1. `ce1-carotte` 🥕 « La carotte du matin » target:30 — thème ferme (ciel #7dd3fc/#bae6fd, sol #86efac/#4ade80, obstacle 🌿)
   « {P} ouvre la grande porte de la ferme. {SonM} {N} attend près du pré. {El} lui donne une carotte orange. {N} croque la carotte très fort. {IlM} est {contentM}. Ensuite, ils partent jouer dans le pré vert. »
2. `ce1-bain` 🛁 « Le grand bain » target:33 — obstacle 🫧
   « Ce matin, {N} est plein de boue. {P} prépare un grand bain tiède. {El} frotte le dos, les jambes et la tête. {N} secoue tout son corps et envoie des gouttes partout ! {P} rit très fort. Maintenant, {leM} est tout propre et tout doux. »
3. `ce1-verger` 🍏 « Les pommes du verger » target:36 — obstacle 🍏
   « {P} et {N} vont au verger. Les pommes vertes brillent en haut du grand arbre. {N} tend le cou, mais elles sont trop hautes. Alors {P} grimpe sur son dos et attrape trois belles pommes. Ils partagent le goûter, assis sous le soleil doux. »
4. `ce1-nuit` 🌙 « Bonne nuit » target:39 — ciel nuit #312e81/#4c1d95, obstacle ⭐
   « La nuit tombe doucement sur la ferme. {N} rentre dans son abri de paille bien chaude. {P} lui raconte une petite histoire de pirates et de trésors. {LeM} ferme les yeux tranquillement. Dehors, la lune ronde veille sur eux. Bonne nuit, {N} ! »
5. `ce1-flaque` 💦 « La flaque géante » target:42 — obstacle 💧
   « Il a plu toute la nuit. Une flaque géante brille au milieu du chemin. {N} saute dedans à pieds joints ! {P} reçoit plein de gouttes fraîches et rit aux éclats. Alors ils sautent encore, encore et encore, de plus en plus haut. Quelle belle journée ! »
6. `ce1-cadeau` 🎁 « La surprise » target:45 — obstacle 🎁
   « Ce matin, une surprise attend {N} : un gros cadeau rouge est posé sur la paille. {P} tire sur le ruban doré. Dedans, il y a une couverture toute douce et un sac de carottes ! {N} fait un petit saut de joie. Quel beau jour de fête pour toute la ferme ! »

### CM1
1. `cm1-orage` ⛈️ « La nuit de la tempête » target:72 need:33 — ciel #475569/#64748b, obstacle ⚡
   « Depuis le matin, de gros nuages sombres roulent dans le ciel de la ferme. Le vent se lève, les volets claquent, et les poules courent se cacher dans leur abri. {P} décide de rentrer {N} avant la pluie. Soudain, un éclair déchire le ciel et le tonnerre gronde comme un tambour géant. {LeM} tremble un peu, alors {P} pose une main douce sur son cou et lui parle calmement. Ensemble, ils traversent la cour sous les premières gouttes. Dans la grange, bien au sec, ils écoutent la pluie danser sur le toit. {N} pose sa tête contre {P}, {rassureM}, et la tempête devient presque une musique. »
2. `cm1-course` 🏇 « La course des collines » target:78 need:37 — sol blé #fde047/#eab308, obstacle 🌾
   « Ce dimanche, tout le village se retrouve pour la grande course des collines. Des cavaliers venus de partout ajustent leurs casques et vérifient leurs selles. Au signal, {N} bondit comme une flèche. Le chemin monte entre les champs dorés, plonge dans un petit bois, puis longe la rivière qui scintille. {P} se penche en avant et encourage {sonM} de la voix. Dans le dernier virage, ils dépassent deux concurrents étonnés. La ligne est là, toute proche. Un dernier effort, un grand saut final, et ils franchissent la ligne les premiers ! La foule applaudit longtemps, et {N} salue avec panache. »
3. `cm1-chouette` 🦉 « La chouette blanche » target:84 need:41 — ciel #1e293b/#334155, obstacle 🌿
   « Un soir, {P} rentre tard par le sentier de la forêt. La lumière baisse, les ombres des arbres deviennent longues et mystérieuses. Une chouette blanche se pose alors sur une branche basse et hulule doucement, comme pour dire bonjour. Chaque fois que {leM} avance, la chouette vole un peu plus loin et attend. {P} comprend que la chouette montre le chemin. Ils suivent leur guide entre les fougères, passent un vieux tronc couché, et retrouvent enfin la lumière chaude de la ferme. Avant de partir, la chouette fait trois grands cercles dans le ciel étoilé. {P} promet de revenir la saluer, et {N} hoche la tête, comme pour promettre aussi. »
4. `cm1-riviere` 🌉 « La rivière en colère » target:90 need:45 — sol eau #60a5fa/#2563eb, obstacle 🪨
   « Au printemps, la rivière déborde et emporte le petit pont de bois. De ce côté, impossible de rejoindre le village pour la fête. {P} observe le courant, réfléchit, puis remarque un endroit où la rivière devient large et peu profonde. Prudemment, {N} entre dans la rivière fraîche, un pas après un autre. Les cailloux roulent sous ses pattes, mais {ilM} garde son calme et son équilibre. Au milieu, le courant pousse plus fort, alors {P} serre les jambes et garde le cap. Ils atteignent enfin la rive opposée, avec une grande fierté. Au village, tout le monde applaudit les héros du jour, et la fête peut commencer. »
5. `cm1-phare` 🗼 « La lumière du phare » target:95 need:50 — ciel couchant #fda4af/#fecdd3, obstacle 🌊
   « Cet été, {P} et {N} découvrent un vieux phare posé au bout de la falaise. Le gardien, un vieil homme au sourire doux, raconte que la lampe ne fonctionne plus depuis des semaines. Or, ce soir, un bateau de pêcheurs doit rentrer au port dans la nuit noire. {P} propose son aide aussitôt. Ils montent ensemble le grand escalier en colimaçon, portent la nouvelle ampoule, et resserrent chaque vis avec patience. Quand la nuit tombe, une immense lumière balaie enfin la mer. Au loin, le bateau répond par trois coups de corne joyeux. Le gardien serre la main de {P}, caresse doucement {N}, et leur offre le plus beau des mercis : un coucher de soleil depuis le sommet du phare. »
6. `cm1-aurore` 🌌 « Les lumières du nord » target:100 need:55 — ciel #0f172a/#1e1b4b, obstacle ❄️
   « Une légende raconte que, une nuit par an, le ciel du nord se remplit de couleurs dansantes. Cette nuit est arrivée. {P} prépare deux couvertures chaudes, un thermos de chocolat, et guide {N} vers le sommet de la colline. Le froid pique les joues, mais le spectacle mérite chaque pas. Vers minuit, un premier ruban vert ondule entre les étoiles, puis un voile rose, puis un fleuve violet qui traverse tout le ciel. {N} lève la tête, {fascineM}, les yeux remplis de lumière. {P} murmure que certaines merveilles se méritent avec de la patience. Ils restent là longtemps, dans un silence heureux, pendant que le ciel peint pour eux le plus beau tableau du monde. »
