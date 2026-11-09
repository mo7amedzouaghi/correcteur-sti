'use strict';
// Grille collective : remplit le gabarit Excel importé (format officiel) ou en crée une nouvelle.
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const BORD = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
const ENTETE = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDE5F0' } };
const ADAPTE = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };

function libelleEleve(e) { return [e.nom, e.prenom].filter(Boolean).join(' '); }

function feuilleRecap(wb, projet, eleves, resultats) {
  const g = projet.grille;
  const ws = wb.addWorksheet('Récapitulatif', { views: [{ state: 'frozen', xSplit: 4, ySplit: 2 }] });
  const tete = ['N° candidat', 'Nom & prénom', 'Difficulté', 'Mode', ...g.criteres.map(c => c.id), `Total /${g.total}`, `Note /${g.noteSur}`, 'Validé', 'Appréciation'];
  ws.addRow([projet.titre || g.titre]).font = { bold: true, size: 13 };
  const h = ws.addRow(tete);
  h.eachCell(c => { c.font = { bold: true }; c.fill = ENTETE; c.border = BORD; c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; });
  const bareme = ws.addRow(['Barème', '', '', '', ...g.criteres.map(c => c.points), g.total, g.noteSur]);
  bareme.eachCell(c => { c.font = { italic: true }; c.border = BORD; });
  for (const e of eleves) {
    const r = resultats[e.id];
    const row = ws.addRow([e.numero, libelleEleve(e), e.difficulte ? 'Oui' : '', r ? r.mode : 'non corrigé',
      ...g.criteres.map(c => r?.criteres[c.id]?.points ?? null), r?.total ?? null, r?.note ?? null, r?.valide ? 'Oui' : '', r?.appreciation || '']);
    row.eachCell(c => { c.border = BORD; });
    if (e.difficulte) row.getCell(3).fill = ADAPTE;
  }
  // statistiques
  const notes = eleves.map(e => resultats[e.id]?.note).filter(n => n != null);
  if (notes.length) {
    ws.addRow([]);
    const moy = notes.reduce((a, b) => a + b, 0) / notes.length;
    [['Moyenne', moy], ['Note max', Math.max(...notes)], ['Note min', Math.min(...notes)], ['≥ 10', notes.filter(n => n >= g.noteSur / 2).length + ' / ' + notes.length]]
      .forEach(([k, v]) => { const r = ws.addRow([k, typeof v === 'number' ? Math.round(v * 100) / 100 : v]); r.getCell(1).font = { bold: true }; });
  }
  ws.getColumn(1).width = 14; ws.getColumn(2).width = 26; ws.getColumn(4).width = 10;
  ws.getColumn(tete.length).width = 60;
}

/** Remplit le gabarit officiel (copie) ; renvoie le chemin du fichier produit. */
async function exporterExcel(projet, dossierProjet, eleves, resultats, fichierSortie) {
  const g = projet.grille;
  const wb = new ExcelJS.Workbook();
  const gab = g.gabaritFichier && path.join(dossierProjet, g.gabaritFichier);
  let horsGabarit = [];
  if (gab && fs.existsSync(gab) && g.gabaritExcel) {
    await wb.xlsx.readFile(gab);
    const ws = wb.worksheets[0];
    const { premiereLigne, colLabel, colTotal, colNote } = g.gabaritExcel;
    // capacité : jusqu'à la ligne « signature des évaluateurs » (ou une ligne vide fusionnée)
    let fin = premiereLigne;
    while (fin < premiereLigne + 500) {
      const t = ws.getRow(fin).values.join(' ');
      if (/signature|[ée]valuateur/i.test(t)) break;
      const a = ws.getCell(fin, 1);
      if (fin > premiereLigne && a.isMerged && a.master.address === a.address && ws.getCell(fin, 3).isMerged) break;
      fin++;
    }
    const capacite = Math.max(0, fin - premiereLigne);
    const colAdapte = ws.getColumn(colNote || colTotal || 'AY').number + 1;
    if (eleves.some(e => e.difficulte) && projet.tolerance?.difficulte?.mentionGrille !== false) {
      const hc = ws.getCell(g.gabaritExcel.ligneDetail, colAdapte);
      hc.value = 'Correction adaptée'; hc.font = { bold: true, size: 8 }; hc.border = BORD; hc.alignment = { wrapText: true, textRotation: 90 };
    }
    eleves.forEach((e, i) => {
      if (i >= capacite) { horsGabarit.push(e); return; }
      const r = resultats[e.id];
      const row = ws.getRow(premiereLigne + i);
      row.getCell(colLabel).value = isNaN(+e.numero) ? e.numero : +e.numero;
      for (const c of g.criteres) {
        const p = r?.criteres[c.id]?.points;
        row.getCell(c.colonne).value = p == null ? null : p;
      }
      if (colTotal && !row.getCell(colTotal).formula) row.getCell(colTotal).value = r?.total ?? null;
      if (colNote && !row.getCell(colNote).formula) row.getCell(colNote).value = r?.note ?? null;
      if (e.difficulte && projet.tolerance?.difficulte?.mentionGrille !== false) {
        const c = row.getCell(colAdapte); c.value = '✓'; c.fill = ADAPTE; c.border = BORD; c.alignment = { horizontal: 'center' };
      }
      row.commit();
    });
    // établissement / date si vides dans le gabarit
    if (projet.etablissement) ws.eachRow((row) => row.eachCell(c => {
      if (typeof c.value === 'string' && /^[ée]tablissement\s*:\s*$/i.test(c.value.trim())) c.value = 'Etablissement : ' + projet.etablissement;
    }));
  } else {
    construireGrille(wb, projet, eleves, resultats);
  }
  feuilleRecap(wb, projet, eleves, resultats);
  wb.calcProperties.fullCalcOnLoad = true;
  fs.mkdirSync(path.dirname(fichierSortie), { recursive: true });
  await wb.xlsx.writeFile(fichierSortie);
  return { fichier: fichierSortie, horsGabarit: horsGabarit.map(e => e.numero) };
}

