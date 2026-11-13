'use strict';
/*
 * Moteur de règles automatiques de correcteurAuto.
 *
 * Un critère de la grille possède une liste "regles". Chaque règle a un poids "pts"
 * (relatif : la note du critère = somme des pts obtenus / somme des pts * barème).
 *
 * Types de règles :
 *  fichier  { fichier }                         le fichier existe
 *  regex    { fichier, motif | motifs[], flags, min, proportionnel, sansCommentaires }
 *  html     { fichier, selecteur, min, texte, motif, cibleIframe }
 *  css      { fichier, propriete, valeur, selecteurs[] }   déclaration (+ application)
 *  js       { fichier, fonction, motif }        fonction présente (+ motif dans son corps)
 *  ou       { regles[] }                        une des solutions équivalentes suffit
 *  et       { regles[] }                        toutes doivent être vraies
 *  manuel   {}                                  à noter par l'enseignant
 * Option commune : indice (motif regex) => points partiels si tentative visible.
 */
const vm = require('vm');
const cheerio = require('cheerio');

// ---------- tolérance : rapprochement de noms (fichiers, fonctions, id/class renommés ou mal orthographiés) ----------
function normNom(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
function distance(a, b) {
  a = normNom(a); b = normNom(b);
  const d = [];
  for (let i = 0; i <= a.length; i++) d.push([i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = a[i - 1] === b[j - 1] ? d[i - 1][j - 1] : 1 + Math.min(d[i - 1][j - 1], d[i - 1][j], d[i][j - 1]);
  }
  return d[a.length][b.length];
}
// seuil de tolérance proportionnel à la longueur : fautes de frappe / noms renommés acceptés, pas les noms sans rapport
function seuilProche(a, b) { return Math.max(1, Math.ceil(Math.max(a.length, b.length) / 4)); }
function proche(a, b) { a = normNom(a); b = normNom(b); const d = distance(a, b); return d > 0 && d <= seuilProche(a, b); }

// ---------- utilitaires fichiers ----------
function globVersRegex(g) {
  const e = g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp('^' + e + '$', 'i');
}
function fichiersCorrespondants(ctx, motifFichier) {
  if (!motifFichier) return ctx.fichiers;
  const motifs = Array.isArray(motifFichier) ? motifFichier : [motifFichier];
  const rx = motifs.map(globVersRegex);
  const trouves = ctx.fichiers.filter(f => {
    const nom = f.rel.split('/').pop();
    return rx.some(r => r.test(nom) || r.test(f.rel));
  });
  if (trouves.length || ctx.tolerantNomsFichiers === false) return trouves;
  // Tolérance : fichier renommé (faute de frappe, nom approché) — uniquement pour un nom précis (sans * ni ?).
  const ajouts = [];
  for (const motif of motifs) {
    if (/[*?]/.test(motif) || !motif.includes('.')) continue;
    const ext = motif.split('.').pop().toLowerCase();
    const cible = motif.replace(/\.[^.]+$/, '');
    const parExt = ctx.fichiers.filter(f => (f.rel.split('.').pop() || '').toLowerCase() === ext);
    let meilleur = null, meilleureDist = Infinity;
    for (const f of parExt) {
      const base = f.rel.split('/').pop().replace(/\.[^.]+$/, '');
      const d = distance(base, cible);
      if (d <= seuilProche(base, cible) && d < meilleureDist) { meilleur = f; meilleureDist = d; }
    }
    // à défaut de nom proche, un seul fichier de cette extension dans la copie ne peut être que celui-là
    // (fichier renommé sans rapport : code.js, decor.css…) — jamais pour .html (plusieurs pages attendues).
    if (!meilleur && ext !== 'html' && ext !== 'htm' && parExt.length === 1) meilleur = parExt[0];
    if (meilleur && !ajouts.includes(meilleur)) ajouts.push(meilleur);
  }
  return ajouts.length ? ajouts : trouves;
}
function sansCommentaires(code, ext) {
  let s = code.replace(/\/\*[\s\S]*?\*\//g, ' ');
  if (ext === 'html' || ext === 'htm') s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  if (ext === 'sql') s = s.replace(/^\s*--.*$/gm, ' ');
  // commentaires // et # en début de ligne seulement (évite les URL http://)
  if (ext === 'js' || ext === 'php') s = s.replace(/^\s*(\/\/|#).*$/gm, ' ');
  return s;
}
function contenu(f, retirer) {
  const ext = f.rel.split('.').pop().toLowerCase();
  return retirer ? sansCommentaires(f.texte || '', ext) : (f.texte || '');
}
function mkRegex(motif, flags, ctx) {
  let fl = (flags || 'i').replace(/g/g, '');
  if ((ctx.tolerant || ctx.casse) && !fl.includes('i')) fl += 'i';
  return new RegExp(motif, fl + 'g');
}
function compter(rx, s) { const m = s.match(rx); return m ? m.length : 0; }

// ---------- CSS tolérant (sans échec sur fichier mal formé) ----------
function parserCss(texte) {
  const s = (texte || '').replace(/\/\*[\s\S]*?\*\//g, ' ');
  const regles = [];
  const rx = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = rx.exec(s))) {
    const selecteurs = m[1].split(',').map(x => x.trim().replace(/\s+/g, ' ').replace(/["']/g, '')).filter(Boolean);
    if (selecteurs.some(x => x.startsWith('@'))) continue;
    const decls = [];
    for (const d of m[2].split(';')) {
      const i = d.indexOf(':');
      if (i < 0) continue;
      decls.push({ prop: d.slice(0, i).trim().toLowerCase(), val: d.slice(i + 1).trim().replace(/\s+/g, ' ') });
    }
    regles.push({ selecteurs, decls });
  }
  return regles;
}
function tokensSelecteur(sel) { return (sel.match(/[.#][\w-]+/g) || []).map(t => t.slice(1)); }
function selecteurCorrespond(sel, cible) {
  // cible id/classe explicite (#defi, .bouton) => cherchée parmi les id/classes du sélecteur, sans les confondre
  const m = /^([.#])([\w-]+)$/.exec(cible);
  if (m) return tokensSelecteur(sel).includes(m[2]) && sel.includes(m[1] === '#' ? '#' + m[2] : '.' + m[2]);
  // cible simple (h1, header, fieldset…) => cherchée comme mot dans le sélecteur
  if (/^[a-z][a-z0-9-]*$/i.test(cible)) {
    return new RegExp('(^|[\\s>+~])' + cible + '(?=$|[.#:\\[\\s>+~])', 'i').test(sel);
  }
  return new RegExp(cible, 'i').test(sel);
}
// id/class renommé ou mal orthographié par l'élève (ex. #defis pour #defi, .boutton pour .bouton)
function selecteurCorrespondTolerant(sel, cible) {
  if (selecteurCorrespond(sel, cible)) return true;
  const m = /^([.#])([\w-]+)$/.exec(cible) || (/^[a-z][\w-]*$/i.test(cible) && [null, null, cible]);
  if (!m) return false;
  return tokensSelecteur(sel).some(t => proche(t, m[2]));
}
// sélecteur CSS #id/.classe introuvable tel quel : on cherche l'id/la classe la plus proche réellement utilisée
function selecteurIdClasseApprox($, selecteur) {
  const m = /^([.#])([\w-]+)(.*)$/.exec(selecteur.trim());
  if (!m) return null;
  const [, type, nom, reste] = m;
  const attr = type === '#' ? 'id' : 'class';
  let meilleur = null, meilleureDist = Infinity;
  $('[' + attr + ']').each((_, el) => {
    const vals = type === '#' ? [$(el).attr('id')] : ($(el).attr('class') || '').split(/\s+/);
    for (const v of vals) {
      if (!v || !proche(v, nom)) continue;
      const d = distance(v, nom);
      if (d < meilleureDist) { meilleur = v; meilleureDist = d; }
    }
  });
  return meilleur ? type + meilleur.replace(/([.#:\[\]])/g, '\\$1') + reste : null;
}
// champ de formulaire introuvable par id/name : on le retrouve par le libellé de sa ligne/son conteneur
function champParLibelle($, libelleRx, tagCible) {
  let trouve = $();
  $('tr, li, div, p, label, dt, dd').each((_, el) => {
    const texte = $(el).clone().find('input,select,textarea,button').remove().end().text();
    if (libelleRx.test(texte)) {
      const champ = $(el).find(tagCible || 'input,select,textarea').first();
      if (champ.length && !trouve.toArray().includes(champ.get(0))) trouve = trouve.add(champ);
    }
  });
  return trouve;
}

// ---------- JS : extraire le corps d'une fonction ----------
function corpsFonction(code, nom) {
  nom = nom.replace(/\$/g, '\\$');
  const rx = new RegExp(
    'function\\s+' + nom + '\\s*\\(|' + nom + '\\s*=\\s*(async\\s*)?function\\s*\\(|' + nom + '\\s*=\\s*\\([^)]*\\)\\s*=>', 'i');
  const m = rx.exec(code);
  if (!m) return null;
  const debut = code.indexOf('{', m.index);
  if (debut < 0) return null;
  let n = 0;
  for (let i = debut; i < code.length; i++) {
    if (code[i] === '{') n++;
    else if (code[i] === '}') { n--; if (n === 0) return code.slice(debut + 1, i); }
  }
  return code.slice(debut + 1); // accolade non fermée : on garde la suite
}
function avecFonctionsAppelees(code, corps, vus, profondeur) {
  if (profondeur <= 0) return corps;
  let ajout = '';
  const rx = /\b([a-zA-Z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = rx.exec(corps))) {
    const nom = m[1];
    if (vus.has(nom)) continue;
    vus.add(nom);
    const c = corpsFonction(code, nom);
    if (c != null) ajout += '\n' + avecFonctionsAppelees(code, c, vus, profondeur - 1);
  }
  return corps + ajout;
}
function erreurSyntaxeJs(code) {
  try { new vm.Script(code); return null; } catch (e) { return e.message; }
}
// fonction renommée ou mal orthographiée (ex. genereDefi pour genererDefi, afficheDate pour afficherDate)
function nomsFonctionsDeclarees(code) {
  const noms = new Set();
  const rx = /function\s+([a-zA-Z_$][\w$]*)\s*\(|\b([a-zA-Z_$][\w$]*)\s*=\s*(?:async\s*)?function\s*\(|\b([a-zA-Z_$][\w$]*)\s*=\s*\([^()]*\)\s*=>/g;
  let m;
  while ((m = rx.exec(code))) { const n = m[1] || m[2] || m[3]; if (n) noms.add(n); }
  return [...noms];
}
function corpsFonctionTolerant(code, nom, tolerant) {
  let corps = corpsFonction(code, nom);
  if (corps != null || tolerant === false) return { corps, nomTrouve: corps != null ? nom : null };
  let meilleur = null, meilleureDist = Infinity;
  for (const c of nomsFonctionsDeclarees(code)) {
    if (!proche(c, nom)) continue;
    const d = distance(c, nom);
    if (d < meilleureDist) { meilleur = c; meilleureDist = d; }
  }
  return meilleur ? { corps: corpsFonction(code, meilleur), nomTrouve: meilleur } : { corps: null, nomTrouve: null };
}

// ---------- évaluation d'une règle ----------
function evaluerRegle(r, ctx) {
  try {
    switch (r.type) {
      case 'fichier': {
        const fs = fichiersCorrespondants(ctx, r.fichier);
        return { ok: fs.length > 0, info: fs.length ? fs.map(f => f.rel).join(', ') : 'fichier absent : ' + r.fichier };
      }
      case 'regex': {
        const fs = fichiersCorrespondants(ctx, r.fichier);
        if (!fs.length) return { ok: false, info: 'fichier absent : ' + (r.fichier || '*') };
        const retirer = r.sansCommentaires !== false;
        const motifs = r.motifs || [r.motif];
        const min = r.min || 1;
        let meilleur = 0;
        for (const f of fs) {
          const c = contenu(f, retirer);
          // tous les motifs doivent être présents dans le même fichier
          const nb = Math.min(...motifs.map(m => compter(mkRegex(m, r.flags, ctx), c)));
          meilleur = Math.max(meilleur, nb);
        }
        if (r.global) { // compte cumulé sur tous les fichiers
          meilleur = Math.min(...motifs.map(m => fs.reduce((a, f) => a + compter(mkRegex(m, r.flags, ctx), contenu(f, retirer)), 0)));
        }
        if (r.proportionnel) return { ok: meilleur >= min, fraction: Math.min(meilleur / min, 1), info: `${meilleur}/${min} occurrence(s)` };
        return { ok: meilleur >= min, info: meilleur ? `${meilleur} occurrence(s)` : 'non trouvé' };
      }
      case 'html': {
        const fs = fichiersCorrespondants(ctx, r.fichier);
        if (!fs.length) return { ok: false, info: 'fichier absent : ' + r.fichier };
        let trouve = 0, approx = false;
        for (const f of fs) {
          // A5 : casse tolérée => document et sélecteur comparés en minuscules
          const src = contenu(f, true);
          const $ = cheerio.load(ctx.casse ? src.toLowerCase() : src);
          let sel = ctx.casse ? r.selecteur.toLowerCase() : r.selecteur;
          let els = $(sel).toArray();
          // id/classe renommé ou mal orthographié (ex. #defis, .boutton) : on cherche le plus proche utilisé
          if (!els.length && ctx.tolerantNomsFichiers !== false && /^[.#]/.test(sel.trim())) {
            const sel2 = selecteurIdClasseApprox($, sel);
            if (sel2) { els = $(sel2).toArray(); approx = els.length > 0; }
          }
          if (r.texte) { const rx = mkRegex(r.texte, r.flags, ctx); els = els.filter(e => { rx.lastIndex = 0; return rx.test($(e).text()); }); }
          if (r.motif) { const rx = mkRegex(r.motif, r.flags, ctx); els = els.filter(e => { rx.lastIndex = 0; return rx.test($.html(e)); }); }
          if (r.cibleIframe) {
            const noms = new Set($('iframe[name]').toArray().map(e => ($(e).attr('name') || '').toLowerCase()));
            els = els.filter(e => noms.has(($(e).attr('target') || '').toLowerCase()));
          }
          // champ de formulaire non trouvé par id/name : on le cherche par le libellé de sa ligne (ex. « Nom du pilote »)
          if (!els.length && r.libelle && ctx.tolerantNomsFichiers !== false) {
            const trouves = champParLibelle($, mkRegex(r.libelle, 'i', ctx), r.tagCible);
            els = trouves.toArray(); approx = els.length > 0;
          }
          trouve = Math.max(trouve, els.length);
        }
        const min = r.min || 1;
        const suffixe = approx ? ' (identifiant/libellé approché accepté)' : '';
        if (r.proportionnel) return { ok: trouve >= min, fraction: Math.min(trouve / min, 1), info: `${trouve}/${min} élément(s) « ${r.selecteur} »${suffixe}` };
        return { ok: trouve >= min, info: `${trouve} élément(s) « ${r.selecteur} »${suffixe}` };
      }
      case 'css': {
        const fs = fichiersCorrespondants(ctx, r.fichier || '*.css');
        if (!fs.length) return { ok: false, info: 'feuille de style absente' };
        const regles = fs.flatMap(f => parserCss(f.texte));
        const rxP = new RegExp('^(' + r.propriete + ')$', 'i');
        const rxV = r.valeur ? new RegExp(r.valeur, 'i') : null;
        const candidates = regles.filter(rg => rg.decls.some(d => rxP.test(d.prop) && (!rxV || rxV.test(d.val))));
        if (!r.selecteurs || !r.selecteurs.length) {
          return { ok: candidates.length > 0, info: candidates.length ? 'déclaré dans : ' + candidates.map(c => c.selecteurs.join(',')).join(' | ') : 'déclaration absente' };
        }
        const manquants = r.selecteurs.filter(c => !candidates.some(rg => rg.selecteurs.some(s => selecteurCorrespondTolerant(s, c))));
        return { ok: manquants.length === 0, fraction: (r.selecteurs.length - manquants.length) / r.selecteurs.length,
          info: manquants.length ? 'non appliqué à : ' + manquants.join(', ') : 'appliqué à : ' + r.selecteurs.join(', ') };
      }
      case 'js': {
        const fs = fichiersCorrespondants(ctx, r.fichier || '*.js');
        if (!fs.length) return { ok: false, info: 'fichier JS absent' };
        const tout = fs.map(f => contenu(f, true)).join('\n');
        for (const f of fs) {
          const { corps: corpsBrut, nomTrouve } = corpsFonctionTolerant(contenu(f, true), r.fonction, ctx.tolerantNomsFichiers);
          if (corpsBrut == null) continue;
          let corps = corpsBrut;
          const suffixe = nomTrouve !== r.fonction ? ` (sous le nom ${nomTrouve})` : '';
          // solutions équivalentes : le contrôle peut être délégué à des fonctions auxiliaires (lettres(), verif()…)
          if (r.suivreAppels !== false) corps = avecFonctionsAppelees(tout, corps, new Set([nomTrouve]), 3);
          if (!r.motif) return { ok: true, info: `fonction ${r.fonction} trouvée${suffixe}` };
          const n = compter(mkRegex(r.motif, r.flags, ctx), corps);
          return { ok: n >= (r.min || 1), info: n ? `motif trouvé dans ${r.fonction}${suffixe}` : `motif absent de ${r.fonction}${suffixe}` };
        }
        return { ok: false, info: `fonction ${r.fonction} absente` };
      }
      case 'variable': {
        // variable globale { fichier, nom } : déclaration explicite, affectation implicite (sans let/var/const,
        // y compris dans une fonction) ou valeur conservée/retrouvée autrement via le DOM — tolérance maximale :
        // ce qui compte est que le rôle (mémoriser une valeur entre deux appels) soit assuré, pas la syntaxe exacte.
        const fs = fichiersCorrespondants(ctx, r.fichier || '*.js');
        if (!fs.length) return { ok: false, info: 'fichier JS absent' };
        const nom = (r.nom || '').replace(/[^\w$]/g, '');
        const decl = new RegExp('\\b(let|var|const)\\s+' + nom + '\\s*=', 'i');
        const affect = new RegExp('(^|[^.\\w$])' + nom + '\\s*=(?!=)', 'i');
        const dom = new RegExp('getElementById\\s*\\(\\s*["\']' + nom + '["\']\\s*\\)', 'i');
        for (const f of fs) {
          const c = contenu(f, true);
          if (decl.test(c)) return { ok: true, info: `variable ${r.nom} déclarée` };
          if (affect.test(c)) return { ok: true, info: `variable ${r.nom} affectée (globale implicite acceptée)` };
          if (dom.test(c)) return { ok: true, info: `valeur de ${r.nom} conservée via le DOM (#${r.nom})` };
        }
        return { ok: false, info: `variable ${r.nom} introuvable (ni déclarée, ni affectée, ni conservée via le DOM)` };
      }
      case 'ou': {
        const res = r.regles.map(x => evaluerRegle(x, ctx));
        const ok = res.find(x => x.ok);
        return ok ? { ok: true, info: ok.info } : { ok: false, fraction: Math.max(0, ...res.map(x => x.fraction || 0)), info: res.map(x => x.info).join(' / ') };
      }
      case 'et': {
        const res = r.regles.map(x => evaluerRegle(x, ctx));
        const n = res.filter(x => x.ok).length;
        return { ok: n === res.length, fraction: n / res.length, info: res.map(x => (x.ok ? '✓ ' : '✗ ') + x.info).join(' ; ') };
      }
      case 'manuel':
        return { ok: false, manuel: true, info: 'à noter manuellement' };
      default:
        return { ok: false, info: 'type de règle inconnu : ' + r.type };
    }
  } catch (e) {
    return { ok: false, info: 'règle invalide : ' + e.message };
  }
}

function arrondir(x, pas) { pas = pas || 0.25; return Math.round(x / pas + 1e-9) * pas; }
// tolérance maximale : chaque critère est arrondi au quart de point SUPÉRIEUR (jamais défavorable à l'élève)
function arrondirSuperieur(x, pas) { pas = pas || 0.25; return Math.ceil(x / pas - 1e-9) * pas; }

/**
 * Évalue un critère. Retourne { points, max, details[], manuel, observations[] }.
 * ctx.tolerant = élève en difficulté avec « ignorer erreurs mineures ».
 * ctx.partielsElargis = élève en difficulté avec « points partiels élargis ».
 */
function evaluerCritere(crit, ctx) {
  const regles = crit.regles || [];
  if (!regles.length || regles.every(r => r.type === 'manuel')) {
    return { points: null, max: crit.points, details: [], manuel: true, observations: ['Critère à noter par l\'enseignant'] };
  }
  let total = 0, obtenu = 0;
  const details = [];
  for (const r of regles) {
    const pts = r.pts == null ? 1 : r.pts;
    total += pts;
    let res = evaluerRegle(r, ctx);
    // A7 / A11 : variante souple acceptée (message reformulé, mise en page par margin…)
    if (!res.ok && r.souple && ctx.souple) {
      const s = evaluerRegle(r.souple, ctx);
      if (s.ok) res = { ok: true, info: s.info + ' — ' + (r.souple.label || 'variante acceptée') };
    }
    // les règles et / ou / css (plusieurs cibles) / proportionnel donnent une fraction
    let part = res.ok ? 1 : (res.fraction || 0);
    // tentative visible (indice) : 50 % pour un élève en difficulté, 0 sinon (sauf partielStandard)
    if (part < 1 && r.indice) {
      const fs = fichiersCorrespondants(ctx, r.fichier);
      const vu = fs.some(f => mkRegex(r.indice, 'i', ctx).test(contenu(f, true)));
      if (vu) {
        const bonus = ctx.partielsElargis ? 0.5 : (r.partielStandard || 0);
        if (bonus > part) { part = bonus; res.info += ' (tentative partiellement valorisée)'; }
      }
    }
    obtenu += pts * part;
    details.push({ label: r.label || r.type, ok: part >= 1, fraction: part, info: res.info });
  }
  const arr = ctx.arrondiSuperieur !== false ? arrondirSuperieur : arrondir;
  const pts = total ? arr((obtenu / total) * crit.points, ctx.pas) : 0;
  return { points: Math.min(pts, crit.points), max: crit.points, details, manuel: false, observations: [] };
}

/** Noms de fichiers précis (sans joker) attendus par les règles d'une grille. */
function fichiersAttendus(criteres) {
  const noms = new Set();
  const parcourir = regles => {
    for (const r of regles || []) {
      for (const f of [].concat(r.fichier || [])) if (/^[\w.-]+\.\w+$/.test(f)) noms.add(f.toLowerCase());
      if (r.regles) parcourir(r.regles);
      if (r.souple) parcourir([r.souple]);
    }
  };
  for (const c of criteres || []) parcourir(c.regles);
  return noms;
}

/** Dossier de travail = dossier commun à tous les fichiers de l'élève (ex. SW123456/ ou www/SW123456/). */
function racineCommune(fichiers) {
  const dirs = fichiers.map(f => f.rel.split('/').slice(0, -1));
  if (!dirs.length) return [];
  let pref = dirs[0];
  for (const d of dirs) {
    let i = 0;
    while (i < pref.length && i < d.length && pref[i].toLowerCase() === d[i].toLowerCase()) i++;
    pref = pref.slice(0, i);
  }
  return pref;
}

/**
 * Pénalités globales détectées automatiquement (−x par type d'erreur, appliquées une seule fois).
 * opts.attendus : fichiers attendus (Set) ; opts.racine : segments du dossier de travail ;
 * opts.fichierHorsDossier : A10, fichier présent mais dans un sous-dossier (défaut : actif).
 */
function detecterErreurs(ctx, opts = {}) {
  const erreurs = [];
  const UNITE = /^(padding|margin|width|height|min-width|max-width|min-height|max-height|font-size|top|left|right|bottom|border-width|border-radius|line-height|letter-spacing)(-(top|right|bottom|left))?$/;
  for (const f of ctx.fichiers) {
    if (/\.css$/i.test(f.rel)) {
      for (const rg of parserCss(f.texte)) for (const d of rg.decls) {
        if (d.prop === 'line-height') continue; // sans unité = autorisé
        if (UNITE.test(d.prop) && d.val.split(/\s+/).some(t => /^[1-9]\d*(\.\d+)?$/.test(t))) {
          erreurs.push({ fichier: f.rel, prop: d.prop, type: 'unité CSS manquante', message: `${rg.selecteurs.join(',')} { ${d.prop}: ${d.val} }` });
        }
      }
    }
    if (/\.js$/i.test(f.rel)) {
      const e = erreurSyntaxeJs(f.texte || '');
      if (e) erreurs.push({ fichier: f.rel, type: 'syntaxe JS', message: e });
    }
    if (/\.php$/i.test(f.rel)) {
      const t = f.texte || '';
      const o = (t.match(/\{/g) || []).length, c = (t.match(/\}/g) || []).length;
      if (o !== c) erreurs.push({ fichier: f.rel, type: 'accolades PHP', message: `${o} « { » pour ${c} « } »` });
    }
  }
  // A10 : un fichier demandé est présent mais pas dans le dossier de travail (rangé dans un sous-dossier)
  if (opts.fichierHorsDossier !== false && opts.attendus) {
    const profondeur = f => f.rel.split('/').length - 1 - (opts.racine || []).length;
    for (const nom of opts.attendus) {
      const trouves = ctx.fichiers.filter(f => f.rel.split('/').pop().toLowerCase() === nom);
      if (trouves.length && trouves.every(f => profondeur(f) > 0)) {
        erreurs.push({ fichier: trouves[0].rel, type: 'fichier hors du dossier de travail', message: `« ${trouves[0].rel.split('/').pop()} » est dans un sous-dossier (${trouves[0].rel})` });
      }
    }
  }
  return erreurs;
}

module.exports = { evaluerCritere, evaluerRegle, detecterErreurs, fichiersAttendus, racineCommune, parserCss, corpsFonction, arrondir, arrondirSuperieur, fichiersCorrespondants, distance, proche };
