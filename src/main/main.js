'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const P = require('../core/projet');
const { importerTravaux, appliquerListe } = require('../core/eleves');
const { corrigerEleve, totaliser } = require('../core/correction');
const { exporterWord } = require('../core/export-word');
const { exporterExcel } = require('../core/export-excel');
const { lireJson, verifierGrille } = require('../core/grille');

// correcteurAuto : correction par règles automatiques, hors ligne
const pkg = require('../../package.json');
const MODE = 'auto';
const NOM_APP = 'correcteurAuto';
app.setName(NOM_APP);

const DOSSIER_MODELES = path.join(__dirname, '..', '..', 'modeles');
let fenetre;
let enCours = null; // { annule: bool }

function cheminConfig() { return path.join(app.getPath('userData'), 'config.json'); }
function lireConfig() { try { return JSON.parse(fs.readFileSync(cheminConfig(), 'utf8')); } catch { return {}; } }
function ecrireConfig(c) { fs.mkdirSync(path.dirname(cheminConfig()), { recursive: true }); fs.writeFileSync(cheminConfig(), JSON.stringify(c, null, 2)); }

function creerFenetre() {
  fenetre = new BrowserWindow({
    width: 1360, height: 860, minWidth: 1024, minHeight: 680,
    title: NOM_APP,
    backgroundColor: '#f5f7fb',
    icon: path.join(__dirname, '..', 'renderer', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false }
  });
  fenetre.removeMenu();
  fenetre.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  // test visuel : STI_CAPTURE=<dossier png> STI_SCRIPT=<js à exécuter> => captures puis fermeture
  if (process.env.STI_CAPTURE) {
    fenetre.webContents.on('console-message', (_e, _l, msg) => console.log('[page]', msg));
    fenetre.webContents.once('did-finish-load', async () => {
      const attendre = ms => new Promise(r => setTimeout(r, ms));
      await attendre(800);
      const etapes = JSON.parse(process.env.STI_SCRIPT || '[]');
      for (const [i, js] of etapes.entries()) {
        try { await fenetre.webContents.executeJavaScript(js); } catch (e) { console.log('[script]', e.message); }
        await attendre(1200);
        const img = await fenetre.webContents.capturePage();
        fs.mkdirSync(process.env.STI_CAPTURE, { recursive: true });
        fs.writeFileSync(path.join(process.env.STI_CAPTURE, `capture-${i + 1}.png`), img.toPNG());
      }
      app.quit();
    });
  }
}

app.whenReady().then(() => {
  creerFenetre();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) creerFenetre(); });
});
app.on('window-all-closed', () => app.quit());

// ---------- utilitaires ----------
async function choisir(options) {
  const r = await dialog.showOpenDialog(fenetre, options);
  return r.canceled ? null : r.filePaths;
}
function sauverEtRendre(dossier, projet, extra = {}) { P.sauver(dossier, projet); return { projet, ...extra }; }
const gerer = (canal, fn) => ipcMain.handle(canal, async (_e, ...a) => {
  try { return await fn(...a); } catch (e) { return { erreur: e.message }; }
});

// ---------- application / configuration ----------
gerer('app:info', () => ({ mode: MODE, nom: NOM_APP, version: pkg.version }));
gerer('config:dernierProjet', () => lireConfig().dernierProjet || null);

// ---------- projet ----------
gerer('projet:nouveau', async infos => {
  const def = path.join(app.getPath('documents'), 'CorrecteurSTI', (infos.titre || 'devoir').replace(/[^\w\- ]+/g, '_'));
  const r = await dialog.showSaveDialog(fenetre, { title: 'Dossier du nouveau projet', defaultPath: def, buttonLabel: 'Créer le projet' });
  if (r.canceled) return null;
  const dossier = r.filePath;
  if (fs.existsSync(path.join(dossier, 'projet.json'))) throw new Error('Un projet existe déjà dans ce dossier : utilisez « Ouvrir ».');
  const projet = P.nouveauProjet(infos);
  const c = lireConfig(); c.dernierProjet = dossier; ecrireConfig(c);
  return sauverEtRendre(dossier, projet, { dossier });
});
gerer('projet:ouvrir', async dossier => {
  if (!dossier) {
    const f = await choisir({ title: 'Ouvrir un projet (dossier contenant projet.json)', properties: ['openDirectory'] });
    if (!f) return null;
    dossier = f[0];
  }
  if (!fs.existsSync(path.join(dossier, 'projet.json'))) throw new Error('Aucun projet.json dans ce dossier.');
  const c = lireConfig(); c.dernierProjet = dossier; ecrireConfig(c);
  return { dossier, projet: P.ouvrir(dossier) };
});
gerer('projet:sauver', (dossier, projet) => sauverEtRendre(dossier, projet));

