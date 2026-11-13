'use strict';
/* global window, document */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => (n == null ? '—' : String(Math.round(n * 100) / 100).replace('.', ','));
const arr2 = x => Math.round(x * 100 + 1e-9) / 100;

let info = { mode: 'auto' };
let dossier = null;
let projet = null;
let eleveSel = null;

// ---------- utilitaires ----------
function toast(msg, err) {
  const t = $('#toast');
  t.textContent = msg; t.className = 'toast' + (err ? ' err' : '');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('cache'), err ? 7000 : 3500);
}
async function appel(canal, ...args) {
  const r = await window.sti.appel(canal, ...args);
  if (r && r.erreur) { toast(r.erreur, true); return null; }
  return r;
}
function prendre(r) { if (r && r.projet) { projet = r.projet; toutAfficher(); } return r; }
let minuteur;
function sauver() {
  clearTimeout(minuteur);
  minuteur = setTimeout(() => appel('projet:sauver', dossier, projet), 400);
}
function aller(vue) {
  if (!projet && vue !== 'projet' && vue !== 'maj') { toast('Créez ou ouvrez d\'abord un projet.'); return; }
  $$('#menu button').forEach(b => b.classList.toggle('actif', b.dataset.vue === vue));
  $$('.vue').forEach(v => v.classList.toggle('actif', v.id === 'vue-' + vue));
}
function message(cible, msgs) {
  $(cible).innerHTML = msgs.map(([t, m]) => `<div class="msg ${t}">${esc(m)}</div>`).join('');
}

// ---------- démarrage ----------
(async function init() {
  info = await appel('app:info');
  document.title = info.nom;
  $('#nomApp').textContent = info.nom;
  $('#modeApp').textContent = 'Règles automatiques';
  const dernier = await appel('config:dernierProjet');
  if (dernier) { $('#btnDernier').classList.remove('cache'); $('#btnDernier').title = dernier; $('#btnDernier').onclick = () => ouvrir(dernier); }
  const modeles = await appel('grille:modeles') || [];
  $('#selModele').innerHTML += modeles.map(m => `<option value="${esc(m.fichier)}">${esc(m.nom)} (${m.nb} critères /${m.total})</option>`).join('');
  window.sti.surProgres(progres);
  window.sti.surMajProgres(majProgres);
  toutAfficher();
  initMaj();
})();

$$('#menu button').forEach(b => b.onclick = () => aller(b.dataset.vue));

// ---------- 1. projet ----------
$('#btnNouveau').onclick = async () => {
  const f = new FormData($('#formProjet'));
  const r = await appel('projet:nouveau', { titre: f.get('titre') || 'Nouveau devoir', niveau: f.get('niveau'), type: f.get('type') });
  if (!r) return;
  dossier = r.dossier; prendre(r);
  // reprend les champs déjà saisis
  for (const [k, v] of f.entries()) if (v) projet[k] = v;
  sauver(); toutAfficher(); toast('Projet créé : ' + dossier);
  aller('enonce');
};
$('#btnOuvrir').onclick = () => ouvrir();
async function ouvrir(d) {
  const r = await appel('projet:ouvrir', d);
  if (!r) return;
  dossier = r.dossier; eleveSel = null; prendre(r);
  toast('Projet ouvert');
}
$('#formProjet').addEventListener('input', e => {
  if (!projet) return;
  projet[e.target.name] = e.target.value;
  sauver(); afficherBarre();
});

function afficherProjet() {
  const f = $('#formProjet');
  if (!projet) return;
  for (const el of f.elements) if (el.name) el.value = projet[el.name] ?? '';
}
function afficherBarre() {
  $('#infoProjet').textContent = projet ? `${projet.titre}\n${dossier}` : 'Aucun projet ouvert';
  const fait = {
    projet: !!projet, enonce: !!projet?.enonce, grille: !!projet?.grille?.criteres?.length,
    ressources: !!projet?.ressources?.length, eleves: !!projet?.eleves?.length, tolerance: !!projet,
    correction: !!projet && Object.keys(projet.resultats || {}).length > 0
  };
  $$('#menu button').forEach(b => b.classList.toggle('fait', !!fait[b.dataset.vue]));
}

