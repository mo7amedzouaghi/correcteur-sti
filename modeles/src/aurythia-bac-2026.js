// Modèle de grille + règles automatiques : Bac STI 2026, séance 1 (Aurythia), barème officiel /40.
// Générer le JSON : node modeles/src/aurythia-bac-2026.js
const fs = require('fs');
const path = require('path');
const R = String.raw;

const EXEC = R`(mysqli_query|->\s*query|->\s*exec|->\s*execute|mysql_query)`;
const BT = '`?'; // backquote optionnel des exports phpMyAdmin
const btn = R`(input|button|\.|#)`;            // sélecteurs possibles pour les boutons
const fk = (col, table) => R`FOREIGN KEY\s*\(\s*${BT}${col}${BT}\s*\)\s*REFERENCES\s*${BT}${table}${BT}`;
const pkAlter = (t, cols) => R`ALTER TABLE\s+${BT}${t}${BT}\s+ADD PRIMARY KEY\s*\(\s*${cols}\s*\)`;
const pkInline = (t, cols) => R`CREATE TABLE[^;]*${BT}${t}${BT}\s*\([^;]*PRIMARY KEY\s*\(\s*${cols}\s*\)`;
const pk = (t, cols, label) => ({ type: 'ou', label, pts: 1, regles: [
  { type: 'regex', fichier: '*.sql', motif: pkAlter(t, cols) },
  { type: 'regex', fichier: '*.sql', motif: pkInline(t, cols) }] });
const col = c => `${BT}${c}${BT}`;

const C = [];
const add = (colonne, etape, question, sousQuestion, libelle, points, regles) =>
  C.push({ id: colonne, colonne, etape, question, sousQuestion, libelle, points, regles });

// ================= ETAPE 1 : base de données (3.5) =================
add('C', 'Etape 1', '1', '', 'Création de la base de données BD<n°>', 0.5, [
  { type: 'ou', label: 'Base BD<n°> créée (en-tête de l\'export)', pts: 1, regles: [
    { type: 'regex', fichier: '*.sql', sansCommentaires: false, motif: R`(Base de donn[ée]es|Database)\s*:\s*[\`'"]?bd\w*` },
    { type: 'regex', fichier: '*.sql', motif: R`CREATE DATABASE[^;]*bd\w*` }] }]);
add('D', 'Etape 1', '2', '', 'Importation du fichier « bijoux.sql »', 0.5, [
  { type: 'regex', label: 'Tables bijou, metal, composition, expert présentes dans l\'export', pts: 1, fichier: '*.sql', sansCommentaires: false,
    motifs: [R`(Base de donn[ée]es|Database)\s*:`, R`CREATE TABLE\s+${BT}bijou${BT}`, R`CREATE TABLE\s+${BT}metal${BT}`, R`CREATE TABLE\s+${BT}composition${BT}`, R`CREATE TABLE\s+${BT}expert${BT}`] }]);
add('E', 'Etape 1', '3', 'a', 'Clés primaires des tables', 0.5, [
  pk('bijou', col('idBij'), 'PK bijou (idBij)'),
  pk('metal', col('idMet'), 'PK metal (idMet)'),
  { type: 'ou', label: 'PK composition (idBij, idMet)', pts: 1, regles: [
    { type: 'regex', fichier: '*.sql', motif: pkAlter('composition', R`${col('idBij')}\s*,\s*${col('idMet')}`) },
    { type: 'regex', fichier: '*.sql', motif: pkAlter('composition', R`${col('idMet')}\s*,\s*${col('idBij')}`) },
    { type: 'regex', fichier: '*.sql', motif: pkInline('composition', R`${col('id\w+')}\s*,\s*${col('id\w+')}`) }] },
  pk('expert', col('idExp'), 'PK expert (idExp)')]);
