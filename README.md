<p align="center"><img src="build/images/banniere.png" alt="Correcteur STI — Mohamed Zouaghi" width="100%"></p>

# correcteurAuto — Correcteur STI

Application de bureau Windows, **hors ligne**, pour **corriger les devoirs pratiques et théoriques** de la matière
**Systèmes et Technologies de l'Informatique (STI)** — 2<sup>e</sup>, 3<sup>e</sup> année et Bac Sciences de l'informatique —
et générer les **grilles d'évaluation détaillées (Word)** et la **grille collective (Excel)**.

Référence pédagogique : [guide STI](https://github.com/mo7amedzouaghi/guideSTI) (importable dans l'espace Ressources).

## Télécharger

Installateur dans la page [**Releases**](https://github.com/mo7amedzouaghi/correcteur-sti/releases/latest) :
`correcteurAuto-Setup-x.y.z.exe`.

> L'installateur n'est pas signé : si Windows SmartScreen s'affiche, cliquez sur
> **Informations complémentaires → Exécuter quand même**.

## Fonctionnement

1. **Projet** : titre, niveau (2e, 3e, Bac), type (pratique / théorique), date, évaluateur.
2. **Énoncé** : déposer le sujet (PDF, Word, texte). **Il est analysé automatiquement et une grille est proposée.**
3. **Grille de correction** : grille proposée selon la structure du devoir, ou grille Excel officielle téléversée
   (une colonne par critère, ligne « Détail »), ou modèle de règles, ou création critère par critère.
4. **Ressources** : corrigé, barème détaillé, fichiers fournis, guide STI (import direct depuis GitHub).
5. **Travaux des élèves** : un dossier ou une archive `.zip` par élève (ex. `SW123456`), ou un PDF / une image
   par élève pour une copie théorique scannée. Une case **Difficulté** par élève active la correction adaptée.
6. **Tolérance** : règles réglables (voir ci-dessous).
7. **Correction & grilles** : lancer la correction, vérifier et ajuster chaque note, valider, puis générer
   les grilles Word individuelles et la grille collective Excel (le gabarit officiel est rempli, formules conservées).

## Grille proposée à partir de l'énoncé

- **Toujours sur 40 points** (note sur 20 = total / 2), **répartie équitablement** en multiples de 0,25 : la somme est exacte
  et aucun critère n'est à 0. Le total est réglable (champ « Sur … points »).
- **Structure du devoir respectée** : les parties gardent leur nom et leur titre (« Exercice 2 : Contrôle de saisie »,
  « Partie B : Questions de cours », « Etape 1 : Manipulation de la base de données »…) ; sans parties, la grille est
  organisée par question. Numérotation 1), 2)… a), b)… reprise du sujet.
- **Barème** : tableau de points imprimé dans l'énoncé, sinon points annoncés dans les titres (« Exercice 2 (8 points) »)
  ramenés sur 40, sinon répartition selon le nombre d'éléments à vérifier. « 0,25 pt par question / par blanc » :
  chaque question de la partie reçoit la même part ; ses sous-questions se la partagent.
- **Épreuve théorique** (aucun fichier à créer) détectée automatiquement : QCM (les propositions a) b) c) ne sont pas
  des sous-questions), questions, parties « Compléter les codes »… tous les critères sont notés par l'enseignant.
- **Règles automatiques** (épreuve pratique) selon la nature de la question : fichiers, balises et liens HTML,
  propriétés CSS, fonctions JavaScript, requêtes SQL / PHP, messages affichés. Les questions de cours sont à noter à la main.
- Avec une grille Excel officielle, ses colonnes et son barème sont conservés ; libellés et règles sont proposés.

La proposition est un point de départ : vérifiez libellés, barème et règles avant la correction.

- **Grille toujours redistribuée sur 40 points au départ** (`Total /40`), quel que soit le niveau, le type de
  devoir ou le barème imprimé sur le sujet (sur 20, 25…) : chaque critère est ramené à l'échelle /40, en conservant
  les proportions du barème officiel. La **Note** affichée (`Note /20` par défaut) n'est qu'une mise à l'échelle
  de ce total, réglable à tout moment (`projet.grille.noteSur`) sans toucher au détail des critères.

## Règles de tolérance par défaut

