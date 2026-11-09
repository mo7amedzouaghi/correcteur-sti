'use strict';
// Moteur IA de hybrideCorrecteur : Claude complète et valide la notation des règles automatiques.
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { texteDepuisFichier } = require('./extract');

const MODELE = 'claude-opus-5-5';
const MAX_CAR_RESSOURCE = 150000;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['criteres', 'appreciation', 'pointsForts', 'aAmeliorer', 'conseils', 'erreurs'],
  properties: {
    criteres: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['id', 'points', 'justification', 'commentaire'],
        properties: {
          id: { type: 'string', description: 'Identifiant (lettre de colonne) du critère' },
          points: { type: 'number', description: 'Note attribuée, multiple de 0.25, entre 0 et le barème' },
          justification: { type: 'string', description: 'Pourquoi cette note (pour l\'enseignant)' },
          commentaire: { type: 'string', description: 'Remarque courte destinée à l\'élève' }
        }
      }
    },
    appreciation: { type: 'string' },
    pointsForts: { type: 'array', items: { type: 'string' } },
    aAmeliorer: { type: 'array', items: { type: 'string' } },
    conseils: { type: 'array', items: { type: 'string' } },
    erreurs: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['critere', 'description', 'penalite'],
        properties: { critere: { type: 'string' }, description: { type: 'string' }, penalite: { type: 'number' } }
      }
    }
  }
};

const INSTRUCTIONS = `Tu es correcteur de la matière « Systèmes et Technologies de l'Informatique » (STI) dans l'enseignement secondaire tunisien (2e, 3e année et Bac Sciences de l'informatique).
Tu corriges le travail d'UN élève en appliquant STRICTEMENT la grille de correction fournie : un résultat par critère (identifiant = lettre de colonne), note entre 0 et le barème du critère, par pas de 0.25.
Références : l'énoncé, la grille, le corrigé et le guide STI fournis dans les ressources sont les documents officiels. Une solution différente du corrigé mais correcte et conforme aux documents officiels est acceptée.
Une analyse automatique (règles) t'est donnée pour chaque critère : elle peut se tromper (faux négatifs sur une écriture équivalente, faux positifs sur du code présent mais incorrect). Vérifie toi-même dans les fichiers de l'élève et corrige-la si besoin, en le disant dans la justification.
Un critère dont l'élément n'existe pas dans le travail vaut 0. Ne devine jamais : si le travail ne permet pas de juger, mets 0 et explique.
Les commentaires destinés à l'élève sont en français, courts, précis et bienveillants. Les justifications pour l'enseignant citent l'élément du code concerné.`;

function politiqueTolerance(tol, difficulte) {
  const l = [];
  l.push('POLITIQUE DE TOLÉRANCE :');
  if (tol.penaliteParErreur > 0) {
    l.push(tol.penaliteParType !== false
      ? `- Retirer ${tol.penaliteParErreur} par TYPE d'erreur sur toute la copie (ex. unité CSS oubliée, valeur erronée, syntaxe) : un type d'erreur déjà sanctionné ne l'est plus, même ailleurs. Sans descendre sous 0.`
      : `- Retirer ${tol.penaliteParErreur} par erreur sur le critère concerné, sans descendre sous 0.`);
  }
  if (tol.penaliteUnique) l.push('- Une même erreur répétée n\'est sanctionnée qu\'une seule fois (ex. mauvais emplacement en Q1-a, connexion à la base évaluée une seule fois).');
  l.push('- Pas de pénalité en cascade : une erreur reprise de façon cohérente ailleurs (ex. nom de champ identique dans le HTML et dans $_POST) n\'est sanctionnée qu\'une fois.');
  if (tol.casseToleree !== false) l.push('- Majuscules/minuscules TOLÉRÉES partout (HTML, CSS, JS, PHP, noms de variables, de fichiers, d\'identifiants) : ne jamais pénaliser une différence de casse.');
  if (tol.variantesSouples !== false) {
    l.push('- Message affiché avec des mots différents : ACCEPTÉ s\'il est affiché au bon endroit et a le même sens.');
    l.push('- Mise en page : margin-left / margin acceptés pour placer section et aside ; sélecteurs combinés corrects (ex. « div h1 », « header nav a ») acceptés.');
  }
  if (tol.solutionsEquivalentes) l.push('- Accepter toute solution équivalente correcte (float/flex/inline-block/margin, id/class, mysqli/PDO, boucles différentes, fonctions auxiliaires…).');
  if (tol.nonOfficielZero) l.push('- Toute déclaration/expression/fonction non conforme aux documents officiels n\'est pas évaluée.');
  l.push('- Code commenté : non évalué. Code supplémentaire non demandé : non pénalisé.');
  if (difficulte) {
    const d = tol.difficulte || {};
    l.push('ÉLÈVE EN DIFFICULTÉ D\'APPRENTISSAGE — correction adaptée :');
    if (d.ignorerErreursMineures) l.push('- Ne pas pénaliser les erreurs mineures (casse, faute de frappe, point-virgule ou guillemet oublié) quand l\'intention est claire et correcte.');
    if (d.pointsPartielsElargis) l.push('- Valoriser une démarche juste même incomplète : jusqu\'à la moitié des points d\'un critère pour une tentative pertinente.');
    if (d.plafondPenalites != null) l.push(`- Le total des pénalités sur toute la copie ne dépasse pas ${d.plafondPenalites} point.`);
    l.push('- Pas de cascade : une erreur de structure n\'annule pas les critères qui en dépendent ; chaque critère est jugé sur ce qu\'il demande.');
    if (d.commentairesSimplifies) l.push('- Commentaires très simples et encourageants ; chaque conseil donne une action concrète de remédiation.');
  }
  return l.join('\n');
}

