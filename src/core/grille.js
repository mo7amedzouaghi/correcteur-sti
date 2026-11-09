'use strict';
// Grille de correction : import depuis l'Excel officiel, modèles JSON, création manuelle.
const fs = require('fs');
const ExcelJS = require('exceljs');

function valeur(c) {
  const v = c && c.value;
  if (v == null) return '';
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map(t => t.text).join('');
    if ('result' in v) return v.result;
    if (v.text) return v.text;
  }
  return v;
}
function texte(c) { return String(valeur(c)).replace(/\s+/g, ' ').trim(); }

// valeur affichée d'une cellule, y compris si elle fait partie d'une fusion
function valeurFusion(ws, row, col) {
  const c = ws.getCell(row, col);
  if (c.isMerged && c.master) return texte(c.master);
  return texte(c);
}

/**
 * Lit une grille Excel au format officiel STI :
 *  - une ligne contenant « Détail » (barème de chaque colonne),
 *  - au-dessus : Etape / Question / sous-question (cellules fusionnées),
 *  - en dessous : une ligne par candidat (N° candidat), colonnes Total et Note.
 */
async function importerGrilleExcel(fichier) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(fichier);
  const ws = wb.worksheets[0];
  let ligneDetail = 0, colLabel = 0;
  ws.eachRow((row, r) => {
    row.eachCell((c, col) => { if (!ligneDetail && /^d[ée]tail/i.test(texte(c))) { ligneDetail = r; colLabel = col; } });
  });
  if (!ligneDetail) throw new Error('Ligne « Détail » introuvable : ce fichier ne suit pas le format de grille officiel.');

  // repérer les colonnes Total / Note
  let colTotal = 0, colNote = 0, noteSur = 20, total = 0;
  for (let r = 1; r <= ligneDetail; r++) {
    ws.getRow(r).eachCell((c, col) => {
      const t = texte(c);
      let m;
      if (!colTotal && (m = /^total\s*\/\s*(\d+)/i.exec(t))) { colTotal = col; total = +m[1]; }
      if (!colNote && (m = /^note\s*\/\s*(\d+)/i.exec(t))) { colNote = col; noteSur = +m[1]; }
    });
  }
  const finCol = (colTotal || ws.columnCount + 1) - 1;
  const criteres = [];
  for (let col = colLabel + 1; col <= finCol; col++) {
    const pts = parseFloat(String(valeur(ws.getCell(ligneDetail, col))).replace(',', '.'));
    if (isNaN(pts)) continue;
    const entetes = [], maitres = [];
    for (let r = ligneDetail - 3; r < ligneDetail; r++) {
      if (r <= 0) { entetes.push(''); maitres.push(''); continue; }
      const c = ws.getCell(r, col);
      entetes.push(valeurFusion(ws, r, col));
      maitres.push(c.isMerged && c.master ? c.master.address : c.address);
    }
    const [etape, question] = entetes;
    // une cellule « question » fusionnée verticalement avec la ligne suivante n'a pas de sous-question
    const sous = maitres[2] === maitres[1] ? '' : entetes[2];
    const lettre = ws.getColumn(col).letter;
    criteres.push({
      id: lettre, colonne: lettre,
      etape: etape.replace(/\s*\(.*\)\s*$/, '') || 'Etape',
      question: String(question || ''),
      sousQuestion: String(sous || '').replace(/\s*\(.*\)\s*$/, ''),
      libelle: '', points: pts, regles: []
    });
  }
  // numéroter les critères d'une même sous-question
  const groupes = {};
  for (const c of criteres) {
    const k = [c.etape, c.question, c.sousQuestion].join('|');
    groupes[k] = (groupes[k] || 0) + 1;
    c.libelle = `${c.etape} – Q${c.question}${c.sousQuestion ? ' ' + c.sousQuestion : ''} – critère ${groupes[k]}`;
  }
  // ligne du premier candidat
  let premiereLigne = ligneDetail + 1;
  const entete = {};
  ws.eachRow((row, r) => {
    if (r > ligneDetail + 5) return;
    row.eachCell(c => {
      const t = texte(c);
      let m;
      if ((m = /^[ée]tablissement\s*:?\s*([^….]*)/i.exec(t)) && m[1].trim()) entete.etablissement = m[1].trim();
      if ((m = /mati[èe]re\s*:\s*(.+)/i.exec(t))) entete.matiere = m[1].trim();
      if ((m = /section\s*:\s*([^\s]+)/i.exec(t))) entete.section = m[1].trim();
      if ((m = /date\s*:\s*([\d/ ]+)/i.exec(t))) entete.date = m[1].replace(/\s/g, '');
      if (!entete.titre && r <= 2 && t && !/grille/i.test(t)) entete.titre = t;
    });
  });
  return {
    titre: entete.titre || 'Grille importée',
    entete,
    total: total || criteres.reduce((a, c) => a + c.points, 0),
    noteSur,
    criteres,
    gabaritExcel: { ligneDetail, colLabel, premiereLigne, colTotal: colTotal ? ws.getColumn(colTotal).letter : null, colNote: colNote ? ws.getColumn(colNote).letter : null }
  };
}

/** Fusionne une grille importée (barème) avec un modèle (libellés + règles) par lettre de colonne. */
function appliquerModele(grille, modele) {
  const parId = Object.fromEntries(modele.criteres.map(c => [c.colonne || c.id, c]));
  for (const c of grille.criteres) {
    const m = parId[c.colonne];
    if (!m) continue;
    c.libelle = m.libelle || c.libelle;
    c.regles = m.regles || [];
    if (m.consigne) c.consigne = m.consigne;
    if (Math.abs((m.points || c.points) - c.points) > 1e-6) c.avertissement = `Barème modèle ${m.points} ≠ Excel ${c.points}`;
  }
  return grille;
}

function verifierGrille(g) {
  const pb = [];
  const somme = g.criteres.reduce((a, c) => a + (+c.points || 0), 0);
  if (Math.abs(somme - g.total) > 1e-6) pb.push(`La somme des critères (${somme}) ≠ total (${g.total}).`);
  const ids = new Set();
  for (const c of g.criteres) { if (ids.has(c.id)) pb.push(`Identifiant en double : ${c.id}`); ids.add(c.id); }
  return { somme, problemes: pb };
}

function lireJson(f) { return JSON.parse(fs.readFileSync(f, 'utf8')); }

module.exports = { importerGrilleExcel, appliquerModele, verifierGrille, lireJson };
