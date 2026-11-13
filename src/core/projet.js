'use strict';
// Projet de correction = un dossier contenant projet.json + énoncé, grille, ressources, travaux, sorties.
const fs = require('fs');
const path = require('path');
const { texteDepuisFichier } = require('./extract');
const { importerGrilleExcel, appliquerModele, verifierGrille, lireJson } = require('./grille');
const { TOLERANCE_DEFAUT } = require('./correction');

function nouveauProjet(infos = {}) {
  return {
    version: 1,
    titre: infos.titre || 'Nouveau devoir',
    niveau: infos.niveau || 'Bac',          // 2STI | 3STI | Bac
    type: infos.type || 'pratique',         // pratique | theorique
    etablissement: '', section: 'Sciences de l\'informatique', matiere: 'S.T.I', date: '', enseignant: '',
    enonce: null,
    totalGrille: 40,                        // total de la grille proposée automatiquement (note sur 20 = total / 2)
    grille: { titre: '', total: 40, noteSur: 20, criteres: [], remarques: [] },
    ressources: [],
    guideUrl: 'https://github.com/mo7amedzouaghi/guideSTI',
    eleves: [],
    tolerance: JSON.parse(JSON.stringify(TOLERANCE_DEFAUT)),
    resultats: {}
  };
}

function sauver(dossier, projet) {
  fs.mkdirSync(dossier, { recursive: true });
  const f = path.join(dossier, 'projet.json');
  const tmp = f + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(projet, null, 2));
  fs.renameSync(tmp, f);
}
function ouvrir(dossier) {
  const p = lireJson(path.join(dossier, 'projet.json'));
  const base = nouveauProjet();
  return { ...base, ...p, tolerance: { ...base.tolerance, ...p.tolerance, difficulte: { ...base.tolerance.difficulte, ...(p.tolerance?.difficulte || {}) } } };
}

function copierDans(dossier, sous, fichier) {
  const d = path.join(dossier, sous);
  fs.mkdirSync(d, { recursive: true });
  const cible = path.join(d, path.basename(fichier));
  if (path.resolve(cible) !== path.resolve(fichier)) fs.copyFileSync(fichier, cible);
  return path.relative(dossier, cible).replace(/\\/g, '/');
}

async function deposerEnonce(dossier, projet, fichier) {
  const rel = copierDans(dossier, 'enonce', fichier);
  projet.enonce = { fichier: rel, nom: path.basename(fichier), texte: await texteDepuisFichier(fichier) };
  return projet.enonce;
}

async function ajouterRessource(dossier, projet, fichier, categorie) {
  const rel = copierDans(dossier, 'ressources', fichier);
  const texte = /\.zip$/i.test(fichier) ? null : await texteDepuisFichier(fichier);
  projet.ressources = (projet.ressources || []).filter(r => r.fichier !== rel);
  projet.ressources.push({ fichier: rel, nom: path.basename(fichier), categorie: categorie || 'ressource', texte });
  return projet.ressources;
}

async function importerGrille(dossier, projet, fichier, modeleJson) {
  if (/\.json$/i.test(fichier)) {
    const m = lireJson(fichier);
    projet.grille = { titre: m.nom || m.titre, total: m.total, noteSur: m.noteSur || 20, remarques: m.remarques || [], criteres: m.criteres };
    if (m.niveau) projet.niveau = m.niveau;
    if (m.type) projet.type = m.type;
  } else {
    const g = await importerGrilleExcel(fichier);
    g.gabaritFichier = copierDans(dossier, 'grille', fichier);
    if (modeleJson) appliquerModele(g, lireJson(modeleJson));
    projet.grille = { ...g, remarques: modeleJson ? (lireJson(modeleJson).remarques || []) : [] };
    if (g.entete?.etablissement && !projet.etablissement) projet.etablissement = g.entete.etablissement;
    if (g.entete?.date && !projet.date) projet.date = g.entete.date;
  }
  return { grille: projet.grille, verification: verifierGrille(projet.grille) };
}

/** Récupère le guide STI publié sur GitHub (dépôt, fichier ou page GitHub Pages) comme ressource texte. */
async function importerGuideGithub(projet, url) {
  let u = url.trim();
  const candidats = [];
  let m;
  if ((m = /^https?:\/\/github\.com\/([^/]+)\/([^/#?]+)\/blob\/(.+)$/i.exec(u))) {
    candidats.push(`https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}`);
  } else if ((m = /^https?:\/\/github\.com\/([^/]+)\/([^/#?]+)\/?$/i.exec(u))) {
    const repo = m[2].replace(/\.git$/, '');
    for (const f of ['README.md', 'readme.md', 'index.md', 'guide.md']) candidats.push(`https://raw.githubusercontent.com/${m[1]}/${repo}/HEAD/${f}`);
  } else candidats.push(u);
  for (const c of candidats) {
    const r = await fetch(c, { headers: { 'User-Agent': 'CorrecteurSTI' } });
    if (!r.ok) continue;
    let t = await r.text();
    if (/<html/i.test(t)) t = t.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n');
    projet.guideUrl = url;
    projet.ressources = (projet.ressources || []).filter(x => x.categorie !== 'guide-github');
    projet.ressources.push({ fichier: null, nom: 'Guide STI (GitHub) – ' + c, categorie: 'guide-github', texte: t });
    return { ok: true, source: c, taille: t.length };
  }
  throw new Error('Impossible de récupérer le guide depuis : ' + url);
}

module.exports = { nouveauProjet, sauver, ouvrir, deposerEnonce, ajouterRessource, importerGrille, importerGuideGithub };