// ---------- dépôts (glisser-déposer) ----------
const actionsDepot = {
  enonce: async chemins => {
    const r = prendre(await appel('enonce:deposer', dossier, projet, chemins?.[0]));
    if (!r) return;
    // analyse systématique de l'énoncé : proposition de grille si aucune grille n'a encore de règles
    const g = projet.grille;
    const sansRegles = !g.criteres.length || g.criteres.every(c => !(c.regles || []).length);
    if (sansRegles) await proposerGrille(true);
    else message('#grilleBilan', [['att', 'Nouvel énoncé déposé : cliquez sur « Proposer une grille depuis l\'énoncé » pour remplacer la grille actuelle par une proposition.']]);
  },
  grille: async chemins => importerGrille(chemins?.[0]),
  ressource: async chemins => prendre(await appel('ressource:ajouter', dossier, projet, chemins, $('#catRessource').value)),
  eleves: async chemins => { const r = prendre(await appel('eleves:importer', dossier, projet, chemins)); if (r) toast(`${projet.eleves.length} élève(s)`); }
};
$$('.depot').forEach(z => {
  z.addEventListener('dragover', e => { e.preventDefault(); z.classList.add('survol'); });
  z.addEventListener('dragleave', () => z.classList.remove('survol'));
  z.addEventListener('drop', async e => {
    e.preventDefault(); z.classList.remove('survol');
    if (!projet) return toast('Créez d\'abord un projet.');
    const chemins = [...e.dataTransfer.files].map(f => window.sti.cheminFichier(f)).filter(Boolean);
    if (chemins.length) await actionsDepot[z.dataset.cible](chemins);
  });
  z.addEventListener('click', () => projet && actionsDepot[z.dataset.cible](null));
});
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => e.preventDefault());

// ---------- 2. énoncé ----------
function afficherEnonce() {
  const e = projet?.enonce;
  $('#enonceInfo').classList.toggle('cache', !e);
  if (!e) return;
  $('#enonceNom').textContent = e.nom;
  $('#enonceTexte').textContent = (e.texte || '(aucun texte extrait — PDF scanné ?)').slice(0, 20000);
}
$('#btnOuvrirEnonce').onclick = () => appel('shell:ouvrir', dossier + '/' + projet.enonce.fichier);