// ---------- énoncé ----------
gerer('enonce:deposer', async (dossier, projet, chemin) => {
  if (!chemin) {
    const f = await choisir({ title: 'Énoncé du devoir', filters: [{ name: 'Énoncé', extensions: ['pdf', 'docx', 'txt', 'md', 'html'] }] });
    if (!f) return null; chemin = f[0];
  }
  await P.deposerEnonce(dossier, projet, chemin);
  return sauverEtRendre(dossier, projet);
});

// ---------- grille ----------
gerer('grille:modeles', () => fs.readdirSync(DOSSIER_MODELES).filter(f => f.endsWith('.json')).map(f => {
  const m = lireJson(path.join(DOSSIER_MODELES, f));
  return { fichier: path.join(DOSSIER_MODELES, f), nom: m.nom, niveau: m.niveau, type: m.type, total: m.total, nb: m.criteres.length };
}));
gerer('grille:importer', async (dossier, projet, chemin, modele) => {
  if (!chemin) {
    const f = await choisir({ title: 'Grille de correction (Excel officiel ou modèle JSON)', filters: [{ name: 'Grille', extensions: ['xlsx', 'json'] }] });
    if (!f) return null; chemin = f[0];
  }
  const { verification } = await P.importerGrille(dossier, projet, chemin, modele || null);
  return sauverEtRendre(dossier, projet, { verification });
});
gerer('grille:appliquerModele', async (dossier, projet, modele) => {
  if (!modele) {
    const f = await choisir({ title: 'Modèle de règles (JSON)', filters: [{ name: 'Modèle', extensions: ['json'] }] });
    if (!f) return null; modele = f[0];
  }
  const m = lireJson(modele);
  if (!projet.grille.criteres.length) {
    projet.grille = { titre: m.nom, total: m.total, noteSur: m.noteSur || 20, remarques: m.remarques || [], criteres: m.criteres };
  } else {
    require('../core/grille').appliquerModele(projet.grille, m);
    projet.grille.remarques = m.remarques || projet.grille.remarques;
  }
  return sauverEtRendre(dossier, projet, { verification: verifierGrille(projet.grille) });
});
gerer('grille:exporterModele', async projet => {
  const r = await dialog.showSaveDialog(fenetre, { title: 'Enregistrer la grille comme modèle réutilisable', defaultPath: (projet.titre || 'grille') + '.json', filters: [{ name: 'Modèle', extensions: ['json'] }] });
  if (r.canceled) return null;
  const g = projet.grille;
  fs.writeFileSync(r.filePath, JSON.stringify({ nom: projet.titre, niveau: projet.niveau, type: projet.type, total: g.total, noteSur: g.noteSur, remarques: g.remarques, criteres: g.criteres }, null, 2));
  return { fichier: r.filePath };
});
gerer('grille:verifier', projet => verifierGrille(projet.grille));
gerer('grille:proposer', async (dossier, projet) => {
  if (!projet.enonce?.texte?.trim()) throw new Error('Déposez d\'abord l\'énoncé (PDF ou Word contenant du texte).');
  const avecExcel = !!(projet.grille.gabaritExcel && projet.grille.criteres.length);
  const total = avecExcel ? projet.grille.total : (projet.niveau === 'Bac' && projet.type === 'pratique' ? 40 : 20);
  const noteSur = projet.grille.noteSur || 20;
  const { proposerGrille } = require('../core/proposition');
  const grille = proposerGrille(projet.enonce.texte, { total, noteSur, grilleExistante: avecExcel ? projet.grille : null });
  const source = 'analyse automatique de l\'énoncé', avertissement = null;
  if (avecExcel) { grille.gabaritFichier = projet.grille.gabaritFichier; grille.gabaritExcel = projet.grille.gabaritExcel; }
  projet.grille = grille;
  return sauverEtRendre(dossier, projet, { verification: verifierGrille(grille), source, avertissement });
});

// ---------- ressources ----------
gerer('ressource:ajouter', async (dossier, projet, chemins, categorie) => {
  if (!chemins || !chemins.length) {
    chemins = await choisir({ title: 'Ressources (corrigé, guide STI, fichiers fournis…)', properties: ['openFile', 'multiSelections'] });
    if (!chemins) return null;
  }
  for (const c of chemins) await P.ajouterRessource(dossier, projet, c, categorie);
  return sauverEtRendre(dossier, projet);
});
gerer('ressource:supprimer', (dossier, projet, index) => { projet.ressources.splice(index, 1); return sauverEtRendre(dossier, projet); });
gerer('guide:github', async (dossier, projet, url) => {
  const info = await P.importerGuideGithub(projet, url);
  return sauverEtRendre(dossier, projet, { info });
});

