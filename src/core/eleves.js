'use strict';
// Import des travaux des élèves : un sous-dossier, une archive .zip ou un fichier (copie scannée) par élève.
const fs = require('fs');
const path = require('path');
const { extraireZip, listerRecursif, estTexte, estImage, lireTexteBrut } = require('./extract');

const TAILLE_MAX_TEXTE = 400 * 1024; // un fichier de code élève dépasse rarement 400 Ko

function numeroDepuisNom(nom) {
  const m = /(\d{4,})/.exec(nom);
  return m ? m[1] : nom.replace(/\.[^.]+$/, '');
}

function idSur(nom) { return nom.replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_').slice(0, 60); }

/**
 * Copie les travaux dans <projet>/eleves/<id>/ et renvoie la liste des élèves.
 * source : dossier contenant les travaux (ou liste de chemins).
 */
function importerTravaux(sources, dossierProjet, existants = []) {
  const dest = path.join(dossierProjet, 'eleves');
  fs.mkdirSync(dest, { recursive: true });
  const entrees = [];
  for (const s of [].concat(sources)) {
    if (fs.statSync(s).isDirectory()) {
      const enfants = fs.readdirSync(s).filter(n => !n.startsWith('.'));
      const sousDossiers = enfants.filter(n => fs.statSync(path.join(s, n)).isDirectory() || /\.zip$/i.test(n));
      // dossier « classe » (contient des dossiers/zips) ou dossier d'un seul élève
      if (sousDossiers.length) enfants.forEach(n => entrees.push(path.join(s, n)));
      else entrees.push(s);
    } else entrees.push(s);
  }
  const eleves = [...existants];
  for (const e of entrees) {
    const nom = path.basename(e);
    const id = idSur(nom);
    const cible = path.join(dest, id);
    if (fs.existsSync(cible)) fs.rmSync(cible, { recursive: true, force: true });
    if (fs.statSync(e).isDirectory()) fs.cpSync(e, cible, { recursive: true });
    else if (/\.zip$/i.test(nom)) extraireZip(e, cible);
    else if (/\.(rar|7z)$/i.test(nom)) { fs.mkdirSync(cible, { recursive: true }); fs.copyFileSync(e, path.join(cible, nom)); }
    else { fs.mkdirSync(cible, { recursive: true }); fs.copyFileSync(e, path.join(cible, nom)); }
    const ancien = eleves.find(x => x.id === id);
    const fiche = ancien || { id, numero: numeroDepuisNom(nom), nom: '', prenom: '', difficulte: false };
    fiche.dossier = path.relative(dossierProjet, cible);
    fiche.nbFichiers = listerRecursif(cible).length;
    if (!ancien) eleves.push(fiche);
  }
  return eleves.sort((a, b) => String(a.numero).localeCompare(String(b.numero), 'fr', { numeric: true }));
}

/** Lit les fichiers d'un élève (texte pour le code, chemin pour les images / PDF). */
function lireTravail(dossierProjet, eleve) {
  const dir = path.join(dossierProjet, eleve.dossier);
  const fichiers = [];
  const avertissements = [];
  for (const f of listerRecursif(dir)) {
    const item = { rel: f.rel, chemin: f.chemin, taille: f.taille };
    if (/\.(rar|7z)$/i.test(f.rel)) avertissements.push(`Archive ${f.rel} non lue : décompressez-la (format .zip accepté).`);
    if (estTexte(f.rel)) {
      if (f.taille > TAILLE_MAX_TEXTE) avertissements.push(`${f.rel} trop volumineux (${Math.round(f.taille / 1024)} Ko) : lu partiellement.`);
      item.texte = lireTexteBrut(f.chemin).slice(0, TAILLE_MAX_TEXTE);
    } else if (estImage(f.rel)) item.image = true;
    else if (/\.pdf$/i.test(f.rel)) item.pdf = true;
    else if (/\.docx$/i.test(f.rel)) item.docx = true;
    fichiers.push(item);
  }
  return { fichiers, avertissements };
}

/** Import d'une liste (CSV ; ou ,) : numero;nom;prenom;difficulte(0/1) */
function appliquerListe(eleves, texteCsv) {
  const lignes = texteCsv.split(/\r?\n/).map(l => l.split(/[;,\t]/).map(x => x.trim())).filter(l => l[0]);
  for (const [num, nom, prenom, diff] of lignes) {
    const e = eleves.find(x => String(x.numero) === num || x.id === num);
    if (!e) continue;
    if (nom) e.nom = nom;
    if (prenom) e.prenom = prenom;
    if (diff) e.difficulte = /^(1|oui|x|vrai|true)$/i.test(diff);
  }
  return eleves;
}

module.exports = { importerTravaux, lireTravail, appliquerListe, numeroDepuisNom };
