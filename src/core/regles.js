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

// ---------- utilitaires fichiers ----------
function globVersRegex(g) {
  const e = g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp('^' + e + '$', 'i');
}
function fichiersCorrespondants(ctx, motifFichier) {
  if (!motifFichier) return ctx.fichiers;
  const motifs = Array.isArray(motifFichier) ? motifFichier : [motifFichier];
  const rx = motifs.map(globVersRegex);
  return ctx.fichiers.filter(f => {
    const nom = f.rel.split('/').pop();
    return rx.some(r => r.test(nom) || r.test(f.rel));
  });
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
function selecteurCorrespond(sel, cible) {
  // cible simple (h1, header, fieldset…) => cherchée comme mot dans le sélecteur
  if (/^[a-z][a-z0-9-]*$/i.test(cible)) {
    return new RegExp('(^|[\\s>+~])' + cible + '(?=$|[.#:\\[\\s>+~])', 'i').test(sel);
  }
  return new RegExp(cible, 'i').test(sel);
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
        let trouve = 0;
        for (const f of fs) {
          // A5 : casse tolérée => document et sélecteur comparés en minuscules
          const src = contenu(f, true);
          const $ = cheerio.load(ctx.casse ? src.toLowerCase() : src);
          let els = $(ctx.casse ? r.selecteur.toLowerCase() : r.selecteur).toArray();
          if (r.texte) { const rx = mkRegex(r.texte, r.flags, ctx); els = els.filter(e => { rx.lastIndex = 0; return rx.test($(e).text()); }); }
          if (r.motif) { const rx = mkRegex(r.motif, r.flags, ctx); els = els.filter(e => { rx.lastIndex = 0; return rx.test($.html(e)); }); }
          if (r.cibleIframe) {
            const noms = new Set($('iframe[name]').toArray().map(e => ($(e).attr('name') || '').toLowerCase()));
            els = els.filter(e => noms.has(($(e).attr('target') || '').toLowerCase()));
          }
          trouve = Math.max(trouve, els.length);
        }
        const min = r.min || 1;
        if (r.proportionnel) return { ok: trouve >= min, fraction: Math.min(trouve / min, 1), info: `${trouve}/${min} élément(s) « ${r.selecteur} »` };
        return { ok: trouve >= min, info: `${trouve} élément(s) « ${r.selecteur} »` };
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
        const manquants = r.selecteurs.filter(c => !candidates.some(rg => rg.selecteurs.some(s => selecteurCorrespond(s, c))));
        return { ok: manquants.length === 0, fraction: (r.selecteurs.length - manquants.length) / r.selecteurs.length,
          info: manquants.length ? 'non appliqué à : ' + manquants.join(', ') : 'appliqué à : ' + r.selecteurs.join(', ') };
      }
      case 'js': {
        const fs = fichiersCorrespondants(ctx, r.fichier || '*.js');
        if (!fs.length) return { ok: false, info: 'fichier JS absent' };
        const tout = fs.map(f => contenu(f, true)).join('\n');
        for (const f of fs) {
          let corps = corpsFonction(contenu(f, true), r.fonction);
          if (corps == null) continue;
          // solutions équivalentes : le contrôle peut être délégué à des fonctions auxiliaires (lettres(), verif()…)
          if (r.suivreAppels !== false) corps = avecFonctionsAppelees(tout, corps, new Set([r.fonction]), 3);
          if (!r.motif) return { ok: true, info: `fonction ${r.fonction} trouvée` };
          const n = compter(mkRegex(r.motif, r.flags, ctx), corps);
          return { ok: n >= (r.min || 1), info: n ? `motif trouvé dans ${r.fonction}` : `motif absent de ${r.fonction}` };
        }
        return { ok: false, info: `fonction ${r.fonction} absente` };
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
  const pts = total ? arrondir((obtenu / total) * crit.points, ctx.pas) : 0;
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

module.exports = { evaluerCritere, evaluerRegle, detecterErreurs, fichiersAttendus, racineCommune, parserCss, corpsFonction, arrondir, fichiersCorrespondants };