// ---------- élèves ----------
gerer('eleves:importer', async (dossier, projet, chemins) => {
  if (!chemins || !chemins.length) {
    chemins = await choisir({ title: 'Travaux des élèves : dossier de la classe, dossiers ou archives .zip', properties: ['openDirectory', 'multiSelections'] });
    if (!chemins) return null;
  }
  projet.eleves = importerTravaux(chemins, dossier, projet.eleves || []);
  return sauverEtRendre(dossier, projet);
});
gerer('eleves:importerFichiers', async (dossier, projet) => {
  const chemins = await choisir({ title: 'Copies (une archive .zip, un PDF ou une image par élève)', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Travaux', extensions: ['zip', 'pdf', 'jpg', 'jpeg', 'png', 'docx', 'rar'] }] });
  if (!chemins) return null;
  projet.eleves = importerTravaux(chemins, dossier, projet.eleves || []);
  return sauverEtRendre(dossier, projet);
});
gerer('eleves:liste', async (dossier, projet) => {
  const f = await choisir({ title: 'Liste des élèves (CSV : numéro;nom;prénom;difficulté)', filters: [{ name: 'CSV', extensions: ['csv', 'txt'] }] });
  if (!f) return null;
  appliquerListe(projet.eleves, fs.readFileSync(f[0], 'utf8'));
  return sauverEtRendre(dossier, projet);
});
gerer('eleves:supprimer', (dossier, projet, id) => {
  const e = projet.eleves.find(x => x.id === id);
  if (e?.dossier) fs.rmSync(path.join(dossier, e.dossier), { recursive: true, force: true });
  projet.eleves = projet.eleves.filter(x => x.id !== id);
  delete projet.resultats[id];
  return sauverEtRendre(dossier, projet);
});
gerer('eleves:ouvrirDossier', (dossier, eleve) => shell.openPath(path.join(dossier, eleve.dossier)));

// ---------- correction ----------
gerer('correction:lancer', async (dossier, projet, ids) => {
  if (!projet.grille.criteres.length) throw new Error('Aucune grille : déposez ou créez une grille d\'abord.');
  const cibles = projet.eleves.filter(e => !ids || ids.includes(e.id));
  enCours = { annule: false };
  const bilan = { corriges: 0, erreurs: [] };
  for (let i = 0; i < cibles.length; i++) {
    if (enCours.annule) break;
    const e = cibles[i];
    fenetre.webContents.send('correction:progres', { i, n: cibles.length, eleve: e.numero, etape: 'règles' });
    try {
      projet.resultats[e.id] = await corrigerEleve(projet, dossier, e, { mode: MODE });
      bilan.corriges++;
    } catch (err) {
      bilan.erreurs.push(`${e.numero} : ${err.message}`);
    }
    P.sauver(dossier, projet);
  }
  fenetre.webContents.send('correction:progres', { i: cibles.length, n: cibles.length, fini: true });
  enCours = null;
  return { projet, bilan };
});
gerer('correction:annuler', () => { if (enCours) enCours.annule = true; return true; });
gerer('correction:recalculer', (dossier, projet, id) => {
  const r = projet.resultats[id];
  if (r) totaliser(r, projet.grille);
  return sauverEtRendre(dossier, projet);
});

// ---------- exports ----------
gerer('export:word', async (dossier, projet, ids) => {
  const sortie = path.join(dossier, 'sorties', 'grilles_individuelles');
  const fichiers = [];
  for (const e of projet.eleves.filter(x => (!ids || ids.includes(x.id)) && projet.resultats[x.id])) {
    fichiers.push(await exporterWord(projet, e, projet.resultats[e.id], sortie));
  }
  return { fichiers, dossier: sortie };
});
gerer('export:excel', async (dossier, projet) => {
  const nom = 'Grille_collective_' + (projet.titre || 'devoir').replace(/[^\w-]+/g, '_') + '.xlsx';
  const f = path.join(dossier, 'sorties', nom);
  return await exporterExcel(projet, dossier, projet.eleves, projet.resultats, f);
});
gerer('shell:ouvrir', p => shell.openPath(p));
gerer('shell:montrer', p => { shell.showItemInFolder(p); return true; });