// ---------- 3. grille ----------
async function importerGrille(chemin) {
  const r = await appel('grille:importer', dossier, projet, chemin, $('#selModele').value || null);
  if (!r) return;
  messageProposition = [];
  prendre(r); bilanGrille(r.verification);
  // grille Excel sans modèle : libellés et règles proposés à partir de l'énoncé
  if (!$('#selModele').value && projet.enonce?.texte && projet.grille.criteres.every(c => !(c.regles || []).length)) await proposerGrille(true);
}
async function proposerGrille(auto) {
  if (!projet.enonce?.texte?.trim()) return toast('Déposez d\'abord l\'énoncé (onglet 2).');
  const g = projet.grille;
  const avecRegles = g.criteres.some(c => (c.regles || []).length);
  if (!auto && avecRegles && !g.gabaritExcel && !window.confirm('Remplacer la grille actuelle par une nouvelle proposition ?')) return;
  projet.totalGrille = Number($('#totalGrille').value) > 0 ? Number($('#totalGrille').value) : 40;
  const b = $('#btnProposer');
  b.disabled = true; b.textContent = '⏳ Analyse de l\'énoncé…';
  const r = await appel('grille:proposer', dossier, projet);
  b.disabled = false; b.textContent = '✨ Proposer une grille depuis l\'énoncé';
  if (!r) return;
  prendre(r);
  aller('grille');
  const m = [['ok', `Grille proposée (${r.source}) : ${projet.grille.criteres.length} critères. Vérifiez et ajustez libellés, barème et règles avant la correction.`]];
  (projet.grille.remarques || []).slice(1).forEach(x => m.push(['att', x]));
  if (r.avertissement) m.push(['att', r.avertissement]);
  messageProposition = m;
  bilanGrille();
}
$('#btnProposer').onclick = () => proposerGrille(false);
$('#btnGrilleExcel').onclick = () => importerGrille(null);
$('#btnAppliquerModele').onclick = async () => {
  if (!$('#selModele').value) return toast('Choisissez un modèle dans la liste.');
  const r = prendre(await appel('grille:appliquerModele', dossier, projet, $('#selModele').value));
  if (r) { bilanGrille(r.verification); toast('Modèle appliqué'); }
};
$('#btnModeleFichier').onclick = async () => { const r = prendre(await appel('grille:appliquerModele', dossier, projet, null)); if (r) bilanGrille(r.verification); };
$('#btnExportModele').onclick = async () => { const r = await appel('grille:exporterModele', projet); if (r) toast('Modèle enregistré : ' + r.fichier); };
$('#btnAjoutCritere').onclick = () => {
  const g = projet.grille;
  const n = g.criteres.length + 1;
  const der = g.criteres[g.criteres.length - 1] || { etape: 'Etape 1', question: '1', sousQuestion: '' };
  let id = 'K' + n; while (g.criteres.some(c => c.id === id)) id += '_';
  g.criteres.push({ id, colonne: id, etape: der.etape, question: der.question, sousQuestion: der.sousQuestion, libelle: 'Nouveau critère', points: 0.5, regles: [] });
  g.total = arr2(g.criteres.reduce((a, c) => a + (+c.points || 0), 0));
  sauver(); afficherGrille();
};
let messageProposition = [];
async function bilanGrille(v) {
  v = v || await appel('grille:verifier', projet);
  if (!v) return;
  const g = projet.grille;
  const sansRegle = g.criteres.filter(c => !(c.regles || []).length).length;
  const m = [[v.problemes.length ? 'att' : 'ok', `${g.criteres.length} critères — somme ${fmt(v.somme)} / total ${fmt(g.total)} — note sur ${g.noteSur}`]];
  v.problemes.forEach(p => m.push(['att', p]));
  if (sansRegle) m.push(['att', `${sansRegle} critère(s) sans règle automatique : ils seront à noter manuellement.`]);
  message('#grilleBilan', [...messageProposition, ...m]);
}
$('#totalGrille').addEventListener('input', e => { if (projet) { projet.totalGrille = Number(e.target.value) > 0 ? Number(e.target.value) : 40; sauver(); } });
function afficherGrille() {
  const g = projet?.grille;
  const tb = $('#tabGrille tbody');
  if (projet) $('#totalGrille').value = projet.totalGrille ?? 40;
  if (!g) { tb.innerHTML = ''; return; }
  tb.innerHTML = g.criteres.map((c, i) => `<tr data-i="${i}">
    <td><input data-k="colonne" value="${esc(c.colonne)}" style="width:52px"></td>
    <td><input data-k="etape" value="${esc(c.etape)}" style="width:190px"></td>
    <td><input data-k="question" value="${esc(c.question)}" style="width:40px"></td>
    <td><input data-k="sousQuestion" value="${esc(c.sousQuestion)}" style="width:40px"></td>
    <td><input data-k="libelle" value="${esc(c.libelle)}"></td>
    <td><input data-k="points" type="number" step="0.25" min="0" class="num" value="${c.points}"></td>
    <td><button class="petit" data-regles="${i}">${(c.regles || []).length ? (c.regles.length + ' règle(s)') : 'aucune'}</button>${c.avertissement ? ` <span class="badge attention" title="${esc(c.avertissement)}">!</span>` : ''}</td>
    <td><button class="lien danger" data-suppr="${i}" title="Supprimer">✕</button></td></tr>`).join('');
}
$('#tabGrille').addEventListener('input', e => {
  const tr = e.target.closest('tr'); const k = e.target.dataset.k;
  if (!tr || !k) return;
  const c = projet.grille.criteres[+tr.dataset.i];
  c[k] = k === 'points' ? parseFloat(e.target.value) || 0 : e.target.value;
  if (k === 'colonne') c.id = e.target.value;
  if (k === 'points') projet.grille.total = arr2(projet.grille.criteres.reduce((a, x) => a + (+x.points || 0), 0));
  sauver(); clearTimeout(bilanGrille.t); bilanGrille.t = setTimeout(() => bilanGrille(), 500);
});
$('#tabGrille').addEventListener('click', e => {
  const s = e.target.dataset.suppr, r = e.target.dataset.regles;
  if (s != null) { projet.grille.criteres.splice(+s, 1); projet.grille.total = arr2(projet.grille.criteres.reduce((a, x) => a + (+x.points || 0), 0)); sauver(); afficherGrille(); bilanGrille(); }
  if (r != null) {
    const c = projet.grille.criteres[+r];
    ouvrirModal(`Règles automatiques — ${c.id} : ${c.libelle}`,
      'Types : fichier, regex, html, css, js, ou, et, manuel. Chaque règle a un poids « pts ». « consigne » : précision de correction pour ce critère.',
      JSON.stringify({ consigne: c.consigne || '', regles: c.regles || [] }, null, 2),
      txt => { const o = JSON.parse(txt); c.regles = o.regles || []; c.consigne = o.consigne || undefined; sauver(); afficherGrille(); bilanGrille(); });
  }
});

