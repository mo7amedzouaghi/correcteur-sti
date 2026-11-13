// Tests unitaires des tolérances ajoutées : fichiers/fonctions/id-class renommés ou mal orthographiés,
// champ retrouvé par son libellé, variable globale retrouvée autrement, arrondi au 0,25 supérieur.
const assert = require('assert');
const { evaluerRegle, evaluerCritere, fichiersCorrespondants } = require('../src/core/regles');

const ctx = { casse: true, souple: true, tolerantNomsFichiers: true, arrondiSuperieur: true, pas: 0.25 };

// 1) Fichier renommé / mal orthographié (typo) retrouvé par nom approché
{
  const c = { ...ctx, fichiers: [{ rel: 'suivie.html', texte: '<p id="resultat"></p>' }] };
  const f = fichiersCorrespondants(c, 'suivi.html');
  assert.strictEqual(f.length, 1, 'suivie.html retrouvé pour suivi.html');
}
// 2) Fichier totalement renommé, seul représentant de son extension dans la copie
{
  const c = { ...ctx, fichiers: [{ rel: 'code.js', texte: 'function autonomie(){}' }, { rel: 'index.html', texte: '' }] };
  const f = fichiersCorrespondants(c, 'script.js');
  assert.strictEqual(f.length, 1, 'code.js retrouvé comme unique .js pour script.js');
}
// 3) Désactivable (tolerantNomsFichiers: false) : aucun repli
{
  const c = { ...ctx, tolerantNomsFichiers: false, fichiers: [{ rel: 'code.js', texte: '' }] };
  assert.strictEqual(fichiersCorrespondants(c, 'script.js').length, 0, 'tolérance désactivée : pas de repli');
}
// 4) Fonction mal orthographiée
{
  const c = { ...ctx, fichiers: [{ rel: 'script.js', texte: 'function genereDefi(){ document.getElementById("defi").innerHTML = "Haut Bas"; }' }] };
  const r = evaluerRegle({ type: 'js', fichier: 'script.js', fonction: 'genererDefi' }, c);
  assert.ok(r.ok, 'genererDefi trouvée sous le nom approché genereDefi : ' + r.info);
}
// 5) id CSS mal orthographié
{
  const c = { ...ctx, fichiers: [{ rel: 'style.css', texte: '#defis{color:#EEB902;}' }] };
  const r = evaluerRegle({ type: 'css', fichier: 'style.css', propriete: 'color', selecteurs: ['#defi'] }, c);
  assert.ok(r.ok, 'déclaration sur #defis acceptée pour la cible #defi : ' + r.info);
}
// 6) champ de formulaire retrouvé par son libellé (id différent)
{
  const html = '<table><tr><td>Nom du pilote :</td><td><input id="nomPilote"></td></tr></table>';
  const c = { ...ctx, fichiers: [{ rel: 'suivi.html', texte: html }] };
  const r = evaluerRegle({ type: 'html', fichier: 'suivi.html', selecteur: '#pilote', libelle: 'nom.*pilote' }, c);
  assert.ok(r.ok, 'champ #nomPilote retrouvé via le libellé « Nom du pilote » : ' + r.info);
}
// 7) variable globale : déclarée, affectée implicitement, ou conservée via le DOM — les trois acceptées
{
  const decl = { ...ctx, fichiers: [{ rel: 'script.js', texte: 'let code = "";' }] };
  assert.ok(evaluerRegle({ type: 'variable', fichier: 'script.js', nom: 'code' }, decl).ok, 'déclaration explicite');
  const implicite = { ...ctx, fichiers: [{ rel: 'script.js', texte: 'function valider(){ code = ""; }' }] };
  assert.ok(evaluerRegle({ type: 'variable', fichier: 'script.js', nom: 'code' }, implicite).ok, 'affectation implicite');
  const dom = { ...ctx, fichiers: [{ rel: 'script.js', texte: 'function f(){ return document.getElementById("code").value; }' }] };
  assert.ok(evaluerRegle({ type: 'variable', fichier: 'script.js', nom: 'code' }, dom).ok, 'conservée via le DOM');
  const absente = { ...ctx, fichiers: [{ rel: 'script.js', texte: 'function f(){ return 1; }' }] };
  assert.ok(!evaluerRegle({ type: 'variable', fichier: 'script.js', nom: 'code' }, absente).ok, 'absente : non accordée');
}
// 8) arrondi toujours au 0,25 supérieur (jamais au défavorable de l'élève)
{
  const crit = { points: 1.5, regles: [{ type: 'regex', pts: 1, fichier: 'a.js', motif: 'x' }, { type: 'regex', pts: 1, fichier: 'a.js', motif: 'y' }, { type: 'regex', pts: 1, fichier: 'a.js', motif: 'z' }] };
  const c = { ...ctx, fichiers: [{ rel: 'a.js', texte: 'x y' }] }; // 2/3 des règles -> 1.5 * 2/3 = 1.0 (déjà un multiple de 0.25)
  const crit2 = { points: 1, regles: [{ type: 'regex', pts: 1, fichier: 'a.js', motif: 'x' }, { type: 'regex', pts: 1, fichier: 'a.js', motif: 'y' }, { type: 'regex', pts: 1, fichier: 'a.js', motif: 'z' }] };
  const r2 = evaluerCritere(crit2, c); // 2/3 * 1 = 0.667 -> supérieur 0.75 (vs 0.75 au plus proche aussi ici)
  assert.strictEqual(r2.points, 0.75, 'arrondi supérieur de 0,667 -> 0,75 : ' + r2.points);
  const crit3 = { points: 1, regles: [{ type: 'regex', pts: 1, fichier: 'a.js', motif: 'x' }, { type: 'regex', pts: 1, fichier: 'a.js', motif: 'w' }] };
  const r3 = evaluerCritere(crit3, c); // 1/2 * 1 = 0.5 pile -> reste 0.5 (déjà un multiple de 0.25)
  assert.strictEqual(r3.points, 0.5, 'valeur déjà multiple de 0,25 inchangée : ' + r3.points);
  const critBas = { points: 1, regles: [{ type: 'regex', pts: 1, fichier: 'a.js', motif: 'x' }, { type: 'regex', pts: 1, fichier: 'a.js', motif: 'w' }, { type: 'regex', pts: 1, fichier: 'a.js', motif: 'v' }, { type: 'regex', pts: 1, fichier: 'a.js', motif: 'u' }, { type: 'regex', pts: 1, fichier: 'a.js', motif: 't' }, { type: 'regex', pts: 1, fichier: 'a.js', motif: 's' }] };
  const rBas = evaluerCritere(critBas, c); // 1/6 * 1 = 0.1667 -> arrondi supérieur 0.25, arrondi au + proche aurait donné 0.25 aussi
  assert.strictEqual(rBas.points, 0.25, 'arrondi supérieur de 0,167 -> 0,25 : ' + rBas.points);
  const critSansSuperieur = { ...c, arrondiSuperieur: false };
  const rNormal = evaluerCritere(critBas, critSansSuperieur); // au plus proche : 0.1667 -> 0.25 aussi (test de non-régression du mode classique)
  assert.strictEqual(rNormal.points, 0.25, 'mode classique toujours disponible (arrondiSuperieur:false) : ' + rNormal.points);
}

console.log('tests/tolerance-noms-approches.js : OK (8 vérifications)');
