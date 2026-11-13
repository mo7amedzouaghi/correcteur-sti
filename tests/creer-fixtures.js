// Crée deux travaux d'élèves fictifs pour le devoir Aurythia (un complet, un partiel avec erreurs).
const fs = require('fs');
const path = require('path');
const base = path.join(__dirname, 'fixtures', 'eleves');

const E1 = {
  'index.html': `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><title>Aurythia</title>
<link rel="stylesheet" href="mesStyles.css"></head>
<body>
<header><h1>Aurythia : l'art des bijoux</h1>
<nav><a href="ajout.html" target="zone">Ajout d'un bijou</a> <a href="evaluation.html" target="zone">Evaluation d'un bijou</a> <a href="liste.php" target="zone">Liste des bijoux originaux</a></nav></header>
<main><section><iframe name="zone" src="ajout.html" width="100%" height="500"></iframe></section>
<aside><img src="bijoux.jpg" alt="bijoux"></aside></main>
<footer><ul><li>Numéro Bleu : 82 10 00 00</li><li>Email : admin@Aurythia.ai</li></ul></footer>
</body></html>`,
  'mesStyles.css': `h1 { font-family: Arial; text-transform: capitalize; }
header, footer { background-color: #053860; }
a, header, footer { color: #FFFFFF; }
nav { padding: 15px; }
section { float: left; width: 70%; }
aside { float: right; width: 25%; }
ul { list-style-type: square; }
fieldset { border: 3px double #0000FF; font-weight: bold; font-style: italic; }
input[type="submit"], input[type="reset"] { box-shadow: 5px 5px blue; font-weight: bold; }`,
  'ajout.html': `<html><head><meta charset="utf-8"><link rel="stylesheet" href="mesStyles.css"><script src="mesControles.js"></script></head>
<body><form method="post" action="ajout.php" onsubmit="return valide1()">
<fieldset><legend>Détails</legend>
Identifiant <input type="text" name="idBij" id="idBij"><br>
Description <input type="text" name="description" id="description" required><br>
Prix de vente <input type="number" name="prix" id="prix"><br>
Poids <input type="number" name="poids" id="poids"></fieldset>
<fieldset><legend>Composition</legend>
<input type="checkbox" name="met[]" value="O"> Or <input type="checkbox" name="met[]" value="A"> Argent</fieldset>
<input type="submit" value="Enregistrer"> <input type="reset" value="Annuler"></form></body></html>`,
  'mesControles.js': `function valide1() {
  var id = document.getElementById("idBij").value;
  if (id.length != 5 || !lettres(id.substr(0, 2)) || !chiffres(id.substr(2))) { alert("Identifiant invalide"); return false; }
  var prix = document.getElementById("prix");
  if (Number(prix.value) < 100) { prix.style.backgroundColor = "red"; return false; }
  prix.style.backgroundColor = "white";
  var m = document.getElementsByName("met[]"), ok = false;
  for (var i = 0; i < m.length; i++) if (m[i].checked) ok = true;
  if (!ok) { alert("Choisir un métal"); return false; }
  return true;
}
function lettres(ch) { ch = ch.toUpperCase(); for (var i = 0; i < ch.length; i++) if (ch[i] < "A" || ch[i] > "Z") return false; return true; }
function chiffres(ch) { for (var i = 0; i < ch.length; i++) if (ch[i] < "0" || ch[i] > "9") return false; return true; }
function valide2() {
  var id = document.getElementById("idBij").value;
  if (id.length != 5 || !lettres(id.substr(0, 2)) || !chiffres(id.substr(2))) { alert("Identifiant invalide"); return false; }
  if (document.getElementById("expert").selectedIndex == 0) { alert("Choisir un expert"); return false; }
  var f = Number(document.getElementById("finition").value);
  if (f < 1 || f > 5) { alert("Finition entre 1 et 5"); return false; }
  if (!document.getElementById("o").checked && !document.getElementById("n").checked) { alert("Originalité ?"); return false; }
  var mots = document.getElementById("commentaire").value.split(" ");
  if (mots.length < 2) { alert("Au moins 2 mots"); return false; }
  for (var i = 0; i < mots.length; i++) if (!lettres(mots[i])) { alert("Lettres uniquement"); return false; }
  return true;
}`,
  'evaluation.html': `<html><head><meta charset="utf-8"><link rel="stylesheet" href="mesStyles.css"><script src="mesControles.js"></script></head>
<body><form method="post" action="evaluation.php" onsubmit="return valide2()">
<fieldset><legend>Evaluation d'un bijou</legend>
<label>Identifiant</label><input type="text" name="idBij" id="idBij">
<label>Expert</label><select name="expert" id="expert"><option value="">--</option><option value="A22">Chokri Sfaxi</option><option value="A23">Mohamed Jerbi</option><option value="A24">Radhia Gafsi</option></select></fieldset>
<fieldset><legend>Critères d'évaluation</legend>
<label>Finition</label><input type="number" name="finition" id="finition">
<input type="radio" name="orig" id="o" value="O"><label>Original</label><input type="radio" name="orig" id="n" value="N"><label>Non original</label>
<label>Commentaire</label><input type="text" name="commentaire" id="commentaire"></fieldset>
<input type="submit" value="Enregistrer"><input type="reset" value="Annuler"></form></body></html>`,
  'ajout.php': `<?php
$id = $_POST["idBij"]; $d = $_POST["description"]; $p = $_POST["prix"]; $po = $_POST["poids"]; $met = $_POST["met"];
$cnx = mysqli_connect("localhost", "root", "", "BD100001");
$req = "INSERT INTO bijou VALUES ('$id', '$d', $p, $po)";
$ok = mysqli_query($cnx, $req);
foreach ($met as $m) { $ok = $ok && mysqli_query($cnx, "INSERT INTO composition VALUES ('$id', '$m')"); }
if ($ok) echo "Ajout effectué avec succès"; else echo "Erreur d'insertion";
?>`,
  'evaluation.php': `<?php
$id = $_POST["idBij"]; $e = $_POST["expert"]; $f = $_POST["finition"]; $o = $_POST["orig"]; $c = $_POST["commentaire"];
$cnx = mysqli_connect("localhost", "root", "", "BD100001");
$r = mysqli_query($cnx, "SELECT * FROM bijou WHERE idBij = '$id'");
if (mysqli_num_rows($r) == 0) echo "Bijou inexistant";
else {
  $r2 = mysqli_query($cnx, "SELECT * FROM evaluation WHERE idBij = '$id' AND idExp = '$e'");
  if (mysqli_num_rows($r2) > 0) echo "Bijou déjà évalué par cet expert";
  else { mysqli_query($cnx, "INSERT INTO evaluation VALUES ('$e', '$id', $f, '$o', '$c', NOW())"); echo "Evaluation enregistrée avec succès"; }
}
?>`,
  'liste.php': `<?php
$cnx = mysqli_connect("localhost", "root", "", "BD100001");
$r = mysqli_query($cnx, "SELECT b.idBij, description, prixVente FROM bijou b, evaluation e WHERE b.idBij = e.idBij AND originalite = 'O'");
while ($l = mysqli_fetch_array($r)) echo $l[0] . " " . $l[1] . " " . $l[2] . "<br>";
?>`,
  'BD100001.sql': `-- phpMyAdmin SQL Dump
-- Base de données : \`bd100001\`
CREATE TABLE \`bijou\` (\`idBij\` varchar(5) NOT NULL, \`description\` varchar(100), \`prixVente\` int(11), \`poids\` int(11));
CREATE TABLE \`metal\` (\`idMet\` char(1) NOT NULL, \`nomMet\` varchar(50));
CREATE TABLE \`composition\` (\`idBij\` varchar(5) NOT NULL, \`idMet\` char(1) NOT NULL);
CREATE TABLE \`expert\` (\`idExp\` varchar(3) NOT NULL, \`nomExp\` varchar(50), \`mail\` varchar(100));
CREATE TABLE \`evaluation\` (\`idExp\` varchar(3) NOT NULL, \`idBij\` varchar(5) NOT NULL, \`finition\` int(11), \`originalite\` char(1), \`commentaire\` varchar(200), \`dateEv\` datetime);
ALTER TABLE \`bijou\`
  ADD PRIMARY KEY (\`idBij\`);
ALTER TABLE \`metal\`
  ADD PRIMARY KEY (\`idMet\`);
ALTER TABLE \`composition\`
  ADD PRIMARY KEY (\`idBij\`,\`idMet\`);
ALTER TABLE \`expert\`
  ADD PRIMARY KEY (\`idExp\`);
ALTER TABLE \`evaluation\`
  ADD PRIMARY KEY (\`idExp\`,\`idBij\`);
ALTER TABLE \`composition\`
  ADD CONSTRAINT \`c1\` FOREIGN KEY (\`idBij\`) REFERENCES \`bijou\` (\`idBij\`),
  ADD CONSTRAINT \`c2\` FOREIGN KEY (\`idMet\`) REFERENCES \`metal\` (\`idMet\`);
ALTER TABLE \`evaluation\`
  ADD CONSTRAINT \`e1\` FOREIGN KEY (\`idExp\`) REFERENCES \`expert\` (\`idExp\`),
  ADD CONSTRAINT \`e2\` FOREIGN KEY (\`idBij\`) REFERENCES \`bijou\` (\`idBij\`);`
};