add('F', 'Etape 1', '3', 'b', 'Création de la table « evaluation »', 1, [
  { type: 'regex', label: 'CREATE TABLE evaluation', pts: 1, fichier: '*.sql', motif: R`CREATE TABLE\s+${BT}evaluation${BT}` },
  { type: 'regex', label: 'idExp varchar(3) et idBij varchar(5)', pts: 1, fichier: '*.sql',
    motifs: [R`${col('idExp')}\s+(var)?char\s*\(\s*3\s*\)`, R`CREATE TABLE\s+${BT}evaluation${BT}[^;]*${col('idBij')}\s+(var)?char\s*\(\s*5\s*\)`] },
  { type: 'regex', label: 'finition entier, originalite caractère', pts: 1, fichier: '*.sql',
    motifs: [R`${col('finition')}\s+(tiny|small|medium|big)?int`, R`${col('originalite')}\s+(var)?char\s*\(\s*1\s*\)`] },
  { type: 'regex', label: 'commentaire varchar(200), dateEv datetime', pts: 1, fichier: '*.sql',
    motifs: [R`${col('commentaire')}\s+(var)?char\s*\(\s*200\s*\)`, R`${col('dateEv')}\s+(datetime|timestamp)`] },
  { type: 'ou', label: 'PK evaluation (idExp, idBij…)', pts: 1, regles: [
    { type: 'regex', fichier: '*.sql', motif: R`ALTER TABLE\s+${BT}evaluation${BT}\s+ADD PRIMARY KEY\s*\([^)]*idExp[^)]*idBij` },
    { type: 'regex', fichier: '*.sql', motif: R`ALTER TABLE\s+${BT}evaluation${BT}\s+ADD PRIMARY KEY\s*\([^)]*idBij[^)]*idExp` },
    { type: 'regex', fichier: '*.sql', motif: R`CREATE TABLE\s+${BT}evaluation${BT}[^;]*PRIMARY KEY\s*\([^)]*idExp` }] }]);
add('G', 'Etape 1', '3', 'c', 'Relations entre les tables', 0.5, [
  { type: 'regex', label: 'idBij → bijou (composition et evaluation)', pts: 2, fichier: '*.sql', motif: fk('idBij', 'bijou'), min: 2, proportionnel: true, global: false },
  { type: 'regex', label: 'idMet → metal', pts: 1, fichier: '*.sql', motif: fk('idMet', 'metal') },
  { type: 'regex', label: 'idExp → expert', pts: 1, fichier: '*.sql', motif: fk('idExp', 'expert') }]);
add('H', 'Etape 1', '4', '', 'Exportation de la base au format SQL', 0.5, [
  { type: 'regex', label: 'Export contenant la table evaluation', pts: 1, fichier: '*.sql',
    motifs: [R`CREATE TABLE\s+${BT}evaluation${BT}`, R`CREATE TABLE\s+${BT}bijou${BT}`] }]);

// ================= ETAPE 2 – Q1 page index =================
const IDX = 'index.html';
add('I', 'Etape 2', '1', 'a', 'header + h1 (texte) + nav + 3 liens (textes, cibles)', 2.25, [
  { type: 'html', label: 'header', fichier: IDX, selecteur: 'header' },
  { type: 'html', label: 'h1 « Aurythia : l\'art des bijoux »', fichier: IDX, selecteur: 'h1', texte: R`aurythia\s*:?\s*l.art des bijoux` },
  { type: 'html', label: 'nav', fichier: IDX, selecteur: 'nav' },
  { type: 'html', label: 'texte « Ajout d\'un bijou »', fichier: IDX, selecteur: 'nav a, a', texte: R`ajout d.un bijou` },
  { type: 'html', label: 'texte « Evaluation d\'un bijou »', fichier: IDX, selecteur: 'nav a, a', texte: R`[ée]valuation d.un bijou` },
  { type: 'html', label: 'texte « Liste des bijoux originaux »', fichier: IDX, selecteur: 'nav a, a', texte: R`liste des bijoux originaux` },
  { type: 'html', label: 'lien ajout.html + cible iframe', fichier: IDX, selecteur: 'a[href*="ajout.html"]', cibleIframe: true },
  { type: 'html', label: 'lien evaluation.html + cible iframe', fichier: IDX, selecteur: 'a[href*="evaluation.html"]', cibleIframe: true },
  { type: 'html', label: 'lien liste.php + cible iframe', fichier: IDX, selecteur: 'a[href*="liste.php"]', cibleIframe: true }]);
