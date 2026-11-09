'use strict';
// Grille détaillée individuelle au format Word (.docx).
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType,
  AlignmentType, ShadingType, BorderStyle, HeadingLevel, PageOrientation
} = require('docx');

const BLEU = '1F3864', GRIS = 'E7ECF4', VERT = 'E2F0D9', ORANGE = 'FCE4D6';
const fmt = n => (n == null ? '—' : String(Math.round(n * 100) / 100).replace('.', ','));

function cell(text, o = {}) {
  return new TableCell({
    width: o.width ? { size: o.width, type: WidthType.PERCENTAGE } : undefined,
    columnSpan: o.span,
    shading: o.fill ? { type: ShadingType.CLEAR, fill: o.fill, color: 'auto' } : undefined,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    children: [].concat(text).map(t => new Paragraph({
      alignment: o.align || AlignmentType.LEFT,
      children: [new TextRun({ text: String(t ?? ''), bold: o.bold, size: o.size || 18, color: o.color, italics: o.italic })]
    }))
  });
}

function para(text, o = {}) {
  return new Paragraph({
    alignment: o.align, heading: o.heading, spacing: { before: o.before ?? 60, after: o.after ?? 60 },
    children: [new TextRun({ text, bold: o.bold, size: o.size || 20, color: o.color, italics: o.italic })]
  });
}
function liste(items) {
  return (items || []).filter(Boolean).map(t => new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: t, size: 20 })] }));
}