**Tous les élèves**
- −0,25 par **type** d'erreur sur toute la copie ; une erreur répétée n'est sanctionnée qu'une fois. Pas de pénalité en cascade.
- Majuscules / minuscules **tolérées partout** (HTML, CSS, JS, PHP, noms de variables, de fonctions et de fichiers).
- Message affiché **reformulé accepté** s'il est au bon endroit.
- Solutions équivalentes acceptées : `float` / `flex` / `inline-block` / `margin` / `margin-left`, sélecteurs combinés (`div h1`),
  `id` / `class`, `mysqli` / `PDO`, fonctions auxiliaires, expression régulière JavaScript…
- Unité CSS oubliée (`padding: 15`) : une seule sanction pour ce type d'erreur.
- Fichier demandé rangé dans un sous-dossier (hors du dossier de travail) : −0,25, une seule fois.
- Erreur de syntaxe bloquante (accolade manquante) : sanctionnée une fois, la logique reste notée.
- Code commenté non évalué ; code supplémentaire non pénalisé ; seul ce qui est conforme aux documents officiels rapporte des points.
- **Noms approchés recherchés et acceptés** : fichier renommé ou mal orthographié (ex. `suivie.html`, `scriptt.js`,
  `decor.css` pour le `style.css` demandé — y compris dans un sous-dossier), fonction mal orthographiée
  (`genereDefi` pour `genererDefi`), identifiant ou classe CSS/HTML approché (`#defis` pour `#defi`, `.boutton`
  pour `.bouton`). Désactivable projet par projet (`tolerance.nomsApproches = false`).
- **Champ de formulaire retrouvé par son libellé** quand l'identifiant ne correspond à rien de proche (ex. le
  champ à côté du texte « Nom du pilote » même si son `id` est différent) — règle `html` avec l'option `libelle`.
- **Police** : seul le nom de la police demandée est vérifié ; l'absence d'une police de secours générique
  (`sans-serif`, `serif`…) n'est jamais sanctionnée.
- **Variable globale** : déclaration explicite (`let`/`var`/`const`), affectation implicite (y compris à
  l'intérieur d'une fonction) ou valeur conservée/retrouvée autrement via le DOM sont toutes acceptées — seul le
  rôle (mémoriser une valeur entre deux appels) compte, pas la syntaxe exacte (règle `variable`, détectée
  automatiquement depuis une consigne « Déclarer une variable globale … »).
- **Arrondi toujours au 0,25 point supérieur** pour chaque critère (jamais au défavorable de l'élève) — tolérance
  maximale. Désactivable (`tolerance.arrondiSuperieur = false`) pour revenir à l'arrondi au plus proche.

**Élèves en difficulté d'apprentissage**
- Erreurs mineures ignorées (casse, frappe, `;` ou guillemet oublié, unité, rangement des fichiers).
- Points partiels élargis (jusqu'à la moitié d'un critère pour une tentative pertinente, par ex. lien présent mais cible fausse).
- Pénalités plafonnées à 1 point sur la copie si les erreurs mineures ne sont pas ignorées.
- Commentaires simplifiés avec conseils de remédiation ; mention « correction adaptée » (désactivable).

## Mise à jour

Onglet **Mise à jour** : l'application compare sa version à la dernière version publiée sur GitHub
(vérification automatique au démarrage, désactivable). **Télécharger et installer** récupère l'installateur,
contrôle sa taille et son empreinte SHA-256, puis vous demande confirmation avant de le lancer.
Vos projets et réglages ne sont pas modifiés. Publier une nouvelle version = créer une Release GitHub (`vX.Y.Z`)
contenant `correcteurAuto-Setup-X.Y.Z.exe`.

## Modèles de règles

Un modèle (`modeles/*.json`) associe à chaque colonne de la grille un libellé et des règles
(`fichier`, `regex`, `html`, `css`, `js`, `variable`, `ou`, `et`, `manuel`). Modèles fournis :
**Bac STI 2026 – séance 1 (Aurythia)**, 47 critères, barème officiel /40 ;
**DC2 4 SI1 – SkyTrack** (Lycée Oued Ellil, 11/11/2026), 20 critères, barème imprimé /20 redistribué sur 40.
Toute grille peut être enregistrée comme nouveau modèle depuis l'application.

## Développement

```bash
npm install
npm start           # lance correcteurAuto
npm test            # correction (5 élèves fictifs), grille proposée sur 40, mise à jour
npm run dist        # installateur Windows (dist/)
```

Electron · exceljs · docx · cheerio · mammoth · pdf-parse. Tout fonctionne hors ligne :
les travaux des élèves restent sur l'ordinateur de l'enseignant.

---

Conçu par **Mohamed Zouaghi**.
