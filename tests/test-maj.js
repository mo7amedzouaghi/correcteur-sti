// Mise à jour : comparaison de versions, lecture d'une Release, téléchargement vérifié (faux serveur local).
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const maj = require('../src/core/maj');

(async () => {
  // ---- versions ----
  assert.strictEqual(maj.comparerVersions('1.2.0', '1.1.0'), 1);
  assert.strictEqual(maj.comparerVersions('1.1.0', '1.1.0'), 0);
  assert.strictEqual(maj.comparerVersions('v1.0.9', '1.1.0'), -1);
  assert.strictEqual(maj.comparerVersions('1.10.0', '1.9.0'), 1, 'comparaison numérique, pas alphabétique');
  assert.strictEqual(maj.comparerVersions('abc', '1.0.0'), null);
  assert(maj.hoteAutorise('https://objects.githubusercontent.com/x', ['github.com', 'githubusercontent.com']));
  assert(!maj.hoteAutorise('https://github.com.evil.example/x', ['github.com', 'githubusercontent.com']), 'hôte déguisé refusé');

  // ---- lecture d'une Release (réponse GitHub simulée) ----
  const prefixe = 'https://github.com/mo7amedzouaghi/correcteur-sti/releases/download/';
  const release = (tag, assets) => async () => ({ ok: true, status: 200, json: async () => ({ tag_name: tag, body: '**Notes**', html_url: 'https://github.com/mo7amedzouaghi/correcteur-sti/releases/tag/' + tag, assets }) });
  const bon = { name: 'correcteurAuto-Setup-1.2.0.exe', browser_download_url: prefixe + 'v1.2.0/correcteurAuto-Setup-1.2.0.exe', size: 10, digest: 'sha256:' + 'a'.repeat(64) };
  let v = await maj.verifier('1.1.0', { fetchFn: release('v1.2.0', [bon]) });
  assert.strictEqual(v.disponible, true); assert.strictEqual(v.derniere, '1.2.0'); assert.strictEqual(v.asset.name, bon.name);
  v = await maj.verifier('1.2.0', { fetchFn: release('v1.2.0', [bon]) });
  assert.strictEqual(v.disponible, false, 'déjà à jour');
  v = await maj.verifier('1.1.0', { fetchFn: release('v1.2.0', [{ ...bon, browser_download_url: 'https://evil.example/x.exe' }]) });
  assert.strictEqual(v.disponible, false, 'installateur hors du dépôt officiel ignoré');
  v = await maj.verifier('1.1.0', { fetchFn: release('v1.2.0', [{ ...bon, name: 'autre.exe' }]) });
  assert.strictEqual(v.disponible, false, 'nom de fichier inattendu ignoré');
  v = await maj.verifier('1.1.0', { fetchFn: async () => ({ ok: false, status: 404 }) });
  assert.strictEqual(v.disponible, false);
  await assert.rejects(maj.verifier('1.1.0', { fetchFn: async () => ({ ok: false, status: 403 }) }), /limite/);
  await assert.rejects(maj.verifier('1.1.0', { fetchFn: async () => { throw new TypeError('fetch failed'); } }), /Impossible de joindre GitHub/);

  // ---- téléchargement vérifié, avec un faux serveur local ----
  const contenu = crypto.randomBytes(300000);
  const sha = crypto.createHash('sha256').update(contenu).digest('hex');
  const serveur = http.createServer((req, res) => { res.writeHead(200, { 'Content-Length': contenu.length }); res.end(contenu); });
  await new Promise(ok => serveur.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${serveur.address().port}/`;
  const opts = { prefixe: base, hotes: ['127.0.0.1'] };
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'maj-test-'));
  const asset = { name: 'correcteurAuto-Setup-9.9.9.exe', url: base + 'correcteurAuto-Setup-9.9.9.exe', taille: contenu.length, digest: 'sha256:' + sha };

  let progres = 0;
  const r = await maj.telecharger(asset, dossier, recu => { progres = recu; }, opts);
  assert.strictEqual(r.verifie, true); assert.strictEqual(r.taille, contenu.length); assert.strictEqual(progres, contenu.length);
  assert(fs.readFileSync(r.fichier).equals(contenu), 'fichier identique');
  assert(!fs.existsSync(r.fichier + '.part'), 'pas de fichier temporaire restant');

  await assert.rejects(maj.telecharger({ ...asset, digest: 'sha256:' + 'b'.repeat(64) }, dossier, null, opts), /empreinte SHA-256/);
  assert(!fs.existsSync(path.join(dossier, asset.name + '.part')), 'téléchargement altéré supprimé');
  await assert.rejects(maj.telecharger({ ...asset, taille: contenu.length + 5 }, dossier, null, opts), /incomplet/);
  await assert.rejects(maj.telecharger({ ...asset, url: 'https://evil.example/correcteurAuto-Setup-9.9.9.exe' }, dossier, null, opts), /hors dépôt officiel/);
  await assert.rejects(maj.telecharger({ ...asset, name: '../../evil.exe' }, dossier, null, opts), /non reconnu/);
  await assert.rejects(maj.telecharger({ ...asset, digest: 'md5:abc' }, dossier, null, opts), /illisible/);
  await assert.rejects(maj.telecharger(asset, dossier, null, { ...opts, hotes: ['github.com'] }), /hôte non autorisé/);

  serveur.close();
  fs.rmSync(dossier, { recursive: true, force: true });
  console.log('mise à jour : OK');
})().catch(e => { console.error(e); process.exit(1); });
