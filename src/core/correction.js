'use strict';
// Orchestration de la correction d'un élève : règles automatiques -> résultat notable/éditable.
const { evaluerCritere, detecterErreurs, fichiersAttendus, racineCommune, arrondir, fichiersCorrespondants } = require('./regles');
const { lireTravail } = require('./eleves');

const TOLERANCE_DEFAUT = {
  penaliteParErreur: 0.25,
  penaliteUnique: true,        // A2 : une erreur répétée n'est sanctionnée qu'une fois
  penaliteParType: true,       // A6 : une seule sanction par type d'erreur sur toute la copie
  casseToleree: true,          // A5 : majuscules/minuscules tolérées (HTML, CSS, JS, PHP)
  variantesSouples: true,      // A7 / A11 : message reformulé accepté, mise en page par margin acceptée
  solutionsEquivalentes: true,
  fichierHorsDossier: true,    // A10 : fichier rangé dans un sous-dossier = −0,25, une seule fois
  nomsApproches: true,         // fichiers, fonctions, id/class renommés ou mal orthographiés recherchés et acceptés
  arrondiSuperieur: true,      // tolérance maximale : chaque critère arrondi au 0,25 supérieur, jamais au défavorable
  arrondi: 0.25,
  difficulte: {
    ignorerErreursMineures: true,
    pointsPartielsElargis: true,
    commentairesSimplifies: true,
    plafondPenalites: 1,         // B3 : au plus 1 point de pénalité sur toute la copie
    mentionGrille: true
  }
};

const REMEDIATION = [
  [/sql|base|table|cl[ée]|relation|export|import/i, 'Base de données : refaire les manipulations phpMyAdmin (clés primaires, relations, export) avec la fiche méthode du guide STI.'],
  [/css|police|couleur|marge|bordure|ombre|puce|gras|italique|gauche|droite/i, 'CSS : revoir les propriétés (font, color, padding, border, float/flex, list-style) et vérifier que le sélecteur cible bien l\'élément demandé.'],
  [/valide|fonction|js|identifiant|prix|commentaire|finition|originalit|expert|m[ée]tal/i, 'JavaScript : s\'entraîner aux fonctions de contrôle (parcours de chaîne, tests de caractères, return false).'],
  [/php|insert|select|connexion|r[ée]cup[ée]ration|message|liste/i, 'PHP/MySQL : revoir la séquence connexion → requête → exécution → test du résultat → affichage.'],
  [/html|header|nav|lien|main|section|aside|footer|iframe|formulaire|fieldset|bouton|liste d[ée]roulante|required/i, 'HTML : revoir la structure sémantique (header, nav, main, section, aside, footer) et les attributs des formulaires.']
];

function arrondi2(x) { return Math.round(x * 100 + 1e-9) / 100; }

function totaliser(res, grille) {
  let total = 0, aSaisir = 0;
  for (const c of grille.criteres) {
    const r = res.criteres[c.id];
    if (!r || r.points == null) { aSaisir++; continue; }
    total += r.points;
  }
  res.total = arrondi2(total);
  res.note = arrondi2(total * grille.noteSur / grille.total);
  res.aSaisir = aSaisir;
  return res;
}

function appreciationAuto(note, sur, difficulte) {
  const p = note / sur;
  if (difficulte) {
    if (p >= 0.75) return 'Très bon travail, bravo ! Continue ainsi.';
    if (p >= 0.5) return 'Travail encourageant : tu as acquis l\'essentiel. Continue tes efforts sur les points signalés.';
    if (p >= 0.3) return 'Des progrès sont visibles. Reprends les exercices conseillés, pas à pas.';
    return 'Ne te décourage pas : reprenons ensemble les bases avec les conseils ci-dessous.';
  }
  if (p >= 0.85) return 'Excellent travail, maîtrise solide de l\'ensemble des compétences.';
  if (p >= 0.7) return 'Bon travail, quelques imprécisions à corriger.';
  if (p >= 0.5) return 'Travail moyen : les bases sont présentes mais plusieurs parties sont incomplètes.';
  if (p >= 0.3) return 'Travail insuffisant : de nombreuses notions restent à consolider.';
  return 'Travail très insuffisant : un travail de remédiation est nécessaire.';
}

function syntheseAuto(res, grille, difficulte) {
  const parQuestion = {};
  for (const c of grille.criteres) {
    const k = `${c.etape} Q${c.question}${c.sousQuestion ? '-' + c.sousQuestion : ''}`;
    const r = res.criteres[c.id];
    const q = parQuestion[k] || (parQuestion[k] = { obt: 0, max: 0, libelles: [] });
    q.max += c.points; q.obt += r?.points || 0; q.libelles.push(c.libelle);
  }
  const qs = Object.entries(parQuestion).map(([k, v]) => ({ k, ratio: v.max ? v.obt / v.max : 0, txt: v.libelles.join(' ') }));
  res.pointsForts = qs.filter(q => q.ratio >= 0.85).map(q => q.k + ' réussie');
  res.aAmeliorer = qs.filter(q => q.ratio < 0.5).map(q => q.k + ` (${Math.round(q.ratio * 100)} %)`);
  const conseils = new Set();
  for (const q of qs.filter(x => x.ratio < 0.5)) for (const [rx, conseil] of REMEDIATION) if (rx.test(q.txt)) { conseils.add(conseil); break; }
  res.conseils = [...conseils];
  if (difficulte && !res.conseils.length) res.conseils.push('Relire l\'énoncé question par question et cocher chaque consigne réalisée.');
  res.appreciation = appreciationAuto(res.note, grille.noteSur, difficulte);
}

