'use strict';
/*
 * Mise à jour de correcteurAuto depuis les Releases GitHub du dépôt.
 *  - verifier()   : compare la version installée à la dernière Release publiée ;
 *  - telecharger(): télécharge l'installateur (hôtes GitHub uniquement), vérifie la taille
 *                   et l'empreinte SHA-256 fournie par GitHub, refuse tout fichier altéré.
 * Rien n'est exécuté ici : l'application demande confirmation puis lance l'installateur.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEPOT = 'mo7amedzouaghi/correcteur-sti';
const API_DERNIERE = `https://api.github.com/repos/${DEPOT}/releases/latest`;
const PREFIXE_TELECHARGEMENT = `https://github.com/${DEPOT}/releases/download/`;
const PAGE_RELEASES = `https://github.com/${DEPOT}/releases`;
const RX_INSTALLATEUR = /^correcteurAuto-Setup-\d+\.\d+\.\d+\.exe$/;
const HOTES_AUTORISES = ['github.com', 'githubusercontent.com'];

function versionNum(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(v || '').trim());
  return m ? [+m[1], +m[2], +m[3]] : null;
}
/** -1 si a < b, 0 si égales, 1 si a > b ; null si une version est illisible. */
function comparerVersions(a, b) {
  const x = versionNum(a), y = versionNum(b);
  if (!x || !y) return null;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}

function hoteAutorise(url, hotes) {
  try {
    const u = new URL(url);
    return hotes.some(h => u.hostname === h || u.hostname.endsWith('.' + h));
  } catch { return false; }
}

/** Interroge GitHub. Retourne { disponible, versionActuelle, derniere, notes, page, asset }. */
async function verifier(versionActuelle, { api = API_DERNIERE, prefixe = PREFIXE_TELECHARGEMENT, fetchFn = fetch } = {}) {
  let r;
  try {
    r = await fetchFn(api, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'correcteurAuto' },
      signal: AbortSignal.timeout(12000)
    });
  } catch (e) {
    throw new Error(e && (e.name === 'TimeoutError' || e.name === 'AbortError')
      ? 'GitHub ne répond pas (délai dépassé) : réessayez plus tard.'
      : 'Impossible de joindre GitHub : vérifiez la connexion Internet.');
  }
  if (r.status === 404) return { disponible: false, versionActuelle, derniere: null, notes: '', page: PAGE_RELEASES, asset: null };
  if (r.status === 403 || r.status === 429) throw new Error('GitHub limite temporairement les vérifications : réessayez dans quelques minutes.');
  if (!r.ok) throw new Error(`GitHub a répondu ${r.status}.`);
  const rel = await r.json();
  const derniere = String(rel.tag_name || '').replace(/^v/i, '');
  const a = (rel.assets || []).find(x => RX_INSTALLATEUR.test(x.name) && String(x.browser_download_url || '').startsWith(prefixe));
  const cmp = comparerVersions(derniere, versionActuelle);
  return {
    disponible: cmp === 1 && !!a,
    versionActuelle, derniere,
    notes: String(rel.body || ''),
    publie: rel.published_at || null,
    page: String(rel.html_url || '').startsWith(`https://github.com/${DEPOT}/`) ? rel.html_url : PAGE_RELEASES,
    asset: a ? { name: a.name, url: a.browser_download_url, taille: a.size, digest: a.digest || null } : null
  };
}

/**
 * Télécharge l'installateur dans `dossier`. Lève une erreur si l'hôte n'est pas GitHub,
 * si la taille ne correspond pas ou si l'empreinte SHA-256 diffère.
 */
async function telecharger(asset, dossier, onProgres, { prefixe = PREFIXE_TELECHARGEMENT, hotes = HOTES_AUTORISES, fetchFn = fetch } = {}) {
  if (!asset || !RX_INSTALLATEUR.test(asset.name || '')) throw new Error('Fichier de mise à jour non reconnu.');
  if (!String(asset.url || '').startsWith(prefixe)) throw new Error('Adresse de téléchargement refusée (hors dépôt officiel).');
  if (asset.digest && !/^sha256:[0-9a-f]{64}$/i.test(asset.digest)) throw new Error('Empreinte fournie par GitHub illisible.');
  fs.mkdirSync(dossier, { recursive: true });
  const dest = path.join(dossier, asset.name);
  const tmp = dest + '.part';
  fs.rmSync(tmp, { force: true });
  let r;
  try {
    r = await fetchFn(asset.url, { headers: { 'User-Agent': 'correcteurAuto' }, redirect: 'follow' });
  } catch {
    throw new Error('Téléchargement impossible : vérifiez la connexion Internet.');
  }
  if (!r.ok || !r.body) throw new Error(`Téléchargement impossible (${r.status}).`);
  if (r.url && !hoteAutorise(r.url, hotes)) throw new Error('Redirection vers un hôte non autorisé : téléchargement annulé.');
  const hash = crypto.createHash('sha256');
  const sortie = fs.createWriteStream(tmp);
  let recu = 0;
  try {
    for await (const morceau of r.body) {
      hash.update(morceau);
      recu += morceau.length;
      if (!sortie.write(morceau)) await new Promise(ok => sortie.once('drain', ok));
      if (onProgres) onProgres(recu, asset.taille || 0);
    }
    await new Promise((ok, ko) => sortie.end(e => (e ? ko(e) : ok())));
  } catch (e) {
    sortie.destroy();
    fs.rmSync(tmp, { force: true });
    throw e;
  }
  const empreinte = hash.digest('hex');
  if (asset.taille && recu !== asset.taille) {
    fs.rmSync(tmp, { force: true });
    throw new Error(`Téléchargement incomplet (${recu} octets reçus sur ${asset.taille}).`);
  }
  if (asset.digest && empreinte !== asset.digest.slice(7).toLowerCase()) {
    fs.rmSync(tmp, { force: true });
    throw new Error('L\'empreinte SHA-256 du fichier ne correspond pas : fichier corrompu ou altéré, installation annulée.');
  }
  fs.rmSync(dest, { force: true });
  fs.renameSync(tmp, dest);
  return { fichier: dest, empreinte, verifie: !!asset.digest, taille: recu };
}

module.exports = { verifier, telecharger, comparerVersions, hoteAutorise, DEPOT, PAGE_RELEASES };