add('J', 'Etape 2', '1', 'a', 'main + section + iframe + aside + img', 1.25, [
  { type: 'html', label: 'main', fichier: IDX, selecteur: 'main' },
  { type: 'html', label: 'section dans main', fichier: IDX, selecteur: 'main section' },
  { type: 'html', label: 'iframe (ajout.html par défaut)', fichier: IDX, selecteur: 'section iframe[src*="ajout.html"]', indice: '<iframe' },
  { type: 'html', label: 'aside', fichier: IDX, selecteur: 'main aside, aside' },
  { type: 'html', label: 'img bijoux.jpg dans aside', fichier: IDX, selecteur: 'aside img[src*="bijoux.jpg"]', indice: 'bijoux\\.jpg' }]);
add('K', 'Etape 2', '1', 'a', 'footer + textes (liste à puces)', 0.75, [
  { type: 'html', label: 'footer', fichier: IDX, selecteur: 'footer' },
  { type: 'html', label: 'puce « Numéro Bleu : 82 10 00 00 »', fichier: IDX, selecteur: 'footer li', texte: R`num[ée]ro bleu\s*:?\s*82\s*10\s*00\s*00` },
  { type: 'html', label: 'puce « Email : admin@Aurythia.ai »', fichier: IDX, selecteur: 'footer li', texte: R`e-?mail\s*:?\s*admin@aurythia\.ai` }]);

const CSS = 'mesStyles.css';
add('L', 'Etape 2', '1', 'b', 'h1 : police Arial + majuscule à chaque mot', 0.75, [
  { type: 'css', label: 'Déclaration police Arial', fichier: CSS, propriete: 'font-family|font', valeur: 'arial' },
  { type: 'css', label: 'Déclaration text-transform capitalize', fichier: CSS, propriete: 'text-transform', valeur: 'capitalize' },
  { type: 'et', label: 'Application à h1', regles: [
    { type: 'css', fichier: CSS, propriete: 'font-family|font', valeur: 'arial', selecteurs: ['h1'] },
    { type: 'css', fichier: CSS, propriete: 'text-transform', valeur: 'capitalize', selecteurs: ['h1'] }] }]);
add('M', 'Etape 2', '1', 'b', 'header et footer : arrière-plan #053860', 0.5, [
  { type: 'css', label: 'Déclaration background #053860', fichier: CSS, propriete: 'background(-color)?', valeur: '#053860' },
  { type: 'css', label: 'Application header et footer', fichier: CSS, propriete: 'background(-color)?', valeur: '#053860', selecteurs: ['header', 'footer'] }]);
add('N', 'Etape 2', '1', 'b', 'a, header et footer : couleur du texte #FFFFFF', 0.5, [
  { type: 'css', label: 'Déclaration color #FFFFFF', fichier: CSS, propriete: 'color', valeur: R`#fff(fff)?\b|white|rgb\(\s*255\s*,\s*255\s*,\s*255` },
  { type: 'css', label: 'Application a, header, footer', fichier: CSS, propriete: 'color', valeur: R`#fff(fff)?\b|white|rgb\(\s*255`, selecteurs: ['a', 'header', 'footer'] }]);
add('O', 'Etape 2', '1', 'b', 'nav : marge intérieure 15px', 0.5, [
  // unité oubliée (« 15 ») : acceptée ici, sanctionnée une fois par type d'erreur (A6)
  { type: 'css', label: 'Déclaration padding 15px', fichier: CSS, propriete: 'padding', valeur: R`^15(px)?(\s+15(px)?){0,3}$` },
  { type: 'css', label: 'Application nav', fichier: CSS, propriete: 'padding', valeur: '15', selecteurs: ['nav'] }]);
const MARGE = (sel, label) => ({ type: 'css', fichier: CSS, propriete: 'margin(-left|-right)?', valeur: R`\d`, selecteurs: [sel], label });
const gauche = { type: 'ou', regles: [
  { type: 'css', fichier: CSS, propriete: 'float', valeur: 'left' },
  { type: 'css', fichier: CSS, propriete: 'display', valeur: 'inline-block|table-cell' },
  { type: 'css', fichier: CSS, propriete: 'display', valeur: 'flex', selecteurs: ['main'] }] };