function commentaireRegles(r, simplifie) {
  if (r.manuel) return '';
  const manque = r.details.filter(d => !d.ok).map(d => d.label);
  if (!manque.length) return simplifie ? 'Bien !' : 'Conforme.';
  return (simplifie ? 'À revoir : ' : 'Manque / incorrect : ') + manque.join(', ') + '.';
}

/**
 * Correction par règles automatiques ; les critères sans règle sont à noter par l'enseignant.
 */
async function corrigerEleve(projet, dossierProjet, eleve, opts = {}) {
  const mode = opts.mode || 'auto';
  const grille = projet.grille;
  const tol = { ...TOLERANCE_DEFAUT, ...(projet.tolerance || {}), difficulte: { ...TOLERANCE_DEFAUT.difficulte, ...(projet.tolerance?.difficulte || {}) } };
  const travail = lireTravail(dossierProjet, eleve);
  const ctx = {
    fichiers: travail.fichiers.filter(f => f.texte != null),
    tolerant: !!(eleve.difficulte && tol.difficulte.ignorerErreursMineures),
    partielsElargis: !!(eleve.difficulte && tol.difficulte.pointsPartielsElargis),
    pas: tol.arrondi || 0.25,
    casse: tol.casseToleree !== false,
    souple: tol.variantesSouples !== false,
    tolerantNomsFichiers: tol.nomsApproches !== false,
    arrondiSuperieur: tol.arrondiSuperieur !== false
  };
  const simplifie = !!(eleve.difficulte && tol.difficulte.commentairesSimplifies);

  const res = {
    eleveId: eleve.id, mode, date: new Date().toISOString(), difficulte: !!eleve.difficulte,
    criteres: {}, erreurs: [], avertissements: [...travail.avertissements], valide: false
  };
  const regles = {};
  for (const c of grille.criteres) {
    const r = evaluerCritere(c, ctx);
    regles[c.id] = r;
    res.criteres[c.id] = {
      points: r.points, max: c.points, source: r.manuel ? 'manuel' : 'regles',
      details: r.details, commentaire: commentaireRegles(r, simplifie), justification: '', manuel: r.manuel
    };
  }
  if (!travail.fichiers.length) res.avertissements.push('Aucun fichier trouvé pour cet élève.');

  // pénalités automatiques (erreurs de syntaxe), sauf élève en difficulté avec tolérance des erreurs mineures
  const erreurs = detecterErreurs(ctx, {
    attendus: fichiersAttendus(grille.criteres),
    racine: racineCommune(travail.fichiers),
    fichierHorsDossier: tol.fichierHorsDossier
  });
  if (mode === 'auto' && tol.penaliteParErreur > 0 && !ctx.tolerant) {
    const dejaVu = new Set();
    // B3 : plafond des pénalités pour un élève en difficulté
    let reste = eleve.difficulte && tol.difficulte.plafondPenalites != null ? tol.difficulte.plafondPenalites : Infinity;
    for (const e of erreurs) {
      const cle = tol.penaliteParType ? e.type : e.type + '|' + e.fichier;
      if ((tol.penaliteParType || tol.penaliteUnique) && dejaVu.has(cle)) {
        res.erreurs.push({ critere: '', description: `${e.type} (${e.fichier}) : ${e.message} — même type, déjà sanctionné`, penalite: 0 });
        continue;
      }
      if (reste < tol.penaliteParErreur) { res.erreurs.push({ critere: '', description: `${e.type} (${e.fichier}) : ${e.message} — plafond atteint`, penalite: 0 }); continue; }
      dejaVu.add(cle);
      const nom = e.fichier.split('/').pop();
      const surFichier = c => (c.regles || []).some(r => r.fichier && fichiersCorrespondants({ fichiers: [{ rel: nom }] }, r.fichier).length);
      const surPropriete = c => e.prop && (JSON.stringify(c.regles || []).match(/"propriete":"([^"]+)"/g) || []).some(m => new RegExp('^(' + m.slice(13, -1) + ')$', 'i').test(e.prop));
      const crit = grille.criteres.find(c => res.criteres[c.id].points > 0 && surPropriete(c))
        || grille.criteres.find(c => res.criteres[c.id].points > 0 && surFichier(c));
      if (!crit) continue;
      reste -= tol.penaliteParErreur;
      const rc = res.criteres[crit.id];
      rc.points = Math.max(0, arrondir(rc.points - tol.penaliteParErreur, ctx.pas));
      rc.commentaire += ` Pénalité −${tol.penaliteParErreur} : ${e.type} dans ${e.fichier}.`;
      res.erreurs.push({ critere: crit.id, description: `${e.type} (${e.fichier}) : ${e.message}`, penalite: tol.penaliteParErreur });
    }
  } else {
    for (const e of erreurs) res.erreurs.push({ critere: '', description: `${e.type} (${e.fichier}) : ${e.message}`, penalite: 0 });
  }

  totaliser(res, grille);
  syntheseAuto(res, grille, eleve.difficulte);
  return res;
}

module.exports = { corrigerEleve, totaliser, syntheseAuto, TOLERANCE_DEFAUT, arrondi2 };