// élève 2 : travail partiel, casse incorrecte, JS avec accolade manquante
const E2 = {
  'index.html': `<html><head><link rel="stylesheet" href="messtyles.css"></head><body>
<header><h1>aurythia : l'art des bijoux</h1><nav><a href="ajout.html">ajout d'un bijou</a> <a href="evaluation.html">Evaluation d'un bijou</a></nav></header>
<section><iframe src="ajout.html"></iframe></section><aside><img src="bijoux.jpg"></aside>
<footer><ul><li>Numero Bleu : 82 10 00 00</li></ul></footer></body></html>`,
  'mesStyles.css': `h1 { font-family: arial }
header { background-color: #053860 }
nav { padding: 15px }
section { display: inline-block }`,
  'mesControles.js': `function valide1() {
  var id = document.getElementById("idBij").value;
  if (id.length != 5) { alert("erreur"); return false
  var prix = document.getElementById("prix").value;
  if (prix < 100) { document.getElementById("prix").style.background = "red"; return false; }
}`
};

// élève 3 : complet, mais messages reformulés, casse différente, unités oubliées (2 fois le même type), mise en page par margin
const E3 = { ...E1 };
E3['mesStyles.css'] = E1['mesStyles.css']
  .replace('h1 {', 'H1 {').replace('padding: 15px;', 'padding: 15;')
  .replace('section { float: left; width: 70%; }', 'section { width: 70; margin-right: 30%; }')
  .replace('aside { float: right; width: 25%; }', 'aside { margin-left: 72%; }');