add('P', 'Etape 2', '1', 'b', 'section à gauche (même ligne)', 0.5, [
  { ...gauche, label: 'Déclaration (gauche)', pts: 1, souple: MARGE('section|aside', 'mise en page par margin acceptée') },
  { type: 'ou', label: 'Application à section', pts: 1, souple: MARGE('section', 'margin sur section accepté'), regles: [
    { type: 'css', fichier: CSS, propriete: 'float', valeur: 'left', selecteurs: ['section'] },
    { type: 'css', fichier: CSS, propriete: 'display', valeur: 'inline-block|table-cell', selecteurs: ['section'] },
    { type: 'css', fichier: CSS, propriete: 'display', valeur: 'flex', selecteurs: ['main'] }] }]);
add('Q', 'Etape 2', '1', 'b', 'aside à droite de section', 0.5, [
  { type: 'ou', label: 'Déclaration (droite)', pts: 1, souple: MARGE('aside', 'margin-left sur aside accepté'), regles: [
    { type: 'css', fichier: CSS, propriete: 'float', valeur: 'right|left' },
    { type: 'css', fichier: CSS, propriete: 'display', valeur: 'inline-block|table-cell' },
    { type: 'css', fichier: CSS, propriete: 'display', valeur: 'flex', selecteurs: ['main'] }] },
  { type: 'ou', label: 'Application à aside', pts: 1, souple: MARGE('aside', 'margin sur aside accepté'), regles: [
    { type: 'css', fichier: CSS, propriete: 'float', valeur: 'right|left', selecteurs: ['aside'] },
    { type: 'css', fichier: CSS, propriete: 'display', valeur: 'inline-block|table-cell', selecteurs: ['aside'] },
    { type: 'css', fichier: CSS, propriete: 'display', valeur: 'flex', selecteurs: ['main'] }] }]);
add('R', 'Etape 2', '1', 'b', 'ul : style de puce carré', 0.5, [
  { type: 'css', label: 'Déclaration list-style square', fichier: CSS, propriete: 'list-style(-type)?', valeur: 'square' },
  { type: 'css', label: 'Application ul', fichier: CSS, propriete: 'list-style(-type)?', valeur: 'square', selecteurs: ['ul|li'] }]);

// ================= ETAPE 2 – Q2 ajout d'un bijou =================
const AJ = 'ajout.html';
add('S', 'Etape 2', '2', 'a', 'Liaison JS et CSS', 0.5, [
  { type: 'html', label: 'lien mesStyles.css', fichier: AJ, selecteur: 'link[href*="mesStyles.css" i]' },
  { type: 'html', label: 'script mesControles.js', fichier: AJ, selecteur: 'script[src*="mesControles.js" i]' }]);
add('T', 'Etape 2', '2', 'a', 'Propriétés du formulaire (post, ajout.php, return valide1())', 0.75, [
  { type: 'html', label: 'method="post"', fichier: AJ, selecteur: 'form[method="post" i]' },
  { type: 'html', label: 'action="ajout.php"', fichier: AJ, selecteur: 'form[action*="ajout.php"]' },
  { type: 'html', label: 'onsubmit="return valide1()"', fichier: AJ, selecteur: 'form', motif: R`onsubmit\s*=\s*["']\s*return\s+valide1\s*\(\s*\)` }]);
add('U', 'Etape 2', '2', 'a', 'Attribut required (Description)', 0.25, [
  { type: 'html', label: 'required sur la description', fichier: AJ, selecteur: '[required]', motif: 'desc' }]);
add('V', 'Etape 2', '2', 'b', 'fieldset : bordure double #0000FF 3px', 1, [
  { type: 'css', label: 'couleur #0000FF', fichier: CSS, propriete: 'border(-color)?', valeur: R`#0000ff|#00f\b|blue` },
  { type: 'css', label: 'épaisseur 3px', fichier: CSS, propriete: 'border(-width)?', valeur: R`3px` },
  { type: 'css', label: 'style double', fichier: CSS, propriete: 'border(-style)?', valeur: 'double' },
  { type: 'css', label: 'Application aux fieldset', fichier: CSS, propriete: 'border(-style)?', valeur: 'double', selecteurs: ['fieldset'] }]);
