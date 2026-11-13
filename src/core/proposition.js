'use strict';
/*
 * Proposition automatique d'une grille de correction à partir du texte de l'énoncé (hors ligne).
 * Repère la structure (Etape / Partie / Exercice, questions 1) 2)…, sous-questions a) b)…),
 * puis, pour chaque question, les éléments vérifiables : fichiers, balises, liens, fonctions JS,
 * propriétés CSS, requêtes SQL, messages… Chaque élément devient une règle automatique.
 *
 * Barème : la grille est toujours proposée sur 40 points (note sur 20 = total / 2) et répartie
 * ÉQUITABLEMENT, en multiples de 0,25 :
 *  - points annoncés dans le sujet (tableau de barème ou titres « Exercice 2 (8 points) ») ramenés sur 40 ;
 *  - « 0,25 pt par question / par blanc » : chaque question de la partie reçoit la même part ;
 *  - sinon, répartition selon le nombre d'éléments à vérifier (au moins 0,25 par critère).
 * La somme est toujours exactement égale au total (méthode du plus fort reste).
 * Le résultat est une PROPOSITION : l'enseignant ajuste libellés, barème et règles.
 */

const PAS = 0.25;

// Parties du devoir : on garde le mot et le titre du sujet (Exercice 2 : Les tableaux, Partie A, Activité 1…)
const RX_ETAPE = /^\s*([ée]tape|partie|exercice|activit[ée]|t[âa]che|probl[èe]me|situation|dossier|section|travail)\s*(?:n[°o]\s*)?(\d+|[IVX]+|[A-H])\b\s*(?:\([^)]*\))?\s*[:.\-–]?\s*(.*)$/i;
const RX_QUESTION = /^\s*(?:question\s*|q\s*)?(\d{1,2})\s*[)\.\-:]\s+(.+)$/i;
const RX_SOUS = /^\s*([a-h])\s*[)\.]\s+(.+)$/;
// « 0,25 pt par question », « 1 point par blanc »… dans le titre d'une partie
const RX_UNITAIRE = /(\d+(?:[.,]\d+)?)\s*(?:pts?|points?)\s*(?:par|\/|pour chaque|chacune?)\s*(question|blanc|item|r[ée]ponse|case|ligne)/i;
// partie à choix multiples : les lignes a) b) c) sont des propositions de réponse, pas des sous-questions
const RX_QCM = /encercler|cocher|bonne r[ée]ponse|qcm|choix multiple|vrai ou faux|r[ée]pondre par vrai/i;
// épreuve pratique : il faut créer / développer un fichier, une page, une table, une fonction…
const RX_PRATIQUE = /(cr[ée]er|d[ée]velopper|importer|exporter|ajouter au fichier)[^\n]{0,60}(["«]?[\w-]+\.(html?|css|js|php|sql|py)\b|base de donn|table\b|fonction)/i;
const majuscule = s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
const fr = n => String(Math.round(n * 100) / 100).replace('.', ',');

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
  const parties = {}; // nom de la partie -> { points, egal, unite, qcm }
  let etape = '', etapeVue = false, q = null, sq = null, courant = null, consignesEtape = '';
  // une partie sans question numérotée (ex. « Compléter les codes ») reste une feuille à elle seule
  const retirerPartieVide = () => {
    const d = feuilles[feuilles.length - 1];
    if (d && d.vide && d.etape === etape) { feuilles.pop(); consignesEtape = d.texte; courant = null; }
  };
  const nouvelle = (question, sous, titre) => {
    retirerPartieVide();
    courant = { etape, question, sousQuestion: sous, titre, texte: titre, consignes: consignesEtape };
    feuilles.push(courant);
  };
  for (const l of lignes) {
    let m;
    if ((m = RX_ETAPE.exec(l)) && l.length < 120 && !/^(partie|section)\s+\d+\s+(du|de la|des)\b/i.test(l)) {
      // nom de la partie tel qu'écrit dans le sujet, avec son titre s'il est court
      const titre = m[3].replace(/\s*\(.*$/, '').trim();
      etape = `${majuscule(m[1])} ${m[2].toUpperCase()}` + (titre && titre.length <= 50 ? ' : ' + titre : '');
      // points annoncés dans le titre : « Exercice 2 (8 points) » ; unité : « 0,25 pt par question »
      const p = /\(?\s*(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:points?|pts?)\s*\)?/i.exec(l);
      const u = RX_UNITAIRE.exec(l);
      parties[etape] = {
        points: p ? parseFloat(p[1].replace(',', '.')) : null,
        egal: !!u, unite: u ? parseFloat(u[1].replace(',', '.')) : null, qcm: RX_QCM.test(l)
      };
      etapeVue = true; q = null; sq = null; consignesEtape = '';
      courant = { etape, question: '', sousQuestion: '', titre: titre || etape, texte: '', consignes: '', vide: true };
      feuilles.push(courant);
      continue;
    }
    if ((m = RX_QUESTION.exec(l)) && (etapeVue || feuilles.length || /^1\b/.test(m[1]))) {
      q = m[1]; sq = null;
      nouvelle(q, '', m[2]);
      continue;
    }
    const qcm = !!parties[etape]?.qcm;
    if (!qcm && (m = RX_SOUS.exec(l)) && !q && etapeVue) {
      // partie sans question numérotée : a), b)… sont les questions
      sq = null; nouvelle(m[1], '', m[2]);
      courant.contexte = consignesEtape;
      continue;
    }
    if (!qcm && (m = RX_SOUS.exec(l)) && q) {
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
    if (courant) courant.texte += (courant.texte ? '\n' : '') + l;
    else consignesEtape += '\n' + l;
  }
  // sujet sans parties : la grille est organisée par question
  if (!etapeVue) for (const f of feuilles) f.etape = `Question ${f.question}`;
  feuilles.parties = parties;
  feuilles.pointsParties = Object.fromEntries(Object.entries(parties).filter(([, v]) => v.points > 0).map(([k, v]) => [k, v.points]));
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
  for (const m of t.matchAll(/(?:lien vers (?:la page )?|vers la page )"?([\w-]+\.(?:html?|php))"?/gi)) ajout({ type: 'html', fichier: cible, selecteur: `a[href*="${m[1]}"]`, indice: `href\\s*=\\s*["']?${echapper(m[1])}`, label: `lien vers ${m[1]}` });
  for (const m of t.matchAll(/l'image (?:nomm[ée]e )?"?([\w-]+\.(?:jpe?g|png|gif|webp))"?/gi)) ajout({ type: 'html', fichier: cible, selecteur: `img[src*="${m[1]}"]`, label: `image ${m[1]}` });
  for (const m of t.matchAll(/contient le texte\s*"\s*([^"]{3,80})"/gi)) ajout({ type: 'regex', fichier: cible, motif: motifSouple(m[1]), label: `texte « ${m[1].trim()} »` });
  if (/lier|reli[ée]e?s? (?:au|aux) fichiers?/i.test(t)) {
    for (const f2 of fichiers.filter(x => /\.css$/i.test(x))) ajout({ type: 'html', fichier: cible, selecteur: `link[href*="${f2}" i]`, label: `liaison ${f2}` });
    for (const f2 of fichiers.filter(x => /\.js$/i.test(x))) ajout({ type: 'html', fichier: cible, selecteur: `script[src*="${f2}" i]`, label: `liaison ${f2}` });
  }
  const fn = (t.match(/fonction\s+(?:javascript\s+)?"?([a-zA-Z_]\w*)"?/i) || [])[1];
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

/** Coupe le titre d'une question pour en faire un libellé court. */
function libelleCourt(titre) {
  const s = titre.replace(/\s*:?\s*[.…_]{3,}.*$/, '').replace(/\s*:$/, '')
    .replace(/\s+(tout en|permettant|qui permet|afin d|situ[ée]|conform[ée]ment|en lui attribuant|dans votre dossier|via le formulaire|selon le format).*$/i, '');
  return s.length > 90 ? s.slice(0, 87).replace(/\s+\S*$/, '') + '…' : s;
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
 * Répartit `unites` (nombre entier de pas de 0,25) entre des éléments selon leurs poids,
 * par la méthode du plus fort reste : la somme est exacte et chaque élément reçoit au moins
 * `min` unité (équité : aucun critère à 0). À poids égaux, les premiers reçoivent le reste.
 */
function repartirUnites(poids, unites, min = 1) {
  const n = poids.length;
  if (!n) return [];
  if (n > unites) min = 0; // plus de critères que d'unités : le minimum n'est plus tenable
  const w = poids.map(p => Math.max(Number(p) || 0, 1e-9));
  const S = w.reduce((a, b) => a + b, 0);
  const ideal = w.map(p => unites * p / S);
  const base = ideal.map(x => Math.max(min, Math.floor(x + 1e-9)));
  let total = base.reduce((a, b) => a + b, 0);
  while (total > unites) { // les minimums ont fait dépasser : on retire aux plus gros
    let k = -1;
    for (let i = 0; i < n; i++) if (base[i] > min && (k < 0 || base[i] - ideal[i] > base[k] - ideal[k])) k = i;
    if (k < 0) break;
    base[k]--; total--;
  }
  while (total < unites) { // le reste va aux plus forts restes
    let k = 0;
    for (let i = 1; i < n; i++) if (ideal[i] - base[i] > ideal[k] - base[k] + 1e-12) k = i;
    base[k]++; total++;
  }
  return base;
}

const poidsFeuille = f => Math.max(1, (f.regles || []).filter(r => r.type !== 'manuel').length);

/** Épreuve théorique : aucune question ne demande de créer / développer un fichier, une table, une fonction… */
function detecterTheorique(feuilles) {
  return !feuilles.some(f => RX_PRATIQUE.test(f.titre + '\n' + f.texte));
}

/**
 * Propose une grille. Si `grilleExistante` contient déjà des colonnes (grille Excel importée),
 * leurs identifiants et barèmes sont conservés : on remplit seulement libellés et règles.
 * Sinon la grille est calculée sur `total` points (40 par défaut), répartis équitablement.
 */
function proposerGrille(texteEnonce, { total = 40, noteSur = 20, grilleExistante = null, type = 'pratique' } = {}) {
  const feuilles = structure(texteEnonce || '');
  if (!feuilles.length) throw new Error('Aucune question repérée dans l\'énoncé (numérotation 1), 2)… ou a), b)… attendue).');
  const theorique = type === 'theorique' || detecterTheorique(feuilles);
  for (const f of feuilles) {
    // le tableau de barème imprimé en fin d'énoncé ne fait pas partie de la dernière question
    f.texte = f.texte.split(/\n(?:grille d.[ée]valuation|bar[èe]me)/i)[0];
    f.regles = theorique ? [{ type: 'manuel', label: 'à noter par l\'enseignant' }] : reglesDepuisTexte(f);
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
    return { ...grilleExistante, propose: true, theorique, criteres: grilleExistante.criteres };
  }

  // ----- nouvelle grille sur `total` points, répartie équitablement -----
  const U = Math.max(1, Math.round(total / PAS));
  const parties = feuilles.parties || {};
  const noms = [...new Set(feuilles.map(f => f.etape))];
  // les sous-questions partagent les points de leur question ; « N pt par question » => parts égales entre questions
  const attribuerGroupe = (liste, unites, egal) => {
    const ordre = [...new Set(liste.map(f => f.question))];
    const parQuestion = ordre.map(qn => liste.filter(f => f.question === qn));
    const uq = repartirUnites(parQuestion.map(fs => egal ? 1 : fs.reduce((a, f) => a + poidsFeuille(f), 0)), unites, 1);
    parQuestion.forEach((fs, i) => {
      const us = repartirUnites(fs.map(poidsFeuille), uq[i], 1);
      fs.forEach((f, j) => { f.points = us[j] * PAS; });
    });
  };
  const bareme = baremeEnonce(texteEnonce, feuilles);
  const annonce = noms.length > 0 && noms.every(n => parties[n]?.points > 0);
  let sourceBareme;
  if (bareme) {
    const s = bareme.reduce((a, g) => a + g.points, 0);
    const ug = repartirUnites(bareme.map(g => g.points), U, 1);
    bareme.forEach((g, k) => { const l = feuilles.filter(g.filtre); attribuerGroupe(l, ug[k], !!parties[l[0]?.etape]?.egal); });
    sourceBareme = `tiré du barème de l'énoncé (${bareme.map(g => fr(g.points)).join(' / ')} sur ${fr(s)}, ramené sur ${fr(total)})`;
  } else if (annonce) {
    const s = noms.reduce((a, n) => a + parties[n].points, 0);
    const up = repartirUnites(noms.map(n => parties[n].points), U, 1);
    noms.forEach((n, k) => attribuerGroupe(feuilles.filter(f => f.etape === n), up[k], !!parties[n].egal));
    sourceBareme = `tiré des points annoncés dans le sujet (${noms.map(n => fr(parties[n].points)).join(' / ')} sur ${fr(s)}${Math.abs(s - total) > 1e-9 ? ', ramené sur ' + fr(total) : ''})`;
    const egales = noms.filter(n => parties[n].egal);
    if (egales.length) sourceBareme += `, puis réparti également entre les questions des parties « points par question / par blanc » (${egales.length})`;
  } else {
    const up = repartirUnites(noms.map(n => feuilles.filter(f => f.etape === n).reduce((a, f) => a + poidsFeuille(f), 0)), U, 1);
    noms.forEach((n, k) => attribuerGroupe(feuilles.filter(f => f.etape === n), up[k], false));
    sourceBareme = 'réparti selon le nombre d\'éléments à vérifier (équitable, au moins 0,25 par critère)';
  }
  const criteres = feuilles.map((f, i) => {
    const id = 'Q' + (i + 1);
    let libelle = f.libelle;
    // partie sans question numérotée annonçant « 0,25 pt par blanc » : on rappelle le nombre d'éléments
    const p = parties[f.etape];
    if (f.vide && p?.egal && p.unite > 0 && p.points > 0) libelle += ` (${Math.round(p.points / p.unite)} × ${fr(f.points / Math.round(p.points / p.unite))} pt)`;
    return {
      id, colonne: id, etape: f.etape, question: f.question, sousQuestion: f.sousQuestion, libelle,
      points: f.points, regles: f.regles.length ? f.regles : [{ type: 'manuel', label: 'à noter' }], propose: true
    };
  });
  const somme = Math.round(criteres.reduce((a, c) => a + c.points, 0) * 100) / 100;
  const remarques = ['Grille proposée automatiquement à partir de l\'énoncé : vérifiez libellés, barème et règles.',
    `Barème sur ${fr(somme)} points (note sur ${noteSur} = total × ${noteSur} / ${fr(somme)}) : ${sourceBareme}.`];
  if (theorique) remarques.push('Épreuve théorique : tous les critères sont à noter par l\'enseignant (saisie des points par élève).');
  return { titre: 'Grille proposée', total: somme, noteSur, criteres, propose: true, theorique, remarques };
}

module.exports = { proposerGrille, structure, reglesDepuisTexte, repartirUnites, detecterTheorique };