E3['index.html'] = E1['index.html'].replace('href="mesStyles.css"', 'href="MesStyles.css"');
E3['ajout.php'] = E1['ajout.php'].replace('Ajout effectué avec succès', 'Le bijou a bien été ajouté').replace("Erreur d'insertion", 'Problème : bijou non ajouté');
E3['evaluation.php'] = E1['evaluation.php'].replace('Bijou inexistant', "Ce bijou n'existe pas");

// élève 4 : complet, feuille de style écrite avec des sélecteurs combinés (« header h1 ») et la mise en page par margin / margin-left (A11)
const E4 = { ...E1 };
E4['mesStyles.css'] = `header h1 { font-family: Arial; text-transform: capitalize; }
header, footer { background-color: #053860; }
header a, header, footer { color: #FFFFFF; }
header nav { padding: 15px; }
main section { width: 70%; margin-right: 30%; }
main aside { width: 25%; margin-left: 72%; }
ul { list-style-type: square; }
fieldset { border: 3px double #0000FF; font-weight: bold; font-style: italic; }
input[type="submit"], input[type="reset"] { box-shadow: 5px 5px blue; font-weight: bold; }`;

// élève 5 : complet, mais mesControles.js est rangé dans un sous-dossier « js/ » (A10)
const E5 = { ...E1 };
delete E5['mesControles.js'];
E5['js/mesControles.js'] = E1['mesControles.js'];

for (const [nom, fichiers] of [['SW100001', E1], ['SW100002', E2], ['SW100003', E3], ['SW100004', E4], ['SW100005', E5]]) {
  const d = path.join(base, nom);
  fs.rmSync(d, { recursive: true, force: true });
  fs.mkdirSync(d, { recursive: true });
  for (const [f, c] of Object.entries(fichiers)) {
    fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true });
    fs.writeFileSync(path.join(d, f), c);
  }
}
console.log('Fixtures créées dans', base);