add('W', 'Etape 2', '2', 'b', 'Boutons : ombre bleue 5px 5px', 0.5, [
  { type: 'css', label: 'Déclaration box-shadow 5px 5px bleu', fichier: CSS, propriete: 'box-shadow', valeur: R`5px\s+5px.*(blue|#0000ff|#00f\b)|(blue|#0000ff|#00f\b).*5px\s+5px` },
  { type: 'css', label: 'Application aux boutons', fichier: CSS, propriete: 'box-shadow', valeur: '5px', selecteurs: [btn] }]);
const JS = 'mesControles.js';
add('X', 'Etape 2', '2', 'c', 'valide1 : identifiant (2 lettres + 3 chiffres)', 1.25, [
  { type: 'js', label: 'fonction valide1', fichier: JS, fonction: 'valide1' },
  { type: 'js', label: 'test de longueur = 5', fichier: JS, fonction: 'valide1', motif: R`length\s*(!==?|===?|<|>)\s*5|\{2\}.*\{3\}`, indice: 'length' },
  { type: 'js', label: 'test des 2 lettres', fichier: JS, fonction: 'valide1', motif: R`["']a["']|["']A["']|toUpperCase|toLowerCase|\[a-z|\[A-Z`, indice: 'charAt|\\[0\\]' },
  { type: 'js', label: 'test des 3 chiffres', fichier: JS, fonction: 'valide1', motif: R`["']0["']|["']9["']|isNaN|\\d|\[0-9|Number\(|parseInt` },
  { type: 'js', label: 'blocage (return false)', fichier: JS, fonction: 'valide1', motif: R`return\s+false` }]);
add('Y', 'Etape 2', '2', 'c', 'valide1 : prix ≥ 100 + arrière-plan rouge', 1.5, [
  { type: 'js', label: 'test prix ≥ 100', fichier: JS, fonction: 'valide1', motif: R`(<|>=|<=|>)\s*100\b|100\s*(<|>|<=|>=)`, indice: 'prix' },
  { type: 'js', label: 'style.background rouge', fichier: JS, fonction: 'valide1', motif: R`style\.background(Color)?\s*=\s*["'](red|#f00\b|#ff0000)`, indice: 'style\\.' }]);
add('Z', 'Etape 2', '2', 'c', 'valide1 : sélection d\'au moins un métal', 0.25, [
  { type: 'js', label: 'test checked', fichier: JS, fonction: 'valide1', motif: R`\.checked|:checked` }]);
const AP = 'ajout.php';
add('AA', 'Etape 2', '2', 'd', 'ajout.php : récupération des données', 1.5, [
  { type: 'regex', label: '4 champs du fieldset Détails ($_POST)', pts: 4, fichier: AP, motif: R`\$_(POST|REQUEST)\s*\[`, min: 5, proportionnel: true },
  { type: 'regex', label: 'Composition (tableau de cases à cocher parcouru)', pts: 2, fichier: AP, motif: R`foreach|for\s*\(|count\s*\(|sizeof\s*\(` }]);
add('AB', 'Etape 2', '2', 'd', 'Connexion au serveur + choix de la base (évaluée une seule fois)', 1, [
  { type: 'regex', label: 'connexion au serveur', fichier: '*.php', motif: R`mysqli_connect|new\s+mysqli|new\s+PDO|mysql_connect`, global: true },
  { type: 'regex', label: 'sélection de la base BD<n°>', fichier: '*.php', motif: R`mysqli_select_db|select_db|dbname\s*=|mysqli_connect\s*\([^)]*,[^)]*,[^)]*,[^)]*\)|new\s+mysqli\s*\([^)]*,[^)]*,[^)]*,[^)]*\)`, global: true }]);
