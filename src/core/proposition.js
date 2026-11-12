'use strict';
/*
 * Proposition automatique d'une grille de correction à partir du texte de l'énoncé (hors ligne).
 * Repère la structure (Etape / Partie / Exercice, questions 1) 2)…, sous-questions a) b)…),
 * puis, pour chaque question, les éléments vérifiables : fichiers, balises, liens, fonctions JS,
 * propriétés CSS, requêtes SQL, messages… Chaque élément devient une règle automatique.
 * Le résultat est une PROPOSITION : l'enseignant ajuste libellés, barème et règles.
 */

// Parties du devoir : on garde le mot et le titre du sujet (Exercice 2 : Les tableaux, Partie A, Activité 1…)
const RX_ETAPE = /^\s*([ée]tape|partie|exercice|activit[ée]|t[âa]che|probl[èe]me|situation|dossier|section|travail)\s*(?:n[°o]\s*)?(\d+|[IVX]+|[A-H])\b\s*(?:\([^)]*\))?\s*[:.\-–]?\s*(.*)$/i;
const RX_QUESTION = /^\s*(?:question\s*|q\s*)?(\d{1,2})\s*[)\.\-:]\s+(.+)$/i;
const RX_SOUS = /^\s*([a-h])\s*[)\.]\s+(.+)$/;
const majuscule = s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

const CSS_MOTS = [
  [/police|font/i, 'font-family|font', 'police'],
  [/majuscule|minuscule|capitali/i, 'text-transform', 'casse du texte'],
  [/arri[èe]re-?plan|fond/i, 'background(-color)?', 'arrière-plan'],
  [/couleur du texte|couleur d[eu] (texte|police)/i, 'color', 'couleur du texte'],
  [/marge int[ée]rieure|padding/i, 'padding(-\\w+)?', 'marge intérieure'],
  [/marge ext[ée]rieure|margin/i, 'margin(-\\w+)?', 'marge extérieure'],
  [/bordure|border/i, 'border(-\\w+)?', 'bordure'],
  [/ombre/i, 'box-shadow|text-shadow', 'ombre'],
  [/gras/i, 'font-weight|font', 'gras'],
  [/italique/i, 'font-style|font', 'italique'],
  [/soulign/i, 'text-decoration(-line)?', 'soulignement'],
  [/puce/i, 'list-style(-type)?', 'style de puce'],
  [/align|centr/i, 'text-align', 'alignement'],
  [/largeur|width/i, 'width', 'largeur'],
  [/hauteur|height/i, 'height', 'hauteur'],
  [/taille (de la )?police|font-size/i, 'font-size', 'taille de police'],
  [/m[êe]me ligne|à droite|à gauche|flottant/i, 'float|display|margin(-left|-right)?', 'disposition'],
  [/arrondi|radius/i, 'border-radius', 'coins arrondis'],
  [/cach|masqu|visib/i, 'display|visibility', 'visibilité']
];

