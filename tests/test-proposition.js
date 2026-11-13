// Grille proposée automatiquement : toujours sur 40, répartie équitablement (aucun document privé requis).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { proposerGrille, repartirUnites, structure } = require('../src/core/proposition');

const somme = g => Math.round(g.criteres.reduce((a, c) => a + c.points, 0) * 100) / 100;
const multiple025 = g => g.criteres.every(c => Math.abs(c.points * 4 - Math.round(c.points * 4)) < 1e-9);

// ---- répartition : somme exacte, minimum 0,25, aucun critère à 0 ----
for (const [poids, unites] of [[[1, 1, 1], 8], [[3, 5, 9], 160], [[1, 1, 1, 1, 1, 1, 1], 160], [[7, 1, 1], 20], [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 160]]) {
  const r = repartirUnites(poids, unites);
  assert.strictEqual(r.reduce((a, b) => a + b, 0), unites, `somme exacte pour ${poids} sur ${unites}`);
  assert(r.every(x => x >= 1), 'chaque critère reçoit au moins une unité (0,25)');
}
assert.deepStrictEqual(repartirUnites([1, 1, 1], 8), [3, 3, 2]);
assert.deepStrictEqual(repartirUnites([1, 1, 1, 1], 8), [2, 2, 2, 2], 'poids égaux, reste nul => parts égales');

// ---- épreuve théorique (modèle inventé) : 24 QCM + 8 questions + 1 partie sans question numérotée ----
let t = 'Devoir de contrôle STI — 3SI\nExercice I : Encercler la bonne réponse (6 points : 0,25 pt par question)\n';
for (let i = 1; i <= 24; i++) t += `${i}. Question de cours numéro ${i} ?\na) première réponse\tb) deuxième réponse\tc) troisième réponse\n`;
t += 'Exercice II : Répondre aux questions (8 points : 1 pt par question)\n';
for (let i = 1; i <= 8; i++) {
  t += `${i}. Quelle est la valeur demandée ?\n`;
  if (i === 2 || i === 5) for (const l of ['a', 'b', 'c', 'd']) t += `${l}) Élément ${l} : ................\n`;
  else t += 'A : ............\nB : ............\n';
}
t += 'Exercice III : Compléter les codes (6 points : 0.25 pt par blanc)\nOn vous donne les fichiers suivants.\nPage.html :\n<p>(1).......</p>\n(1)\n(2)\nBon travail\n';
const g = proposerGrille(t, { total: 40 });
assert.strictEqual(g.theorique, true, 'aucune question ne demande de créer un fichier : épreuve théorique');
assert.strictEqual(somme(g), 40, 'total exactement 40');
assert.strictEqual(g.total, 40);
assert(multiple025(g), 'tous les points sont des multiples de 0,25');
assert(g.criteres.every(c => c.regles.every(r => r.type === 'manuel')), 'théorique : tout est à noter par l\'enseignant');
const ex1 = g.criteres.filter(c => c.etape.startsWith('Exercice I :'));
assert.strictEqual(ex1.length, 24, 'les propositions a) b) c) ne sont pas des sous-questions');
assert(ex1.every(c => c.points === 0.5), '« 0,25 pt par question » sur 20 => 0,5 sur 40 pour chaque question');
const ex2 = g.criteres.filter(c => c.etape.startsWith('Exercice II :'));
assert.strictEqual(ex2.reduce((a, c) => a + c.points, 0), 16);
for (let q = 1; q <= 8; q++) assert.strictEqual(ex2.filter(c => c.question === String(q)).reduce((a, c) => a + c.points, 0), 2, `question ${q} : 2 points`);
assert.strictEqual(ex2.filter(c => c.question === '2').length, 4, 'les lignes a) b) c) d) à compléter sont des sous-questions');
const ex3 = g.criteres.filter(c => c.etape.startsWith('Exercice III'));
assert.strictEqual(ex3.length, 1, 'une partie sans question numérotée reste un critère');
assert.strictEqual(ex3[0].points, 12);
assert(/24 × 0,5 pt/.test(ex3[0].libelle), 'rappel du nombre de blancs : ' + ex3[0].libelle);
assert(ex2.find(c => c.question === '2' && c.sousQuestion === 'a').libelle.indexOf('...') < 0, 'pas de pointillés dans les libellés');

// ---- le total est réglable (20, 30…) et reste exact ----
for (const tot of [20, 30, 40, 60]) { const h = proposerGrille(t, { total: tot }); assert.strictEqual(somme(h), tot, `total ${tot}`); }

// ---- sujet pratique à exercices : points annoncés ramenés sur 40 ----
const ex = `Devoir de contrôle n°2 - 3e STI
Exercice 1 : Mise en forme CSS (5 points)
1) Ajouter au fichier "style.css" les règles permettant d'appliquer une police Verdana au corps de la page.
2) Ajouter une bordure de 2px aux images.
Exercice 2 (8 points) : Contrôle de saisie
a) Développer la fonction "verif" qui contrôle le champ nom.
b) Développer la fonction "alpha" qui vérifie qu'une chaîne est alphabétique.
Partie B : Questions de cours (7 points)
1) Définir le rôle de la balise <form>.
2) Citer deux méthodes d'envoi d'un formulaire.`;
const gp = proposerGrille(ex, { total: 40 });
assert.strictEqual(gp.theorique, false);
assert.strictEqual(somme(gp), 40);
const parPartie = {}; for (const c of gp.criteres) parPartie[c.etape] = (parPartie[c.etape] || 0) + c.points;
assert.deepStrictEqual(Object.values(parPartie), [10, 16, 14], 'points annoncés 5 / 8 / 7 sur 20, ramenés sur 40');
assert(gp.criteres.some(c => c.etape.startsWith('Exercice 2') && c.regles.some(r => r.type === 'js')), 'règles automatiques JS détectées');
assert(gp.criteres.find(c => c.etape.startsWith('Partie B') && c.question === '1').regles[0].type === 'manuel', 'question de cours : à noter par l\'enseignant');
assert(gp.criteres.every(c => c.etape !== 'Etape 1'), 'les parties gardent le nom du sujet');

// ---- sujet sans parties : une partie par question ----
const sp = structure('1) Créer la page "a.html".\n2) Créer la page "b.html".');
assert.deepStrictEqual(sp.map(f => f.etape), ['Question 1', 'Question 2']);

// ---- énoncé Bac Aurythia (si le PDF officiel est présent) : barème officiel ramené sur 40 ----
const pdf = path.join(__dirname, 'fixtures', 'enonce.pdf');
if (fs.existsSync(pdf)) {
  require('../src/core/extract').texteDepuisFichier(pdf).then(txt => {
    const a = proposerGrille(txt, { total: 40 });
    assert.strictEqual(somme(a), 40);
    const q = {}; for (const c of a.criteres) { const k = c.etape.slice(0, 7) + ' Q' + c.question; q[k] = (q[k] || 0) + c.points; }
    assert.strictEqual(q['Etape 2 Q1'], 8); assert.strictEqual(q['Etape 2 Q2'], 11.5);
    assert.strictEqual(q['Etape 2 Q3'], 14.5); assert.strictEqual(q['Etape 2 Q4'], 2.5);
    console.log('proposition : OK (Aurythia incluse)');
  }).catch(e => { console.error(e); process.exit(1); });
} else console.log('proposition : OK');