add('AC', 'Etape 2', '2', 'd', 'Requête INSERT bijou (requête + exécution)', 1.25, [
  { type: 'regex', label: 'INSERT INTO bijou', pts: 4, fichier: AP, motif: R`insert\s+into\s+${BT}bijou${BT}` },
  { type: 'regex', label: 'exécution', pts: 1, fichier: AP, motif: EXEC }]);
add('AD', 'Etape 2', '2', 'd', 'INSERT composition (requête + exécution)', 1.25, [
  { type: 'regex', label: 'INSERT INTO composition', pts: 4, fichier: AP, motif: R`insert\s+into\s+${BT}composition${BT}` },
  { type: 'regex', label: 'exécution (2e requête)', pts: 1, fichier: AP, motif: EXEC, min: 2 }]);
add('AE', 'Etape 2', '2', 'd', 'Message « Ajout effectué avec succès »', 0.25, [
  { type: 'regex', label: 'message de succès', souple: { type: 'regex', fichier: AP, motif: R`\b(echo|print)\b`, min: 1, label: 'message reformulé accepté' }, fichier: AP, motif: R`ajout effectu[ée] avec succ[èe]s` }]);
add('AF', 'Etape 2', '2', 'd', 'Message « Erreur d\'insertion »', 0.25, [
  { type: 'regex', label: 'message d\'erreur', souple: { type: 'regex', fichier: AP, motif: R`\b(echo|print)\b`, min: 2, label: 'message reformulé accepté' }, fichier: AP, motif: R`erreur d.insertion` }]);

// ================= ETAPE 2 – Q3 évaluation =================
const EV = 'evaluation.html';
add('AG', 'Etape 2', '3', 'a', 'Formulaire (post, evaluation.php, return valide2())', 0.75, [
  { type: 'html', label: 'method="post"', fichier: EV, selecteur: 'form[method="post" i]' },
  { type: 'html', label: 'action="evaluation.php"', fichier: EV, selecteur: 'form[action*="evaluation.php"]' },
  { type: 'html', label: 'onsubmit="return valide2()"', fichier: EV, selecteur: 'form', motif: R`onsubmit\s*=\s*["']\s*return\s+valide2\s*\(\s*\)` }]);
add('AH', 'Etape 2', '3', 'a', 'Éléments graphiques du formulaire', 1.5, [
  { type: 'et', label: '2 fieldset avec légendes', regles: [
    { type: 'html', fichier: EV, selecteur: 'fieldset', min: 2 }, { type: 'html', fichier: EV, selecteur: 'legend', min: 2 }] },
  { type: 'html', label: '2 zones de saisie (identifiant + commentaire) avec labels', fichier: EV, selecteur: 'input[type="text"], input:not([type]), textarea', min: 2, proportionnel: true },
  { type: 'html', label: 'liste déroulante (select) avec label', fichier: EV, selecteur: 'select' },
  { type: 'html', label: 'zone number avec label', fichier: EV, selecteur: 'input[type="number"]' },
  { type: 'html', label: '2 boutons radio avec labels', fichier: EV, selecteur: 'input[type="radio"]', min: 2, proportionnel: true },
  { type: 'html', label: '2 boutons', fichier: EV, selecteur: 'input[type="submit"], input[type="reset"], input[type="button"], button', min: 2, proportionnel: true }]);
add('AI', 'Etape 2', '3', 'a', 'Éléments de la liste déroulante (A22, A23, A24)', 0.5, [
  { type: 'html', label: 'Chokri Sfaxi = A22', fichier: EV, selecteur: 'option[value="A22" i]', texte: 'chokri' },
  { type: 'html', label: 'Mohamed Jerbi = A23', fichier: EV, selecteur: 'option[value="A23" i]', texte: 'mohamed' },
  { type: 'html', label: 'Radhia Gafsi = A24', fichier: EV, selecteur: 'option[value="A24" i]', texte: 'radhia' }]);
add('AJ', 'Etape 2', '3', 'b', 'fieldset : gras + italique', 0.75, [
  { type: 'css', label: 'Déclaration gras', fichier: CSS, propriete: 'font-weight|font', valeur: R`bold|[6-9]00` },
  { type: 'css', label: 'Déclaration italique', fichier: CSS, propriete: 'font-style|font', valeur: 'italic' },
  { type: 'css', label: 'Application aux fieldset', fichier: CSS, propriete: 'font-style|font', valeur: 'italic', selecteurs: ['fieldset|legend|form'] }]);