/** Grille collective au format officiel, sans gabarit. */
function construireGrille(wb, projet, eleves, resultats) {
  const g = projet.grille;
  const ws = wb.addWorksheet('Grille collective');
  const n = g.criteres.length;
  const c0 = 3; // A = libellé vertical, B = N° candidat
  const cTot = c0 + n, cNote = cTot + 1;
  ws.mergeCells(1, 1, 1, cNote); ws.getCell(1, 1).value = 'Grille d\'évaluation';
  ws.getCell(1, 1).font = { bold: true, size: 14 }; ws.getCell(1, 1).alignment = { horizontal: 'center' };
  ws.mergeCells(2, 1, 2, cNote); ws.getCell(2, 1).value = projet.titre || g.titre;
  ws.getCell(2, 1).alignment = { horizontal: 'center' };
  ws.getCell(3, 1).value = `Etablissement : ${projet.etablissement || ''}    Section : ${projet.section || ''}    Matière : ${projet.matiere || 'S.T.I'}    Date : ${projet.date || ''}`;
  const L = { etape: 5, q: 6, sq: 7, det: 8 };
  ws.getCell(L.etape, 1).value = 'Barème'; ws.getCell(L.etape, 2).value = 'Partie';
  ws.getCell(L.q, 2).value = 'Question'; ws.getCell(L.det, 2).value = 'Détail';
  ws.mergeCells(L.etape, 1, L.det, 1);
  // fusion des en-têtes identiques consécutifs
  const fusion = (ligne, cle, texte) => {
    let debut = 0;
    for (let i = 1; i <= n; i++) {
      if (i === n || cle(g.criteres[i]) !== cle(g.criteres[debut])) {
        const a = c0 + debut, b = c0 + i - 1;
        if (b > a) ws.mergeCells(ligne, a, ligne, b);
        ws.getCell(ligne, a).value = texte(g.criteres[debut], debut, i - 1);
        debut = i;
      }
    }
  };
  const somme = (d, f) => g.criteres.slice(d, f + 1).reduce((a, c) => a + c.points, 0);
  fusion(L.etape, c => c.etape, (c, d, f) => `${c.etape} (${somme(d, f)} points)`);
  fusion(L.q, c => c.etape + c.question, c => c.question);
  fusion(L.sq, c => c.etape + c.question + c.sousQuestion, (c, d, f) => c.sousQuestion ? `${c.sousQuestion} (${somme(d, f)} pts)` : '');
  g.criteres.forEach((c, i) => { ws.getCell(L.det, c0 + i).value = c.points; c.colonneCollective = ws.getColumn(c0 + i).letter; });
  ws.mergeCells(L.etape, cTot, L.det, cTot); ws.getCell(L.etape, cTot).value = `Total /${g.total}`;
  ws.mergeCells(L.etape, cNote, L.det, cNote); ws.getCell(L.etape, cNote).value = `Note /${g.noteSur}`;
  ws.getCell(L.det + 1, 1).value = 'N° candidat';
  const lt = ws.getColumn(cTot).letter, l0 = ws.getColumn(c0).letter, lf = ws.getColumn(cTot - 1).letter;
  eleves.forEach((e, i) => {
    const r = resultats[e.id];
    const row = L.det + 1 + i;
    ws.getCell(row, 2).value = isNaN(+e.numero) ? e.numero : +e.numero;
    g.criteres.forEach((c, j) => { ws.getCell(row, c0 + j).value = r?.criteres[c.id]?.points ?? null; });
    ws.getCell(row, cTot).value = { formula: `SUM(${l0}${row}:${lf}${row})`, result: r?.total };
    ws.getCell(row, cNote).value = { formula: `ROUND(${lt}${row}*${g.noteSur}/${g.total},2)`, result: r?.note };
    if (e.difficulte) { ws.getCell(row, cNote + 1).value = 'adaptée'; ws.getCell(row, cNote + 1).fill = ADAPTE; }
  });
  const derniere = L.det + Math.max(1, eleves.length);
  if (eleves.length > 1) ws.mergeCells(L.det + 1, 1, derniere, 1);
  for (let r = L.etape; r <= derniere; r++) for (let c = 1; c <= cNote; c++) {
    const x = ws.getCell(r, c); x.border = BORD; x.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    if (r <= L.det) { x.fill = ENTETE; x.font = { bold: true, size: 9 }; }
  }
  ws.getColumn(1).width = 6; ws.getColumn(2).width = 12;
  for (let c = c0; c < cTot; c++) ws.getColumn(c).width = 5.5;
  ws.getCell(derniere + 2, 1).value = 'Nom(s) & prénom(s) et signature(s) des évaluateur(s) :';
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
}

module.exports = { exporterExcel };
