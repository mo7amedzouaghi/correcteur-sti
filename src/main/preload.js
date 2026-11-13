'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const canaux = [
  'app:info', 'config:dernierProjet', 'maj:config', 'maj:verifier', 'maj:installer', 'maj:page',
  'projet:nouveau', 'projet:ouvrir', 'projet:sauver',
  'enonce:deposer',
  'grille:modeles', 'grille:importer', 'grille:proposer', 'grille:appliquerModele', 'grille:exporterModele', 'grille:verifier',
  'ressource:ajouter', 'ressource:supprimer', 'guide:github',
  'eleves:importer', 'eleves:importerFichiers', 'eleves:liste', 'eleves:supprimer', 'eleves:ouvrirDossier',
  'correction:lancer', 'correction:annuler', 'correction:recalculer',
  'export:word', 'export:excel', 'shell:ouvrir', 'shell:montrer'
];

const api = {};
for (const c of canaux) api[c] = (...a) => ipcRenderer.invoke(c, ...a);

contextBridge.exposeInMainWorld('sti', {
  appel: (canal, ...args) => {
    if (!canaux.includes(canal)) throw new Error('Canal inconnu : ' + canal);
    return api[canal](...args);
  },
  cheminFichier: f => webUtils.getPathForFile(f),
  surProgres: cb => ipcRenderer.on('correction:progres', (_e, d) => cb(d)),
  surMajProgres: cb => ipcRenderer.on('maj:progres', (_e, d) => cb(d))
});
