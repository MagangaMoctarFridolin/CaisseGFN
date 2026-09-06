/* ============================================================================
   db.js — Moteur de données de la tontine.

   Principe : rien n'est jamais écrasé. Chaque modification est un ÉVÉNEMENT
   ajouté à la fin d'un journal. Chaque appareil possède SON PROPRE fichier
   journal (ev-<appareil>.jsonl) : deux appareils n'écrivent donc jamais dans
   le même fichier, et OneDrive n'a aucun conflit à arbitrer.

   L'état courant est reconstruit en rejouant tous les journaux dans l'ordre
   chronologique. En cas de modification concurrente de la même fiche, la plus
   récente l'emporte (last-write-wins).
   ========================================================================== */

export const ENTITES = ['association', 'adherent', 'cotisation', 'pret', 'mouvement', 'compte'];

export const MOIS_NOMS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

export const ETAT_VIDE = () => ({
  version: 1,
  association: {
    nom: 'LA GRANDE FAMILLE NIELILI', adresse: 'Libreville',
    telephone: '', email: '', airtelMoney: '',
    anneeDemarrage: new Date().getFullYear(), devise: 'FCFA'
  },
  adherents: [], cotisations: [], prets: [], mouvements: [], comptes: []
});

/* ---------------------------------------------------------------- identifiants */

export function uid(prefixe) {
  const alea = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random())).replace(/-/g, '').slice(0, 10);
  return `${prefixe}_${Date.now().toString(36)}${alea}`;
}

/* ------------------------------------------------------------------- journaux */

/** Analyse un fichier .jsonl en tableau d'événements, en ignorant les lignes illisibles. */
export function lireJournal(texte) {
  const evenements = [];
  for (const ligne of (texte || '').split('\n')) {
    const t = ligne.trim();
    if (!t) continue;
    try {
      const e = JSON.parse(t);
      if (e && e.id && e.ts && e.entite) evenements.push(e);
    } catch { /* ligne tronquée par une synchro interrompue : on la saute */ }
  }
  return evenements;
}

export function ecrireJournal(evenements) {
  return evenements.map((e) => JSON.stringify(e)).join('\n') + '\n';
}

/** Ordre stable : par horodatage, puis par identifiant d'événement. */
function comparer(a, b) {
  if (a.ts !== b.ts) return a.ts < b.ts ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function fusionner(...listes) {
  const vus = new Set();
  const tout = [];
  for (const liste of listes) {
    for (const e of liste || []) {
      if (vus.has(e.id)) continue;
      vus.add(e.id);
      tout.push(e);
    }
  }
  return tout.sort(comparer);
}

/* ------------------------------------------------------------------ réduction */

const PLURIEL = {
  adherent: 'adherents', cotisation: 'cotisations',
  pret: 'prets', mouvement: 'mouvements', compte: 'comptes'
};

/** Rejoue les événements pour obtenir l'état courant. */
export function rejouer(evenements, etatInitial) {
  const etat = etatInitial ? structuredClone(etatInitial) : ETAT_VIDE();
  for (const t of Object.values(PLURIEL)) if (!Array.isArray(etat[t])) etat[t] = [];
  // Dernier événement gagnant pour chaque fiche.
  const dernier = new Map();
  for (const e of [...evenements].sort(comparer)) {
    const cle = e.entite === 'association' ? 'association' : `${e.entite}:${e.donnees?.id}`;
    dernier.set(cle, e);
  }
  for (const e of [...dernier.values()].sort(comparer)) {
    if (e.entite === 'association') {
      if (e.type === 'upsert') etat.association = { ...etat.association, ...e.donnees };
      continue;
    }
    const tableau = PLURIEL[e.entite];
    if (!tableau) continue;
    const liste = etat[tableau];
    const i = liste.findIndex((x) => x.id === e.donnees.id);
    if (e.type === 'delete') {
      if (i >= 0) liste.splice(i, 1);
    } else if (i >= 0) {
      liste[i] = { ...liste[i], ...e.donnees };
    } else {
      liste.push({ ...e.donnees });
    }
  }
  return etat;
}

/* -------------------------------------------------------------------- calculs */

export function encoursPret(pret) {
  const rembourse = (pret.remboursements || []).reduce((s, r) => s + (+r.montant || 0), 0);
  return Math.max(0, (+pret.montant || 0) - rembourse);
}

export function enRetard(pret, aujourdhui = new Date()) {
  if (encoursPret(pret) <= 0 || !pret.dateLimite) return false;
  return new Date(pret.dateLimite) < aujourdhui;
}

export function totalCotisationsAdherent(etat, adherentId, annee) {
  return etat.cotisations
    .filter((c) => c.adherentId === adherentId && (annee == null || c.annee === annee))
    .reduce((s, c) => s + (+c.montant || 0), 0);
}

export function totaux(etat, annee) {
  const cot = etat.cotisations.filter((c) => annee == null || c.annee === annee);
  const totalCotisations = cot.reduce((s, c) => s + (+c.montant || 0), 0);

  const mvt = etat.mouvements.filter((m) => annee == null || new Date(m.date).getFullYear() === annee);
  const credits = mvt.reduce((s, m) => s + (+m.credit || 0), 0);
  const debits = mvt.reduce((s, m) => s + (+m.debit || 0), 0);

  const encoursPrets = etat.prets.reduce((s, p) => s + encoursPret(p), 0);
  const pretsEnRetard = etat.prets.filter((p) => enRetard(p)).length;

  return {
    totalCotisations, credits, debits, encoursPrets, pretsEnRetard,
    nbAdherents: etat.adherents.filter((a) => a.actif !== false).length,
    solde: totalCotisations + credits - debits - encoursPrets
  };
}

/** Répartition des cotisations par mois pour une année donnée. */
export function parMois(etat, annee) {
  const t = Array(12).fill(0);
  for (const c of etat.cotisations) {
    if (c.annee === annee) t[(c.mois || 1) - 1] += +c.montant || 0;
  }
  return t;
}

export function anneesConnues(etat) {
  const set = new Set(etat.cotisations.map((c) => c.annee));
  for (const m of etat.mouvements) set.add(new Date(m.date).getFullYear());
  for (const p of etat.prets) if (p.dateOctroi) set.add(new Date(p.dateOctroi).getFullYear());
  set.add(new Date().getFullYear());
  return [...set].filter(Boolean).sort((a, b) => b - a);
}

export function nomComplet(a) {
  return [a?.prenom, a?.nom].filter(Boolean).join(' ') || a?.numero || '—';
}

/* ------------------------------------------------------------------- formats */

export function fmtMontant(v, devise = 'FCFA') {
  const n = Math.round(+v || 0);
  return n.toLocaleString('fr-FR').replace(/ | /g, ' ') + ' ' + devise;
}

export function fmtNombre(v) {
  return Math.round(+v || 0).toLocaleString('fr-FR').replace(/ | /g, ' ');
}

export function fmtDate(d) {
  if (!d) return '—';
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date)) return '—';
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