async function construireContexte(projet, dossierProjet) {
  const g = projet.grille;
  const lignes = g.criteres.map(c =>
    `${c.id} | ${c.etape} Q${c.question}${c.sousQuestion ? ' ' + c.sousQuestion : ''} | ${c.libelle} | ${c.points} pt${c.consigne ? ' | ' + c.consigne : ''}`);
  let s = `# DEVOIR : ${projet.titre} (${projet.niveau}, ${projet.type})\n\n## ÉNONCÉ\n${projet.enonce?.texte || '(non fourni)'}\n\n`;
  s += `## GRILLE DE CORRECTION (total ${g.total}, note sur ${g.noteSur})\nid | question | critère | barème | précision\n${lignes.join('\n')}\n`;
  if (g.remarques?.length) s += `\nRemarques du barème :\n- ${g.remarques.join('\n- ')}\n`;
  for (const r of projet.ressources || []) {
    let t = r.texte;
    if (t == null && r.fichier) t = await texteDepuisFichier(path.join(dossierProjet, r.fichier));
    if (!t) continue;
    if (t.length > MAX_CAR_RESSOURCE) t = t.slice(0, MAX_CAR_RESSOURCE) + '\n[… ressource tronquée à 150 000 caractères]';
    s += `\n## RESSOURCE (${r.categorie || 'ressource'}) : ${r.nom}\n${t}\n`;
  }
  return s;
}

async function contenuEleve(projet, eleve, travail, resultatsRegles) {
  const blocs = [];
  let txt = `# TRAVAIL DE L'ÉLÈVE n° ${eleve.numero}${eleve.difficulte ? ' (élève en difficulté d\'apprentissage)' : ''}\n\n`;
  txt += politiqueTolerance(projet.tolerance || {}, eleve.difficulte) + '\n\n';
  txt += '## ANALYSE AUTOMATIQUE (règles)\n';
  for (const c of projet.grille.criteres) {
    const r = resultatsRegles[c.id];
    if (!r) continue;
    txt += r.manuel ? `${c.id} : pas de règle automatique\n`
      : `${c.id} : ${r.points}/${c.points} — ${r.details.map(d => (d.ok ? '✓ ' : '✗ ') + d.label + ' (' + d.info + ')').join(' ; ')}\n`;
  }
  txt += '\n## FICHIERS DE L\'ÉLÈVE\n';
  for (const f of travail.fichiers) {
    if (f.texte != null) txt += `\n### ${f.rel}\n\`\`\`\n${f.texte}\n\`\`\`\n`;
    else if (f.docx) txt += `\n### ${f.rel} (Word)\n${await texteDepuisFichier(f.chemin)}\n`;
    else if (!f.image && !f.pdf) txt += `\n### ${f.rel} (binaire, ${f.taille} octets, non lisible)\n`;
  }
  // copies scannées / captures : images et PDF envoyés tels quels
  for (const f of travail.fichiers) {
    if (f.image) {
      const ext = f.rel.split('.').pop().toLowerCase();
      const mt = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' }[ext];
      if (f.taille > 5 * 1024 * 1024) { txt += `\n(image ${f.rel} > 5 Mo ignorée)\n`; continue; }
      blocs.push({ type: 'text', text: `Image de l'élève : ${f.rel}` });
      blocs.push({ type: 'image', source: { type: 'base64', media_type: mt, data: fs.readFileSync(f.chemin).toString('base64') } });
    } else if (f.pdf) {
      blocs.push({ type: 'document', title: f.rel, source: { type: 'base64', media_type: 'application/pdf', data: fs.readFileSync(f.chemin).toString('base64') } });
    }
  }
  blocs.push({ type: 'text', text: txt + '\nCorrige ce travail critère par critère (tous les identifiants de la grille) et réponds au format JSON demandé.' });
  return blocs;
}

/** Corrige un élève avec Claude. Retourne l'objet JSON validé. */
async function corrigerAvecIA({ cleApi, projet, dossierProjet, eleve, travail, resultatsRegles, contexte }) {
  const client = new Anthropic(cleApi ? { apiKey: cleApi } : {});
  const ctx = contexte || await construireContexte(projet, dossierProjet);
  const stream = client.beta.messages.stream({
    model: MODELE,
    max_tokens: 32000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'high', format: { type: 'json_schema', schema: SCHEMA } },
    system: [
      { type: 'text', text: INSTRUCTIONS },
      { type: 'text', text: ctx, cache_control: { type: 'ephemeral' } } // partagé par tous les élèves
    ],
    messages: [{ role: 'user', content: await contenuEleve(projet, eleve, travail, resultatsRegles) }]
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === 'refusal') throw new Error('Requête refusée par le modèle (' + (msg.stop_details?.category || 'inconnu') + ')');
  if (msg.stop_reason === 'max_tokens') throw new Error('Réponse IA tronquée (max_tokens atteint).');
  const texte = msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
  const data = JSON.parse(texte);
  data.usage = msg.usage;
  return data;
}

function messageErreur(e) {
  if (e instanceof Anthropic.AuthenticationError) return 'Clé API invalide ou absente (onglet Réglages IA).';
  if (e instanceof Anthropic.RateLimitError) return 'Limite de débit atteinte : réessayez dans une minute.';
  if (e instanceof Anthropic.APIConnectionError) return 'Pas de connexion Internet vers l\'API Claude.';
  if (e instanceof Anthropic.APIError) return `Erreur API ${e.status} : ${e.message}`;
  return e.message;
}

module.exports = { corrigerAvecIA, construireContexte, messageErreur, politiqueTolerance, MODELE };