// ---------- 4. ressources ----------
$('#btnRessource').onclick = () => actionsDepot.ressource(null);
$('#btnGuide').onclick = async () => {
  const url = $('#urlGuide').value.trim();
  if (!url) return toast('Collez le lien GitHub du guide STI.');
  $('#btnGuide').disabled = true;
  const r = prendre(await appel('guide:github', dossier, projet, url));
  $('#btnGuide').disabled = false;
  if (r) toast(`Guide importé (${Math.round(r.info.taille / 1000)} k caractères)`);
};
function afficherRessources() {
  if (!projet) return;
  $('#urlGuide').value = projet.guideUrl || '';
  const noms = { corrige: 'Corrigé / barème', guide: 'Guide STI', 'guide-github': 'Guide STI (GitHub)', ressource: 'Ressource élève', autre: 'Autre' };
  $('#tabRessources tbody').innerHTML = (projet.ressources || []).map((r, i) => `<tr>
    <td>${esc(r.nom)}</td><td><span class="badge">${esc(noms[r.categorie] || r.categorie)}</span></td>
    <td>${r.texte ? fmt(r.texte.length / 1000) + ' k car.' : '<span class="badge">fichier</span>'}</td>
    <td>${r.fichier ? `<button class="lien" data-ouvrir="${esc(r.fichier)}">Ouvrir</button>` : ''}<button class="lien danger" data-suppr="${i}">✕</button></td></tr>`).join('')
    || '<tr><td colspan="4" class="aide">Aucune ressource.</td></tr>';
}
$('#tabRessources').addEventListener('click', async e => {
  if (e.target.dataset.ouvrir) appel('shell:ouvrir', dossier + '/' + e.target.dataset.ouvrir);
  if (e.target.dataset.suppr != null) prendre(await appel('ressource:supprimer', dossier, projet, +e.target.dataset.suppr));
});