add('AK', 'Etape 2', '3', 'b', 'Application aux deux boutons', 0.25, [
  { type: 'ou', label: 'Style appliqué aux boutons de evaluation.html', regles: [
    { type: 'css', fichier: CSS, propriete: 'font-weight|font-style|box-shadow', selecteurs: [btn] }] },
  { type: 'html', label: 'evaluation.html liée à mesStyles.css', fichier: EV, selecteur: 'link[href*="mesStyles.css" i]' }]);
const V2 = 'valide2';
add('AL', 'Etape 2', '3', 'c', 'valide2 : appel du contrôle de l\'identifiant', 0.25, [
  { type: 'js', label: 'contrôle de l\'identifiant réutilisé', fichier: JS, fonction: V2,
    motif: R`length\s*(!==?|===?)\s*5|\b(?!(?:alert|getElementById|parseInt|parseFloat|Number|isNaN|charAt|toUpperCase|toLowerCase|substr\w*|slice|indexOf|split|trim|focus|if|for|while|switch|return|function|valide2)\b)[a-zA-Z_]\w*\s*\(` }]);
add('AM', 'Etape 2', '3', 'c', 'valide2 : sélection d\'un expert', 0.25, [
  { type: 'js', label: 'test selectedIndex / valeur vide', fichier: JS, fonction: V2, motif: R`selectedIndex|\.value\s*(==|===)\s*["']{2}|==\s*-1` }]);
add('AN', 'Etape 2', '3', 'c', 'valide2 : finition entier entre 1 et 5', 0.25, [
  { type: 'js', label: 'test 1 ≤ finition ≤ 5', fichier: JS, fonction: V2, motif: R`(<|<=|>=|>)\s*[15]\b` }]);
add('AO', 'Etape 2', '3', 'c', 'valide2 : sélection de l\'originalité', 0.25, [
  { type: 'js', label: 'test checked (radios)', fichier: JS, fonction: V2, motif: R`\.checked` }]);
add('AP', 'Etape 2', '3', 'c', 'valide2 : commentaire (≥ 2 mots, lettres uniquement)', 2, [
  { type: 'js', label: 'découpage en mots (espaces)', fichier: JS, fonction: V2, motif: R`split\s*\(|==\s*["'] ["']|indexOf\s*\(\s*["'] ["']`, indice: 'commentaire' },
  { type: 'js', label: 'au moins 2 mots', fichier: JS, fonction: V2, motif: R`(<|>=)\s*2\b|nb\w*\s*(<|>=)|length\s*<\s*2` },
  { type: 'js', label: 'chaque mot formé de lettres', fichier: JS, fonction: V2, motif: R`["']a["']|["']A["']|["']z["']|["']Z["']|toUpperCase|\[a-z|\[A-Z`, indice: 'for|while' },
  { type: 'js', label: 'blocage (return false)', fichier: JS, fonction: V2, motif: R`return\s+false` }]);
const EP = 'evaluation.php';
add('AQ', 'Etape 2', '3', 'd', 'evaluation.php : récupération des données', 1.25, [
  { type: 'regex', label: '5 champs ($_POST)', fichier: EP, motif: R`\$_(POST|REQUEST)\s*\[`, min: 5, proportionnel: true }]);
add('AR', 'Etape 2', '3', 'd', 'Vérification de l\'existence du bijou (SELECT + exécution + test)', 2, [
  { type: 'regex', label: 'SELECT … FROM bijou WHERE idBij', pts: 6, fichier: EP, motif: R`select[\s\S]{0,200}?from\s+${BT}bijou${BT}[\s\S]{0,200}?where` },
  { type: 'regex', label: 'exécution', pts: 1, fichier: EP, motif: EXEC },
  { type: 'regex', label: 'test du résultat', pts: 1, fichier: EP, motif: R`num_rows|rowCount|fetch` }]);
