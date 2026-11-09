'use strict';
// Extraction de texte depuis les fichiers déposés (énoncé, ressources, travaux).
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const EXT_TEXTE = new Set([
  '.txt', '.md', '.html', '.htm', '.css', '.js', '.php', '.sql', '.json', '.xml',
  '.py', '.csv', '.ini', '.c', '.cpp', '.java', '.sh', '.bat', '.ps1'
]);
const EXT_IMAGE = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);

function estTexte(f) { return EXT_TEXTE.has(path.extname(f).toLowerCase()); }
function estImage(f) { return EXT_IMAGE.has(path.extname(f).toLowerCase()); }

function lireTexteBrut(f) {
  const buf = fs.readFileSync(f);
  // UTF-8 avec BOM ou Latin-1 (fichiers créés sous Notepad / phpMyAdmin anciens)
  let s = buf.toString('utf8');
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  if (s.includes('�')) s = buf.toString('latin1');
  return s;
}

async function texteDepuisFichier(f) {
  const ext = path.extname(f).toLowerCase();
  try {
    if (ext === '.pdf') {
      const pdfParse = require('pdf-parse');
      const r = await pdfParse(fs.readFileSync(f));
      return r.text || '';
    }
    if (ext === '.docx') {
      const mammoth = require('mammoth');
      const r = await mammoth.extractRawText({ path: f });
      return r.value || '';
    }
    if (estTexte(f)) return lireTexteBrut(f);
  } catch (e) {
    return `[Extraction impossible : ${e.message}]`;
  }
  return '';
}

function extraireZip(zipPath, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const zip = new AdmZip(zipPath);
  for (const e of zip.getEntries()) {
    // protection contre les chemins sortants (../)
    const cible = path.resolve(dest, e.entryName);
    if (!cible.startsWith(path.resolve(dest))) continue;
    if (e.isDirectory) { fs.mkdirSync(cible, { recursive: true }); continue; }
    fs.mkdirSync(path.dirname(cible), { recursive: true });
    fs.writeFileSync(cible, e.getData());
  }
  return dest;
}

function listerRecursif(dir, base = dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const n of fs.readdirSync(dir)) {
    if (n === 'node_modules' || n.startsWith('.')) continue;
    const p = path.join(dir, n);
    const st = fs.statSync(p);
    if (st.isDirectory()) listerRecursif(p, base, out);
    else out.push({ chemin: p, rel: path.relative(base, p).replace(/\\/g, '/'), taille: st.size });
  }
  return out;
}

module.exports = { texteDepuisFichier, extraireZip, listerRecursif, estTexte, estImage, lireTexteBrut };