// ---------- 5. élèves ----------
$('#btnEleves').onclick = () => actionsDepot.eleves(null);
$('#btnElevesFichiers').onclick = async () => prendre(await appel('eleves:importerFichiers', dossier, projet));
$('#btnListe').onclick = async () => prendre(await appel('eleves:liste', dossier, projet));
function afficherEleves() {
  if (!projet) return;
  $('#tabEleves tbody').innerHTML = (projet.eleves || []).map(e => {
    const r = projet.resultats?.[e.id];
    return `<tr data-id="${esc(e.id)}">
      <td><input data-k="numero" value="${esc(e.numero)}" style="width:110px"></td>
      <td><input data-k="nom" value="${esc(e.nom)}"></td>
      <td><input data-k="prenom" value="${esc(e.prenom)}"></td>
      <td><button class="lien" data-dossier="1">${e.nbFichiers ?? '?'} fichier(s)</button></td>
      <td style="text-align:center"><input type="checkbox" data-k="difficulte" ${e.difficulte ? 'checked' : ''}></td>
      <td>${r ? `<span class="badge ${r.valide ? 'ok' : ''}">${fmt(r.note)}/${projet.grille.noteSur}</span>` : '<span class="badge">—</span>'}</td>
      <td><button class="lien danger" data-suppr="1" title="Retirer l'élève">✕</button></td></tr>`;
  }).join('') || '<tr><td colspan="7" class="aide">Aucun travail importé.</td></tr>';
}
$('#tabEleves').addEventListener('input', e => {
  const tr = e.target.closest('tr'); const k = e.target.dataset.k;
  if (!tr || !k) return;
  const el = projet.eleves.find(x => x.id === tr.dataset.id);
  el[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
  if (k === 'difficulte' && projet.resultats[el.id]) toast('Pensez à relancer la correction de cet élève : la tolérance a changé.');
  sauver(); afficherResultats();
});
$('#tabEleves').addEventListener('click', async e => {
  const tr = e.target.closest('tr'); if (!tr) return;
  const el = projet.eleves.find(x => x.id === tr.dataset.id);
  if (e.target.dataset.dossier) appel('eleves:ouvrirDossier', dossier, el);
  if (e.target.dataset.suppr && window.confirm(`Retirer l'élève ${el.numero} et sa copie du projet ?`)) prendre(await appel('eleves:supprimer', dossier, projet, el.id));
});

// ---------- 6. tolérance ----------
function afficherTolerance() {
  if (!projet) return;
  const t = projet.tolerance, f = $('#formTol');
  for (const el of f.elements) {
    if (!el.name) continue;
    const d = el.name.startsWith('d_');
    const v = d ? t.difficulte[el.name.slice(2)] : t[el.name];
    if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
  }
}
$('#formTol').addEventListener('input', e => {
  const el = e.target, t = projet.tolerance;
  const v = el.type === 'checkbox' ? el.checked : parseFloat(el.value);
  if (el.name.startsWith('d_')) t.difficulte[el.name.slice(2)] = v; else t[el.name] = v;
  sauver();
});

// ---------- 7. correction ----------
$('#btnLancer').onclick = async () => {
  if (!projet.eleves.length) return toast('Importez d\'abord les travaux des élèves.');
  const ids = $('#seulementNonCorriges').checked ? projet.eleves.filter(e => !projet.resultats[e.id]).map(e => e.id) : null;
  if (ids && !ids.length) return toast('Tous les élèves sont déjà corrigés (décochez « seulement les non corrigés » pour tout recorriger).');
  await appel('projet:sauver', dossier, projet);
  $('#btnLancer').disabled = true; $('#btnAnnuler').classList.remove('cache');
  const r = await appel('correction:lancer', dossier, projet, ids);
  $('#btnLancer').disabled = false; $('#btnAnnuler').classList.add('cache');
  if (!r) return;
  prendre(r);
  const m = [['ok', `${r.bilan.corriges} élève(s) corrigé(s). Vérifiez et validez chaque grille avant l'export.`]];
  r.bilan.erreurs.forEach(x => m.push(['att', x]));
  message('#bilanCorrection', m);
};
$('#btnAnnuler').onclick = () => appel('correction:annuler');
function progres(d) {
  $('#progres').classList.toggle('cache', !!d.fini);
  $('#progresBarre').style.width = (100 * d.i / Math.max(1, d.n)) + '%';
  $('#progresTexte').textContent = d.fini ? '' : `Élève ${d.eleve} (${d.i + 1}/${d.n}) — ${d.etape}`;
}
$('#btnWord').onclick = async () => {
  const r = await appel('export:word', dossier, projet, null);
  if (!r) return;
  if (!r.fichiers.length) return toast('Aucun élève corrigé.');
  toast(`${r.fichiers.length} grille(s) Word générée(s)`); appel('shell:ouvrir', r.dossier);
};
$('#btnExcel').onclick = async () => {
  const r = await appel('export:excel', dossier, projet);
  if (!r) return;
  if (r.horsGabarit?.length) message('#bilanCorrection', [['att', `Le gabarit Excel ne contient pas assez de lignes : ${r.horsGabarit.length} élève(s) figurent uniquement dans la feuille « Récapitulatif ».`]]);
  toast('Grille collective générée'); appel('shell:montrer', r.fichier);
};
$('#btnSorties').onclick = () => appel('shell:ouvrir', dossier + '/sorties');

function nomEleve(e) { return [e.nom, e.prenom].filter(Boolean).join(' ') || '—'; }
function afficherResultats() {
  if (!projet) return;
  const sur = projet.grille.noteSur;
  $('#tabResultats tbody').innerHTML = projet.eleves.map(e => {
    const r = projet.resultats[e.id];
    return `<tr class="cliquable ${e.id === eleveSel ? 'sel' : ''}" data-id="${esc(e.id)}">
      <td>${esc(e.numero)}</td><td>${esc(nomEleve(e))}${e.difficulte ? ' <span class="badge attention" title="Difficulté d\'apprentissage">A</span>' : ''}</td>
      <td>${r ? fmt(r.total) : '—'}</td><td>${r ? `<strong>${fmt(r.note)}</strong>` : '—'}</td>
      <td>${r ? (r.valide ? '✓' : (r.aSaisir ? `<span class="badge attention">${r.aSaisir}</span>` : '')) : ''}</td></tr>`;
  }).join('');
  const notes = projet.eleves.map(e => projet.resultats[e.id]?.note).filter(n => n != null);
  $('#stats').innerHTML = notes.length
    ? `Moyenne <strong>${fmt(notes.reduce((a, b) => a + b, 0) / notes.length)}</strong>/${sur} · min ${fmt(Math.min(...notes))} · max ${fmt(Math.max(...notes))} · ${notes.filter(n => n >= sur / 2).length}/${notes.length} ≥ ${sur / 2}`
    : 'Aucune correction.';
}
$('#tabResultats').addEventListener('click', e => {
  const tr = e.target.closest('tr[data-id]'); if (!tr) return;
  eleveSel = tr.dataset.id; afficherResultats(); afficherDetail();
});

function recalculer(r) {
  let t = 0, a = 0;
  for (const c of projet.grille.criteres) { const p = r.criteres[c.id]?.points; if (p == null) a++; else t += p; }
  r.total = arr2(t); r.note = arr2(t * projet.grille.noteSur / projet.grille.total); r.aSaisir = a;
}
function afficherDetail() {
  const e = projet?.eleves.find(x => x.id === eleveSel);
  const r = e && projet.resultats[e.id];
  const d = $('#detail');
  if (!e) { d.innerHTML = '<p class="aide">Sélectionnez un élève pour voir et ajuster sa correction.</p>'; return; }
  if (!r) { d.innerHTML = `<h2>${esc(e.numero)} — ${esc(nomEleve(e))}</h2><p class="aide">Pas encore corrigé.</p><button class="principal" id="btnCorrigerUn">Corriger cet élève</button>`; $('#btnCorrigerUn').onclick = () => corrigerUn(e.id); return; }
  const g = projet.grille;
  let lignes = '', etapeCourante = null;
  for (const c of g.criteres) {
    if (c.etape !== etapeCourante) {
      etapeCourante = c.etape;
      const cs = g.criteres.filter(x => x.etape === c.etape);
      lignes += `<tr class="groupe"><td colspan="3">${esc(c.etape)}</td><td>${fmt(cs.reduce((a, x) => a + (r.criteres[x.id]?.points || 0), 0))} / ${fmt(cs.reduce((a, x) => a + x.points, 0))}</td></tr>`;
    }
    const x = r.criteres[c.id] || {};
    const src = x.source === 'enseignant' ? '<span class="badge ok">modifié</span>' : x.manuel ? '<span class="badge attention">à saisir</span>' : '';
    const regles = (x.details || []).map(dd => `<div class="${dd.ok ? 'okr' : 'ko'}">${dd.ok ? '✓' : '✗'} ${esc(dd.label)} — ${esc(dd.info)}</div>`).join('');
    lignes += `<tr data-c="${esc(c.id)}">
      <td>${esc(c.id)}<br><small>Q${esc(c.question)}${c.sousQuestion ? '-' + esc(c.sousQuestion) : ''}</small></td>
      <td><strong>${esc(c.libelle)}</strong> ${src}
        ${regles ? `<details class="details-regles"><summary>Analyse automatique</summary>${regles}</details>` : ''}</td>
      <td style="min-width:220px"><textarea data-k="commentaire" rows="2">${esc(x.commentaire)}</textarea></td>
      <td><input data-k="points" type="number" step="${projet.tolerance.arrondi || 0.25}" min="0" max="${c.points}" class="num" value="${x.points ?? ''}" placeholder="?"> / ${fmt(c.points)}</td></tr>`;
  }
  const liste = a => (a || []).join('\n');
  d.innerHTML = `
    <div class="ligne-titre"><div><h2>${esc(e.numero)} — ${esc(nomEleve(e))}</h2>
      <span class="badge">règles automatiques</span>
      ${e.difficulte ? '<span class="badge attention">correction adaptée</span>' : ''}</div>
      <div class="total-detail" id="totalDetail">${fmt(r.total)} / ${fmt(g.total)} → ${fmt(r.note)} / ${g.noteSur}</div></div>
    ${(r.avertissements || []).map(a => `<div class="msg att">${esc(a)}</div>`).join('')}
    ${(r.erreurs || []).length ? `<details class="details-regles"><summary>${r.erreurs.length} erreur(s) détectée(s)</summary>${r.erreurs.map(x => `<div class="ko">${x.critere ? '[' + esc(x.critere) + '] ' : ''}${esc(x.description)}${x.penalite ? ' (−' + fmt(x.penalite) + ')' : ''}</div>`).join('')}</details>` : ''}
    <div class="actions"><label class="case"><input type="checkbox" id="chkValide" ${r.valide ? 'checked' : ''}> Correction vérifiée et validée</label>
      <span class="separateur"></span><button id="btnRecorriger">Recorriger</button><button id="btnWordUn">Grille Word</button><button id="btnDossierUn">Fichiers de l'élève</button></div>
    <table id="tabDetail"><thead><tr><th>Col.</th><th>Critère</th><th>Observation (élève)</th><th>Note</th></tr></thead><tbody>${lignes}</tbody></table>
    <div class="grille-form" style="margin-top:14px">
      <label>Appréciation<textarea data-s="appreciation" rows="3">${esc(r.appreciation)}</textarea></label>
      <label>Points forts (un par ligne)<textarea data-s="pointsForts" rows="3">${esc(liste(r.pointsForts))}</textarea></label>
      <label>À améliorer (un par ligne)<textarea data-s="aAmeliorer" rows="3">${esc(liste(r.aAmeliorer))}</textarea></label>
      <label>Conseils de remédiation (un par ligne)<textarea data-s="conseils" rows="3">${esc(liste(r.conseils))}</textarea></label>
    </div>`;
  $('#chkValide').onchange = ev => { r.valide = ev.target.checked; sauver(); afficherResultats(); };
  $('#btnRecorriger').onclick = () => corrigerUn(e.id);
  $('#btnDossierUn').onclick = () => appel('eleves:ouvrirDossier', dossier, e);
  $('#btnWordUn').onclick = async () => { const x = await appel('export:word', dossier, projet, [e.id]); if (x?.fichiers[0]) appel('shell:ouvrir', x.fichiers[0]); };
  d.querySelector('tbody').addEventListener('input', ev => {
    const tr = ev.target.closest('tr[data-c]'); if (!tr) return;
    const x = r.criteres[tr.dataset.c];
    if (ev.target.dataset.k === 'points') {
      const max = projet.grille.criteres.find(c => c.id === tr.dataset.c).points;
      const v = ev.target.value === '' ? null : Math.min(max, Math.max(0, parseFloat(ev.target.value)));
      x.points = isNaN(v) ? null : v; x.source = 'enseignant'; x.manuel = false;
      recalculer(r);
      $('#totalDetail').textContent = `${fmt(r.total)} / ${fmt(projet.grille.total)} → ${fmt(r.note)} / ${projet.grille.noteSur}`;
      afficherResultats();
    } else x.commentaire = ev.target.value;
    sauver();
  });
  d.querySelectorAll('textarea[data-s]').forEach(t => t.addEventListener('input', () => {
    const k = t.dataset.s;
    r[k] = k === 'appreciation' ? t.value : t.value.split('\n').map(s => s.trim()).filter(Boolean);
    sauver();
  }));
}
async function corrigerUn(id) {
  await appel('projet:sauver', dossier, projet);
  const r = await appel('correction:lancer', dossier, projet, [id]);
  if (r) { prendre(r); if (r.bilan.erreurs.length) message('#bilanCorrection', r.bilan.erreurs.map(x => ['att', x])); }
}


// ---------- modal ----------
function ouvrirModal(titre, aide, texte, ok) {
  $('#modalTitre').textContent = titre; $('#modalAide').textContent = aide; $('#modalTexte').value = texte;
  $('#modal').classList.remove('cache');
  $('#modalOk').onclick = () => {
    try { ok($('#modalTexte').value); $('#modal').classList.add('cache'); } catch (e) { toast('JSON invalide : ' + e.message, true); }
  };
}
$('#modalAnnuler').onclick = () => $('#modal').classList.add('cache');

function toutAfficher() {
  afficherBarre(); afficherProjet();
  if (!projet) return;
  afficherEnonce(); afficherGrille(); afficherRessources(); afficherEleves(); afficherTolerance(); afficherResultats(); afficherDetail();
  if (projet.grille.criteres.length) bilanGrille();
}

// ---------- mise à jour ----------
let majInfo = null;
const notesLisibles = t => String(t || '').split('**').join('').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/^#+\s*/gm, '').trim();
async function majVerifier(silencieux) {
  const b = $('#btnMajVerifier');
  b.disabled = true;
  const r = await window.sti.appel('maj:verifier');
  b.disabled = false;
  if (r && r.erreur) {
    if (!silencieux) message('#majEtat', [['err', r.erreur]]);
    return null;
  }
  majInfo = r;
  $('#majPastille').classList.toggle('cache', !r.disponible);
  $('#btnMajInstaller').classList.toggle('cache', !r.disponible);
  $('#majNotes').classList.toggle('cache', !r.disponible || !r.notes);
  if (r.disponible) {
    message('#majEtat', [['ok', `La version ${r.derniere} est disponible (vous utilisez la version ${r.versionActuelle}).`]]);
    $('#majNotes').textContent = notesLisibles(r.notes);
    if (silencieux) toast(`Mise à jour ${r.derniere} disponible : onglet « Mise à jour ».`);
  } else if (!silencieux) {
    message('#majEtat', [['ok', r.derniere ? `correcteurAuto est à jour (version ${r.versionActuelle}).` : 'Aucune version n\'est encore publiée sur GitHub.']]);
  }
  return r;
}
function majProgres(d) {
  $('#majProgres').classList.remove('cache');
  const pct = d.total ? Math.min(100, Math.round(100 * d.recu / d.total)) : 0;
  $('#majBarre').style.width = pct + '%';
  $('#majTexte').textContent = `Téléchargement : ${(d.recu / 1048576).toFixed(1)} Mo${d.total ? ' / ' + (d.total / 1048576).toFixed(1) + ' Mo (' + pct + ' %)' : ''}`;
}
async function initMaj() {
  const cfg = await appel('maj:config');
  if (!cfg) return;
  $('#majVersion').textContent = 'v' + cfg.version;
  $('#majAuto').checked = cfg.majAuto;
  if (cfg.majAuto) majVerifier(true);
}
$('#btnMajVerifier').onclick = () => majVerifier(false);
$('#btnMajPage').onclick = () => appel('maj:page');
$('#majAuto').onchange = e => appel('maj:config', { majAuto: e.target.checked });
$('#btnMajInstaller').onclick = async () => {
  if (!majInfo?.disponible) return;
  const b = $('#btnMajInstaller');
  b.disabled = true; $('#btnMajVerifier').disabled = true;
  message('#majEtat', [['ok', `Téléchargement de la version ${majInfo.derniere}…`]]);
  $('#majBarre').style.width = '0';
  const r = await window.sti.appel('maj:installer');
  b.disabled = false; $('#btnMajVerifier').disabled = false;
  $('#majProgres').classList.add('cache');
  if (r && r.erreur) return message('#majEtat', [['err', r.erreur]]);
  if (r.lance) message('#majEtat', [['ok', 'Installateur lancé : l\'application se ferme pour terminer la mise à jour.']]);
  else message('#majEtat', [['att', `La version ${r.derniere} est téléchargée. Cliquez de nouveau sur « Télécharger et installer » quand vous voulez l'installer.`]]);
};