add('AS', 'Etape 2', '3', 'd', 'Message « Bijou inexistant »', 0.25, [
  { type: 'regex', label: 'message', souple: { type: 'regex', fichier: EP, motif: R`\b(echo|print)\b`, min: 1, label: 'message reformulé accepté' }, fichier: EP, motif: R`bijou inexistant` }]);
add('AT', 'Etape 2', '3', 'd', 'Vérification de l\'évaluation par l\'expert (SELECT + exécution + test)', 2, [
  { type: 'regex', label: 'SELECT … FROM evaluation WHERE', pts: 6, fichier: EP, motif: R`select[\s\S]{0,200}?from\s+${BT}evaluation${BT}[\s\S]{0,300}?where` },
  { type: 'regex', label: 'exécution', pts: 1, fichier: EP, motif: EXEC, min: 2 },
  { type: 'regex', label: 'test du résultat', pts: 1, fichier: EP, motif: R`num_rows|rowCount|fetch`, min: 2 }]);
add('AU', 'Etape 2', '3', 'd', 'Message « Bijou déjà évalué … »', 0.25, [
  { type: 'regex', label: 'message', souple: { type: 'regex', fichier: EP, motif: R`\b(echo|print)\b`, min: 2, label: 'message reformulé accepté' }, fichier: EP, motif: R`d[ée]j[àa] [ée]valu[ée]` }]);
add('AV', 'Etape 2', '3', 'd', 'INSERT evaluation (requête + exécution) + message', 2, [
  { type: 'regex', label: 'INSERT INTO evaluation', pts: 6, fichier: EP, motif: R`insert\s+into\s+${BT}evaluation${BT}` },
  { type: 'regex', label: 'exécution', pts: 1, fichier: EP, motif: EXEC, min: 3 },
  { type: 'regex', label: 'message « Evaluation enregistrée »', pts: 1, souple: { type: 'regex', fichier: EP, motif: R`\b(echo|print)\b`, min: 3, label: 'message reformulé accepté' }, fichier: EP, motif: R`[ée]valuation enregistr[ée]e` }]);

// ================= ETAPE 2 – Q4 liste =================
const LI = 'liste.php';
add('AW', 'Etape 2', '4', '', 'liste.php : SELECT + exécution + parcours + affichage', 2.5, [
  { type: 'regex', label: 'SELECT des bijoux originaux (jointure evaluation)', pts: 6, fichier: LI, motifs: [R`select[\s\S]{0,300}?from`, R`evaluation`, R`originalit`] },
  { type: 'regex', label: 'exécution', pts: 1, fichier: LI, motif: EXEC },
  { type: 'regex', label: 'parcours des enregistrements', pts: 1, fichier: LI, motif: R`while\s*\(.*fetch|foreach\s*\(` },
  { type: 'regex', label: 'affichage des champs', pts: 2, fichier: LI, motif: R`echo|print` }]);

const modele = {
  nom: 'Bac STI 2026 – Séance 1 (Aurythia) – barème officiel',
  niveau: 'Bac', type: 'pratique', total: 40, noteSur: 20,
  remarques: [
    "−0.25 par type d'erreur (une même erreur n'est sanctionnée qu'une fois).",
    'Casse tolérée partout (HTML, CSS, JS, PHP) ; message affiché reformulé accepté ; mise en page par margin acceptée ; sélecteurs combinés (div h1) acceptés.',
    'Toute déclaration/expression/fonction non conforme aux documents officiels ne sera pas évaluée.',
    'Le non-respect de l\'emplacement (Q1-a) est sanctionné de 0.25 une seule fois.',
    'La connexion au serveur + sélection de la base est évaluée une seule fois.'
  ],
  criteres: C
};
const somme = C.reduce((a, c) => a + c.points, 0);
if (Math.abs(somme - 40) > 1e-9) throw new Error('Somme du barème = ' + somme);
const out = path.join(__dirname, '..', 'aurythia-bac-2026.json');
fs.writeFileSync(out, JSON.stringify(modele, null, 2));
console.log('OK', C.length, 'critères, total', somme, '->', out);
