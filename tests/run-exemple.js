// Test de bout en bout (sans interface) : grille Excel + modèle Aurythia, 2 élèves, correction auto, exports.
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
require('./creer-fixtures');
const P = require('../src/core/projet');
const { importerTravaux } = require('../src/core/eleves');
const { corrigerEleve } = require('../src/core/correction');
const { exporterWord } = require('../src/core/export-word');
const { exporterExcel } = require('../src/core/export-excel');

(async () => {
  const fx = path.join(__dirname, 'fixtures');
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'correcteur-sti-'));
  const projet = P.nouveauProjet({ titre: 'Bac STI 2026 – Séance 1 (Aurythia)', niveau: 'Bac', type: 'pratique' });
  projet.etablissement = 'Établissement test'; projet.enseignant = 'Mohamed Zouaghi';
  // Le sujet officiel et la grille Excel ne sont pas versionnés : déposez-les dans tests/fixtures/ pour le test complet.
  const modele = path.join(__dirname, '..', 'modeles', 'aurythia-bac-2026.json');
  if (fs.existsSync(path.join(fx, 'enonce.pdf'))) {
    await P.deposerEnonce(dossier, projet, path.join(fx, 'enonce.pdf'));
    assert(projet.enonce.texte.includes('Aurythia'), 'texte de l\'énoncé extrait');
  }
  const excel = path.join(fx, 'GrilleEvaluationExcel_S1.xlsx');
  const { verification } = fs.existsSync(excel)
    ? await P.importerGrille(dossier, projet, excel, modele)
    : await P.importerGrille(dossier, projet, modele);
  console.log('Grille :', projet.grille.criteres.length, 'critères, somme', verification.somme, verification.problemes);
  assert.strictEqual(projet.grille.criteres.length, 47);
  assert.strictEqual(verification.problemes.length, 0);
  assert(projet.grille.criteres.every(c => c.regles.length), 'toutes les colonnes ont des règles');

  projet.eleves = importerTravaux(path.join(fx, 'eleves'), dossier);
  projet.eleves[1].difficulte = true;
  for (const e of projet.eleves) {
    const r = await corrigerEleve(projet, dossier, e, { mode: 'auto' });
    projet.resultats[e.id] = r;
    console.log(`\n== ${e.numero}${e.difficulte ? ' (difficulté)' : ''} : ${r.total}/40 -> ${r.note}/20`);
    for (const c of projet.grille.criteres) {
      const x = r.criteres[c.id];
      if (x.points < c.points) console.log(`  ${c.id.padEnd(2)} ${String(x.points).padStart(4)}/${c.points}  ${x.commentaire}`);
    }
    if (r.erreurs.length) console.log('  erreurs :', r.erreurs.map(x => x.description).join(' | '));
    await exporterWord(projet, e, r, path.join(dossier, 'sorties'));
  }
  const x = await exporterExcel(projet, dossier, projet.eleves, projet.resultats, path.join(dossier, 'sorties', 'Grille_collective.xlsx'));
  P.sauver(dossier, projet);
  assert.strictEqual(projet.resultats.SW100001.total, 40, 'le travail complet obtient 40/40');
  const r3 = projet.resultats.SW100003;
  assert.strictEqual(r3.erreurs.filter(e => e.penalite > 0).length, 1, 'A6 : une seule sanction pour le type « unité CSS manquante »');
  assert.strictEqual(r3.total, 39.75, 'A5 casse, A7 messages, A11 margin acceptés ; A6 −0,25 une fois');
  const r4 = projet.resultats.SW100004;
  assert.strictEqual(r4.total, 40, 'A11 : sélecteurs combinés (header h1) et margin / margin-left acceptés sans pénalité');
  const r5 = projet.resultats.SW100005;
  assert.strictEqual(r5.erreurs.filter(e => e.penalite > 0 && /hors du dossier/.test(e.description)).length, 1, 'A10 : une sanction pour fichier hors du dossier de travail');
  assert.strictEqual(r5.total, 39.75, 'A10 : −0,25 une seule fois');
  // B4 : élève en difficulté, liens présents mais sans cible iframe => moitié des points du critère, pas zéro
  const r2 = projet.resultats.SW100002;
  assert(r2.criteres.I.points > 0.5, 'B4 : points partiels pour les liens sans cible iframe (élève en difficulté)');
  // la grille collective contient bien les 5 élèves
  assert.deepStrictEqual(x.horsGabarit, [], 'tous les élèves tiennent dans le gabarit Excel');
  console.log('\nSorties :', fs.readdirSync(path.join(dossier, 'sorties')), '\nDossier :', dossier, x.horsGabarit);
})().catch(e => { console.error(e); process.exit(1); });
