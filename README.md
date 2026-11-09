<p align="center"><img src="build/images/banniere.png" alt="Correcteur STI — Mohamed Zouaghi" width="100%"></p>

# Correcteur STI

Application de bureau (Windows) pour **corriger les devoirs pratiques et théoriques** de la matière
**Systèmes et Technologies de l'Informatique (STI)** — 2<sup>e</sup>, 3<sup>e</sup> année et Bac Sciences de l'informatique —
et générer les **grilles d'évaluation détaillées (Word)** et la **grille collective (Excel)**.

Deux versions, un même cœur :

| Application | Correction | Connexion |
|---|---|---|
| **correcteurAuto** | règles automatiques (HTML, CSS, JS, PHP, SQL) | hors ligne |
| **hybrideCorrecteur** | règles automatiques + vérification par l'IA Claude, critère par critère | Internet + clé API Anthropic |

Référence pédagogique : [guide STI](https://github.com/mo7amedzouaghi/guideSTI) (importable dans l'espace Ressources).

## Télécharger

Les installateurs sont dans la page [**Releases**](https://github.com/mo7amedzouaghi/correcteur-sti/releases/latest) :
`correcteurAuto-Setup-x.y.z.exe` et `hybrideCorrecteur-Setup-x.y.z.exe`.

> Les installateurs ne sont pas signés : si Windows SmartScreen s'affiche, cliquez sur
> **Informations complémentaires → Exécuter quand même**.

## Fonctionnement

1. **Projet** : titre, niveau (2e, 3e, Bac), type (pratique / théorique), date, évaluateur.
2. **Énoncé** : déposer le sujet (PDF, Word, texte).
3. **Grille de correction** : téléverser la grille Excel officielle (une colonne par critère, ligne « Détail »),
   appliquer un modèle de règles, ou créer la grille critère par critère.
4. **Ressources** : corrigé, barème détaillé, fichiers fournis, guide STI (import direct depuis GitHub).
5. **Travaux des élèves** : un dossier ou une archive `.zip` par élève (ex. `SW123456`), ou un PDF / une image
   par élève pour une copie théorique scannée. Une case **Difficulté** par élève active la correction adaptée.
6. **Tolérance** : règles réglables (voir ci-dessous).
7. **Correction & grilles** : lancer la correction, vérifier et ajuster chaque note, valider, puis générer
   les grilles Word individuelles et la grille collective Excel (le gabarit officiel est rempli, formules conservées).

## Règles de tolérance par défaut

**Tous les élèves**
- −0,25 par **type** d'erreur sur toute la copie ; une erreur répétée n'est sanctionnée qu'une fois.
- Pas de pénalité en cascade (une erreur reprise de façon cohérente n'est comptée qu'une fois).
- Majuscules / minuscules **tolérées partout** (HTML, CSS, JS, PHP, noms de variables et de fichiers).
- Message affiché **reformulé accepté** s'il est au bon endroit.
- Solutions équivalentes acceptées : `float` / `flex` / `inline-block` / `margin-left`, sélecteurs combinés (`div h1`),
  `id` / `class`, `mysqli` / `PDO`, fonctions auxiliaires…
- Code commenté non évalué ; ce qui n'est pas conforme aux documents officiels n'est pas évalué.

**Élèves en difficulté d'apprentissage**
- Erreurs mineures ignorées (casse, frappe, `;` ou guillemet oublié).
- Points partiels élargis (jusqu'à la moitié d'un critère pour une tentative pertinente).
- Pénalités plafonnées à 1 point sur la copie.
- Commentaires simplifiés avec conseils de remédiation ; mention « correction adaptée » (désactivable).

## Modèles de règles

Un modèle (`modeles/*.json`) associe à chaque colonne de la grille un libellé et des règles
(`fichier`, `regex`, `html`, `css`, `js`, `ou`, `et`, `manuel`). Modèle fourni :
**Bac STI 2026 – séance 1 (Aurythia)**, 47 critères, barème officiel /40.
Toute grille peut être enregistrée comme nouveau modèle depuis l'application.

## Développement

```bash
npm install
npm run auto        # lance correcteurAuto
npm run hybride     # lance hybrideCorrecteur
npm test            # test de bout en bout sur 3 élèves fictifs
npm run dist:auto   # installateur correcteurAuto (dist/)
npm run dist:hybride
```

Électron · exceljs · docx · cheerio · SDK Anthropic (`claude-opus-5-5`).
Les travaux d'élèves et la clé API restent sur l'ordinateur de l'enseignant ; en mode hybride,
les travaux sont envoyés à l'API Claude au moment de la correction.

---

Conçu par **Mohamed Zouaghi**.