function genererDocx(projet, eleve, res) {
  const g = projet.grille;
  const tol = projet.tolerance || {};
  const adapte = eleve.difficulte && tol.difficulte?.mentionGrille !== false;
  const nomComplet = [eleve.nom, eleve.prenom].filter(Boolean).join(' ') || '……………………………';

  const enTete = [
    para('République Tunisienne — Ministère de l\'Éducation', { size: 16, color: '666666', after: 0 }),
    para(`Établissement : ${projet.etablissement || '……………………………'}`, { size: 18, after: 0 }),
    para('Grille d\'évaluation détaillée', { heading: HeadingLevel.HEADING_1, align: AlignmentType.CENTER, bold: true, size: 32, color: BLEU, before: 160 }),
    para(projet.titre || g.titre || '', { align: AlignmentType.CENTER, bold: true, size: 22 }),
    para(`Niveau : ${projet.niveau || ''}   •   Section : ${projet.section || ''}   •   Matière : ${projet.matiere || 'S.T.I'}   •   Épreuve : ${projet.type === 'theorique' ? 'théorique' : 'pratique'}   •   Date : ${projet.date || ''}`, { align: AlignmentType.CENTER, size: 18 })
  ];

  const infoEleve = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({ children: [
      cell('N° candidat', { bold: true, fill: GRIS, width: 15 }), cell(eleve.numero, { width: 20 }),
      cell('Nom & prénom', { bold: true, fill: GRIS, width: 17 }), cell(nomComplet, { width: 48 })
    ] })]
  });

  // tableau détaillé, regroupé par étape puis question
  const lignes = [new TableRow({ tableHeader: true, children: [
    cell('Question', { bold: true, fill: BLEU, color: 'FFFFFF', width: 12 }),
    cell('Critère évalué', { bold: true, fill: BLEU, color: 'FFFFFF', width: 38 }),
    cell('Barème', { bold: true, fill: BLEU, color: 'FFFFFF', width: 9, align: AlignmentType.CENTER }),
    cell('Note', { bold: true, fill: BLEU, color: 'FFFFFF', width: 9, align: AlignmentType.CENTER }),
    cell('Observation', { bold: true, fill: BLEU, color: 'FFFFFF', width: 32 })
  ] })];
  const etapes = [...new Set(g.criteres.map(c => c.etape))];
  for (const et of etapes) {
    const cs = g.criteres.filter(c => c.etape === et);
    const max = cs.reduce((a, c) => a + c.points, 0);
    const obt = cs.reduce((a, c) => a + (res.criteres[c.id]?.points || 0), 0);
    lignes.push(new TableRow({ children: [
      cell(et, { bold: true, fill: GRIS, span: 2 }), cell(fmt(max), { bold: true, fill: GRIS, align: AlignmentType.CENTER }),
      cell(fmt(obt), { bold: true, fill: GRIS, align: AlignmentType.CENTER }), cell('', { fill: GRIS })] }));
    for (const c of cs) {
      const r = res.criteres[c.id] || {};
      const q = `Q${c.question}${c.sousQuestion ? '-' + c.sousQuestion : ''}`;
      const plein = r.points != null && r.points >= c.points;
      const nul = !r.points;
      lignes.push(new TableRow({ children: [
        cell(q, { align: AlignmentType.CENTER }),
        cell(c.libelle),
        cell(fmt(c.points), { align: AlignmentType.CENTER }),
        cell(r.points == null ? 'à saisir' : fmt(r.points), { align: AlignmentType.CENTER, bold: true, fill: plein ? VERT : nul ? ORANGE : undefined }),
        cell(r.commentaire || '', { size: 16 })
      ] }));
    }
  }
  lignes.push(new TableRow({ children: [
    cell(`Total / ${g.total}`, { bold: true, fill: BLEU, color: 'FFFFFF', span: 2, align: AlignmentType.RIGHT }),
    cell(fmt(g.total), { bold: true, fill: BLEU, color: 'FFFFFF', align: AlignmentType.CENTER }),
    cell(fmt(res.total), { bold: true, fill: BLEU, color: 'FFFFFF', align: AlignmentType.CENTER }),
    cell(`Note : ${fmt(res.note)} / ${g.noteSur}`, { bold: true, fill: BLEU, color: 'FFFFFF', size: 22 })
  ] }));
  const tableau = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: lignes });

  const corps = [...enTete, para(''), infoEleve];
  if (adapte) corps.push(para('Correction adaptée : élève présentant des difficultés d\'apprentissage (tolérance appliquée selon les réglages de l\'enseignant).', { italic: true, color: 'B45F06', size: 18 }));
  corps.push(para(''), tableau);
  corps.push(para('Appréciation', { bold: true, color: BLEU, size: 24, before: 200 }), para(res.appreciation || ''));
  if (res.pointsForts?.length) corps.push(para('Points forts', { bold: true, color: BLEU }), ...liste(res.pointsForts));
  if (res.aAmeliorer?.length) corps.push(para('À améliorer', { bold: true, color: BLEU }), ...liste(res.aAmeliorer));
  if (res.conseils?.length) corps.push(para(eleve.difficulte ? 'Conseils de remédiation' : 'Conseils', { bold: true, color: BLEU }), ...liste(res.conseils));
  const pens = (res.erreurs || []).filter(e => e.penalite > 0);
  if (pens.length) corps.push(para('Pénalités appliquées', { bold: true, color: BLEU }), ...liste(pens.map(e => `${e.critere ? '[' + e.critere + '] ' : ''}${e.description} (−${fmt(e.penalite)})`)));
  corps.push(para(`Correction automatique (règles)${res.valide ? ', validée par l\'enseignant' : ''}.`, { italic: true, size: 16, color: '666666', before: 200 }));
  corps.push(para('Généré avec Correcteur STI — Mohamed Zouaghi', { italic: true, size: 14, color: '999999', before: 0 }));
  corps.push(para(`Nom et signature de l'évaluateur : ${projet.enseignant || '……………………………………'}`, { before: 200 }));

  return new Document({
    creator: 'Correcteur STI — Mohamed Zouaghi', title: `Grille ${eleve.numero}`,
    styles: { default: { document: { run: { font: 'Calibri' } } } },
    sections: [{ properties: { page: { margin: { top: 700, bottom: 700, left: 700, right: 700 } } }, children: corps }]
  });
}

async function exporterWord(projet, eleve, res, dossierSortie) {
  fs.mkdirSync(dossierSortie, { recursive: true });
  const nom = `Grille_${eleve.numero}${eleve.nom ? '_' + eleve.nom.replace(/[^\w-]+/g, '_') : ''}.docx`;
  const f = path.join(dossierSortie, nom);
  fs.writeFileSync(f, await Packer.toBuffer(genererDocx(projet, eleve, res)));
  return f;
}

module.exports = { exporterWord, genererDocx };