const nettoyer = s => s.replace(/[“”«»"]/g, '"').replace(/[’]/g, "'").replace(/\s+/g, ' ').trim();
const echapper = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function motifSouple(texte) {
  // apostrophes, accents et espaces tolérés
  return echapper(texte.trim()).replace(/'/g, '.').replace(/[éèêë]/gi, '[éèêëe]').replace(/[àâ]/gi, '[àâa]').replace(/\s+/g, '\\s*');
}

/** Découpe l'énoncé en feuilles (questions à noter). */
function structure(texte) {
  const lignes = texte.split(/\r?\n/).map(nettoyer).filter(Boolean);
  const feuilles = [];
  let etape = '', etapeVue = false, q = null, sq = null, courant = null, consignesEtape = '';
  const pointsParties = {};
  const nouvelle = (question, sous, titre) => {
    courant = { etape, question, sousQuestion: sous, titre, texte: titre, consignes: consignesEtape };
    feuilles.push(courant);
  };
  for (const l of lignes) {
    let m;
    if ((m = RX_ETAPE.exec(l)) && l.length < 120 && !/^(partie|section)\s+\d+\s+(du|de la|des)\b/i.test(l)) {
      // nom de la partie tel qu'écrit dans le sujet, avec son titre s'il est court
      const titre = m[3].replace(/\s*\(.*$/, '').trim();
      etape = `${majuscule(m[1])} ${m[2].toUpperCase()}` + (titre && titre.length <= 50 ? ' : ' + titre : '');
      // points annoncés dans le titre : « Exercice 2 (8 points) »
      const p = /\(?\s*(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:points?|pts?)\s*\)?/i.exec(l);
      if (p) pointsParties[etape] = parseFloat(p[1].replace(',', '.'));
      etapeVue = true; q = null; sq = null; courant = null; consignesEtape = '';
      continue;
    }
    if ((m = RX_QUESTION.exec(l)) && (etapeVue || feuilles.length || /^1\b/.test(m[1]))) {
      q = m[1]; sq = null;
      nouvelle(q, '', m[2]);
      continue;
    }
    if ((m = RX_SOUS.exec(l)) && !q && etapeVue) {
      // partie sans question numérotée : a), b)… sont les questions
      sq = null; nouvelle(m[1], '', m[2]);
      courant.contexte = consignesEtape;
      continue;
    }
    if ((m = RX_SOUS.exec(l)) && q) {
      // la question parente devient un simple titre si elle a des sous-questions
      const parent = feuilles[feuilles.length - 1];
      if (parent && parent.question === q && !parent.sousQuestion && !sq) {
        feuilles.pop();
        courant = null;
        sq = m[1];
        nouvelle(q, sq, m[2]);
        courant.contexte = parent.texte;
      } else { sq = m[1]; nouvelle(q, sq, m[2]); courant.contexte = parent?.contexte || ''; }
      continue;
    }
    if (courant) courant.texte += '\n' + l;
    else consignesEtape += '\n' + l;
  }
  // sujet sans parties : la grille est organisée par question
  if (!etapeVue) for (const f of feuilles) f.etape = `Question ${f.question}`;
  feuilles.pointsParties = pointsParties;
  return feuilles;
}

/** Règles détectées dans le texte d'une question. */
function reglesDepuisTexte(f) {
  const t = f.texte;
  const tout = (f.contexte ? f.contexte + '\n' : '') + t;
  const regles = [];
  const ajout = r => { if (!regles.some(x => JSON.stringify({ ...x, label: '' }) === JSON.stringify({ ...r, label: '' }))) regles.push({ pts: 1, ...r }); };
  const fichiers = [...new Set((tout.match(/[\w-]+\.(html?|css|js|php|sql|py)\b/gi) || []).map(x => x))];
  const html = fichiers.find(x => /\.html?$/i.test(x));
  const css = fichiers.find(x => /\.css$/i.test(x)) || '*.css';
  const js = fichiers.find(x => /\.js$/i.test(x)) || '*.js';
  const php = fichiers.find(x => /\.php$/i.test(x));

  // nature de la question : on ne cherche que les règles qui la concernent
  const estCss = (/r[èe]gles?\s+(?:css|permettant)|mises? en forme/i.test(t) && /\.css/i.test(t)) || /\bcss\b|mise en forme/i.test(f.etape);
  const estJs = /d[ée]velopper/i.test(t) && /fonction/i.test(t);
  const estPhp = /cr[ée]er (?:le fichier|la page)\s+"?[\w-]+\.php/i.test(t);
  // question de cours / théorique : jugée par le correcteur
  const estCours = /^\s*(d[ée]finir|citer|expliquer|donner|justifier|comparer|d[ée]crire|r[ée]pondre|quel(le)?s?|pourquoi|indiquer|pr[ée]ciser|identifier|nommer|compl[ée]ter le tableau|[ée]crire un algorithme)\b/i.test(f.titre);
  if (estCours) return [{ type: 'manuel', label: 'réponse rédigée à juger' }];
  const estHtml = !estCss && !estJs && !estPhp;
  // création de fichiers
  if (estPhp && /afficher la liste|liste des/i.test(t)) ajout({ type: 'regex', fichier: (t.match(/[\w-]+\.php/i) || ['*.php'])[0], motif: 'while\\s*\\(.*fetch|foreach\\s*\\(', label: 'parcours des enregistrements' });
  for (const m of t.matchAll(/cr[ée]er\s+(?:la page|le fichier|le script|la feuille de style)\s+"?([\w-]+\.\w+)"?/gi)) ajout({ type: 'fichier', fichier: m[1], label: `fichier ${m[1]}` });

  // ----- base de données -----
  if (/base de donn[ée]es/i.test(tout) && /cr[ée]er une base|attribuant le nom/i.test(t)) ajout({ type: 'regex', fichier: '*.sql', sansCommentaires: false, motif: '(Base de donn[ée]es|Database)\\s*:|CREATE DATABASE', label: 'base de données créée' });
  if (/importer/i.test(t) && /\.sql/i.test(t)) ajout({ type: 'regex', fichier: '*.sql', motif: 'CREATE TABLE', label: 'tables importées' });
  if (/cl[ée]s? primaires?/i.test(t)) ajout({ type: 'regex', fichier: '*.sql', motif: 'PRIMARY KEY', min: 2, proportionnel: true, label: 'clés primaires' });
  for (const m of t.matchAll(/cr[ée]er la table\s+"?(\w+)"?/gi)) ajout({ type: 'regex', fichier: '*.sql', motif: `CREATE TABLE\\s+\`?${m[1]}\`?`, label: `table ${m[1]}` });
  if (/relations?|cl[ée]s? [ée]trang[èe]res?/i.test(t)) ajout({ type: 'regex', fichier: '*.sql', motif: 'FOREIGN KEY', min: 2, proportionnel: true, label: 'relations (clés étrangères)' });
  if (/exporter/i.test(t) && /sql/i.test(t)) ajout({ type: 'fichier', fichier: '*.sql', label: 'export SQL' });

  // ----- HTML : balises, liens, formulaire -----
  const cible = html || '*.html';
  if (estHtml) for (const m of new Set(t.match(/<(header|nav|main|section|aside|footer|article|h[1-6]|ul|ol|table|form|fieldset|legend|iframe|img|video|audio|select|textarea|label|button|figure)>/gi) || [])) {
    const tag = m.slice(1, -1).toLowerCase();
    ajout({ type: 'html', fichier: cible, selecteur: tag, label: `élément <${tag}>` });
  }
  for (const m of t.matchAll(/(?:lien vers (?:la page )?|vers la page )"?([\w-]+\.(?:html?|php))"?/gi)) ajout({ type: 'html', fichier: cible, selecteur: `a[href*="${m[1]}"]`, label: `lien vers ${m[1]}` });
  for (const m of t.matchAll(/l'image (?:nomm[ée]e )?"?([\w-]+\.(?:jpe?g|png|gif|webp))"?/gi)) ajout({ type: 'html', fichier: cible, selecteur: `img[src*="${m[1]}"]`, label: `image ${m[1]}` });
  for (const m of t.matchAll(/contient le texte\s*"\s*([^"]{3,80})"/gi)) ajout({ type: 'regex', fichier: cible, motif: motifSouple(m[1]), label: `texte « ${m[1].trim()} »` });
  if (/lier|reli[ée]e?s? (?:au|aux) fichiers?/i.test(t)) {
    for (const f2 of fichiers.filter(x => /\.css$/i.test(x))) ajout({ type: 'html', fichier: cible, selecteur: `link[href*="${f2}" i]`, label: `liaison ${f2}` });
    for (const f2 of fichiers.filter(x => /\.js$/i.test(x))) ajout({ type: 'html', fichier: cible, selecteur: `script[src*="${f2}" i]`, label: `liaison ${f2}` });
  }
  const fn = (t.match(/fonction\s+(?:javascript\s+)?"?([a-zA-Z_]\w*)"?/i) || [])[1];
  // variable globale (ex. « Déclarer une variable globale code ») : tolérance maximale — déclarée, affectée
  // implicitement ou valeur retrouvée autrement (DOM) sont toutes acceptées, voir regles.js type « variable ».
  for (const m of t.matchAll(/variable\s+globale\s+"?([a-zA-Z_]\w*)"?/gi)) ajout({ type: 'variable', fichier: js, nom: m[1], label: `variable globale ${m[1]}` });
  if (estHtml && /clic sur le bouton|formulaire/i.test(t) && php) {
    ajout({ type: 'html', fichier: cible, selecteur: `form[action*="${php}"]`, label: `action ${php}` });
    ajout({ type: 'html', fichier: cible, selecteur: 'form[method="post" i]', label: 'méthode post' });
    if (fn) ajout({ type: 'html', fichier: cible, selecteur: 'form', motif: `onsubmit\\s*=\\s*["']\\s*return\\s+${fn}\\s*\\(`, label: `onsubmit="return ${fn}()"` });
  }
  if (estHtml && /obligatoire|required/i.test(t)) ajout({ type: 'html', fichier: cible, selecteur: '[required]', label: 'champ obligatoire (required)' });
  if (estHtml && /liste d[ée]roulante/i.test(t)) ajout({ type: 'html', fichier: cible, selecteur: 'select', label: 'liste déroulante' });
  if (estHtml && /boutons? radio/i.test(t)) ajout({ type: 'html', fichier: cible, selecteur: 'input[type="radio"]', min: 2, label: 'boutons radio' });
  if (estHtml && /cases? [àa] cocher/i.test(t)) ajout({ type: 'html', fichier: cible, selecteur: 'input[type="checkbox"]', label: 'cases à cocher' });

  // ----- CSS -----
  if (estCss) {
    for (const [rx, prop, nom] of CSS_MOTS) if (rx.test(t)) ajout({ type: 'css', fichier: css, propriete: prop, label: `déclaration : ${nom}` });
    for (const c of new Set(t.match(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi) || [])) ajout({ type: 'css', fichier: css, propriete: '[a-z-]+', valeur: echapper(c), label: `couleur ${c}` });
  }

  // ----- JavaScript -----
  if (fn && estJs) {
    ajout({ type: 'js', fichier: js, fonction: fn, label: `fonction ${fn}` });
    if (/contr[ôo]le|valid|v[ée]rifi/i.test(t)) ajout({ type: 'js', fichier: js, fonction: fn, motif: 'return\\s+false', label: `${fn} bloque l'envoi (return false)` });
    if (/rouge|arri[èe]re-?plan/i.test(t)) ajout({ type: 'js', fichier: js, fonction: fn, motif: 'style\\.\\w+\\s*=', label: `${fn} modifie le style` });
    if (/s[ée]lection|cocher|choisir/i.test(t)) ajout({ type: 'js', fichier: js, fonction: fn, motif: '\\.checked|selectedIndex', label: `${fn} teste la sélection` });
  }

  // ----- PHP -----
  if (estPhp) {
    const fp = php || '*.php';
    if (/ins[ée]rer|ajout|enregistr/i.test(t)) ajout({ type: 'regex', fichier: fp, motif: 'insert\\s+into', label: 'requête INSERT' });
    if (/afficher|liste|v[ée]rifi|existe/i.test(t)) ajout({ type: 'regex', fichier: fp, motif: 'select[\\s\\S]{0,300}?from', label: 'requête SELECT' });
    if (/ins[ée]r|afficher|v[ée]rifi|liste/i.test(t)) {
      ajout({ type: 'regex', fichier: '*.php', global: true, motif: 'mysqli_connect|new\\s+mysqli|new\\s+PDO', label: 'connexion au serveur' });
      ajout({ type: 'regex', fichier: fp, motif: '\\$_(POST|GET|REQUEST)\\s*\\[', label: 'récupération des données' });
      ajout({ type: 'regex', fichier: fp, motif: 'mysqli_query|->\\s*query|->\\s*execute|->\\s*exec', label: 'exécution de la requête' });
    }
    for (const m of t.matchAll(/message\s*"\s*([^"]{3,80})"/gi)) {
      ajout({ type: 'regex', fichier: fp, motif: motifSouple(m[1]), label: `message « ${m[1].trim()} »`,
        souple: { type: 'regex', fichier: fp, motif: '(echo|print)', label: 'message reformulé accepté' } });
    }
  }
  return regles;
}

function arrondir(x) { return Math.round(x * 4) / 4; }

/** Coupe le titre d'une question pour en faire un libellé court. */
function libelleCourt(titre) {
  return titre.replace(/\s*:$/, '')
    .replace(/\s+(tout en|permettant|qui permet|afin d|situ[ée]|conform[ée]ment|en lui attribuant|dans votre dossier|via le formulaire|selon le format).*$/i, '')
    .slice(0, 90);
}

/**
 * Lit le tableau « Grille d'évaluation / Barème » souvent imprimé à la fin de l'énoncé
 * (ex. « Question 1 2 3 4 / Points 1.75 4 5.75 7.25 1.25 ») et renvoie les points par groupe.
 */
function baremeEnonce(texte, feuilles) {
  const i = texte.search(/grille d.[ée]valuation|bar[èe]me/i);
  if (i < 0) return null;
  const bloc = texte.slice(i);
  const apres = bloc.slice(bloc.search(/points?/i) + 6);
  const pts = (apres.match(/\b\d{1,2}(?:[.,]\d{1,2})?\b/g) || []).map(x => parseFloat(x.replace(',', '.'))).filter(x => x > 0 && x <= 40);
  if (pts.length < 2) return null;
  // groupes possibles : chaque étape est soit globale, soit détaillée par question
  const etapes = [...new Set(feuilles.map(f => f.etape))];
  const questions = e => [...new Set(feuilles.filter(f => f.etape === e).map(f => f.question))];
  for (let masque = (1 << etapes.length) - 1; masque >= 0; masque--) {
    const groupes = [];
    etapes.forEach((e, k) => {
      if (masque & (1 << k)) questions(e).forEach(q => groupes.push(f => f.etape === e && f.question === q));
      else groupes.push(f => f.etape === e);
    });
    if (groupes.length === pts.length) return groupes.map((g, k) => ({ filtre: g, points: pts[k] }));
  }
  return null;
}

/**
 * Propose une grille. Si `grilleExistante` contient déjà des colonnes (grille Excel importée),
 * leurs identifiants et barèmes sont conservés : on remplit seulement libellés et règles.
 */
function proposerGrille(texteEnonce, { total = 40, noteSur = 20, grilleExistante = null } = {}) {
  const feuilles = structure(texteEnonce || '');
  if (!feuilles.length) throw new Error('Aucune question repérée dans l\'énoncé (numérotation 1), 2)… ou a), b)… attendue).');
  for (const f of feuilles) {
    // le tableau de barème imprimé en fin d'énoncé ne fait pas partie de la dernière question
    f.texte = f.texte.split(/\n(?:grille d.[ée]valuation|bar[èe]me)/i)[0];
    f.regles = reglesDepuisTexte(f);
    f.libelle = libelleCourt(f.titre);
  }
  const existants = grilleExistante?.criteres?.filter(c => c.points > 0) || [];
  if (existants.length) {
    // association par (étape, question, sous-question) ; les règles sont réparties entre les colonnes
    const cle = (e, q, s) => `${String(e).match(/\d+/)?.[0] || ''}|${q}|${s || ''}`;
    for (const f of feuilles) {
      const cols = existants.filter(c => cle(c.etape, c.question, c.sousQuestion) === cle(f.etape, f.question, f.sousQuestion));
      if (!cols.length) continue;
      const n = f.regles.length;
      let i = 0;
      const somme = cols.reduce((a, c) => a + c.points, 0);
      cols.forEach((c, k) => {
        const part = k === cols.length - 1 ? n - i : Math.max(n ? 1 : 0, Math.round(n * c.points / somme));
        c.regles = f.regles.slice(i, i + part);
        i += part;
        c.libelle = cols.length > 1 ? `${f.libelle} (${c.regles.map(r => r.label).slice(0, 3).join(', ') || 'partie ' + (k + 1)})` : f.libelle;
        if (!c.regles.length) c.regles = [{ type: 'manuel', label: 'à noter' }];
        c.propose = true;
      });
    }
    return { ...grilleExistante, propose: true, criteres: grilleExistante.criteres };
  }
  // nouvelle grille : barème de l'énoncé s'il existe, sinon proportionnel au nombre d'éléments vérifiables
  const repartir = (liste, somme) => {
    const poids = liste.map(f => Math.max(1, f.regles.length));
    const tp = poids.reduce((a, b) => a + b, 0);
    let reste = somme;
    liste.forEach((f, i) => {
      f.points = i === liste.length - 1 ? reste : Math.max(0.25, arrondir(somme * poids[i] / tp));
      reste = Math.round((reste - f.points) * 100) / 100;
    });
  };
  const bareme = baremeEnonce(texteEnonce, feuilles);
  const pp = feuilles.pointsParties || {};
  const parties = [...new Set(feuilles.map(f => f.etape))];
  let sourceBareme = 'réparti selon le nombre d\'éléments à vérifier';
  if (!bareme && parties.length > 1 && parties.every(p => pp[p] > 0)) {
    // points annoncés dans les titres des parties (Exercice 1 (5 points)…)
    const s = parties.reduce((a, p) => a + pp[p], 0);
    for (const p of parties) repartir(feuilles.filter(f => f.etape === p), arrondir(pp[p] * total / s));
    sourceBareme = `tiré des points annoncés dans le sujet (${parties.map(p => pp[p]).join(' / ')} sur ${s}${s !== total ? ', ramené sur ' + total : ''})`;
  } else if (bareme) {
    const s = bareme.reduce((a, g) => a + g.points, 0);
    for (const g of bareme) repartir(feuilles.filter(g.filtre), arrondir(g.points * total / s));
    sourceBareme = `tiré du barème de l'énoncé (${bareme.map(g => g.points).join(' / ')} sur ${s}, ramené sur ${total})`;
  } else repartir(feuilles, total);
  const criteres = feuilles.map((f, i) => {
    const p = Math.max(0, f.points);
    const id = 'Q' + (i + 1);
    return {
      id, colonne: id, etape: f.etape, question: f.question, sousQuestion: f.sousQuestion, libelle: f.libelle,
      points: p, regles: f.regles.length ? f.regles : [{ type: 'manuel', label: 'à noter' }], propose: true
    };
  });
  const somme = criteres.reduce((a, c) => a + c.points, 0);
  return { titre: 'Grille proposée', total: Math.round(somme * 100) / 100, noteSur, criteres, propose: true,
    remarques: ['Grille proposée automatiquement à partir de l\'énoncé : vérifiez libellés, barème et règles.', 'Barème ' + sourceBareme + '.'] };
}

module.exports = { proposerGrille, structure, reglesDepuisTexte };
