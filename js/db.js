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
    // Moyens de versement proposés aux adhérents — voir canaux() plus bas.
    canaux: [],
    // Cotisation mensuelle de référence : ce que verse un adhérent qui n'a pas
    // d'engagement particulier. Zéro signifie « pas de montant fixe ».
    cotisationMensuelle: 0,
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

/**
 * Les intérêts. Deux façons de compter, parce que les deux se pratiquent :
 *
 *   • « une fois, sur le capital »  — on rend 11 000 pour 10 000 ;
 *   • « par mois »                  — tant pour cent, multiplié par la durée
 *                                     CONVENUE (les mensualités prévues, ou
 *                                     l'écart entre l'octroi et la date limite).
 *
 * Volontairement, un retard n'augmente pas les intérêts tout seul. Une somme
 * qui gonfle d'elle-même pendant qu'on ne regarde pas est une source de
 * querelle, pas de justice : si le bureau décide d'une pénalité, il la décide,
 * et elle s'inscrit. L'application ne la décide pas à sa place.
 */
export const MODES_INTERET = [
  { cle: '', nom: 'Sans intérêt' },
  { cle: 'global', nom: 'Une fois, sur le capital' },
  { cle: 'mensuel', nom: 'Par mois, sur la durée convenue' }
];

export function nomModeInteret(cle) {
  return MODES_INTERET.find((m) => m.cle === (cle || ''))?.nom || 'Sans intérêt';
}

/** La durée convenue, en mois. Zéro si rien n'a été convenu. */
export function dureeMois(pret) {
  const n = Math.round(+pret?.nbEcheances || 0);
  if (n > 0) return n;
  if (pret?.dateOctroi && pret?.dateLimite) {
    const debut = new Date(pret.dateOctroi);
    const fin = new Date(pret.dateLimite);
    if (!isNaN(debut) && !isNaN(fin) && fin > debut) {
      return Math.max(1, Math.round((fin - debut) / 2629800000));
    }
  }
  return 0;
}

export function interetsPret(pret) {
  const taux = +pret?.tauxInteret || 0;
  const mode = pret?.modeInteret || '';
  const capital = +pret?.montant || 0;
  if (taux <= 0 || !mode || capital <= 0) return 0;
  if (mode === 'global') return Math.round(capital * taux / 100);
  const mois = dureeMois(pret);
  if (!mois) return 0;   // par mois, mais aucune durée convenue : on ne devine pas
  return Math.round(capital * taux / 100 * mois);
}

/** Ce que l'emprunteur doit en tout : capital et intérêts. */
export function duTotalPret(pret) {
  return (+pret?.montant || 0) + interetsPret(pret);
}

/** Ce qu'il lui reste à rendre. */
export function encoursPret(pret) {
  return Math.max(0, duTotalPret(pret) - totalRembourse(pret));
}

/**
 * L'effet du prêt sur la CAISSE — à ne pas confondre avec ce que doit
 * l'emprunteur. Il est sorti du capital, il rentre des remboursements : la
 * différence est ce qui manque en caisse, et elle devient négative — donc un
 * gain — dès que les intérêts commencent à rentrer.
 */
export function effetCaissePret(pret) {
  return (+pret?.montant || 0) - totalRembourse(pret);
}

/** Les intérêts déjà encaissés : ce qui, dans les remboursements, dépasse le capital. */
export function interetsRecus(pret) {
  return Math.max(0, totalRembourse(pret) - (+pret?.montant || 0));
}

/**
 * Les intérêts encaissés au cours d'une année donnée. Les remboursements
 * s'imputent d'abord sur le capital, et seulement ensuite sur les intérêts :
 * c'est l'ordre prudent, celui qui ne fait pas apparaître un bénéfice tant que
 * la caisse n'a pas récupéré sa mise.
 */
export function interetsRecusAnnee(pret, annee) {
  const capital = +pret?.montant || 0;
  let cumul = 0;
  let interets = 0;
  const versements = [...(pret?.remboursements || [])]
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  for (const r of versements) {
    const avant = cumul;
    cumul += +r.montant || 0;
    const part = Math.max(0, cumul - Math.max(capital, avant));
    if (part > 0 && (annee == null || new Date(r.date).getFullYear() === annee)) interets += part;
  }
  return interets;
}

export function enRetard(pret, aujourdhui = new Date()) {
  if (encoursPret(pret) <= 0 || !pret.dateLimite) return false;
  return new Date(pret.dateLimite) < aujourdhui;
}

export function totalRembourse(pret) {
  return (pret.remboursements || []).reduce((s, r) => s + (+r.montant || 0), 0);
}

/**
 * L'échéancier d'un prêt : les versements attendus, et ce qui les couvre.
 *
 * Il n'est pas stocké. On le déduit du montant, de la date d'octroi et du
 * nombre de mensualités convenues — et on le confronte au cumul réellement
 * remboursé. Un prêt sans mensualité convenue n'a pas d'échéancier : il a une
 * date limite, et c'est tout. Inventer un calendrier que personne n'a promis
 * ne rendrait service à personne.
 */
export function echeancier(pret, aujourdhui = new Date()) {
  const n = Math.round(+pret.nbEcheances || 0);
  if (n <= 0 || !pret.dateOctroi) return [];
  // C'est le total dû — intérêts compris — qui se découpe en mensualités.
  const montant = duTotalPret(pret);
  const part = Math.floor(montant / n);
  const depart = new Date(pret.dateOctroi);
  if (isNaN(depart)) return [];

  let cumulPaye = totalRembourse(pret);
  let cumulDu = 0;
  const lignes = [];
  for (let i = 1; i <= n; i++) {
    // La dernière mensualité absorbe l'arrondi : la somme fait le montant.
    const du = i === n ? montant - part * (n - 1) : part;
    cumulDu += du;
    const date = new Date(depart);
    date.setMonth(date.getMonth() + i);
    const couvert = Math.max(0, Math.min(du, cumulPaye - (cumulDu - du)));
    const echue = date <= aujourdhui;
    lignes.push({
      rang: i, date: date.toISOString().slice(0, 10), montant: du, couvert,
      etat: couvert >= du ? 'reglee' : echue ? 'en-retard' : 'a-venir'
    });
  }
  return lignes;
}

/** L'encours de prêt par adhérent, du plus engagé au moins engagé. */
export function encoursParAdherent(etat) {
  const parQui = new Map();
  for (const p of etat.prets || []) {
    const encours = encoursPret(p);
    const ligne = parQui.get(p.adherentId) || {
      adherentId: p.adherentId,
      adherent: etat.adherents.find((a) => a.id === p.adherentId) || null,
      encours: 0, emprunte: 0, interets: 0, rembourse: 0, nombre: 0, enRetard: false
    };
    ligne.encours += encours;
    ligne.emprunte += +p.montant || 0;
    ligne.interets += interetsPret(p);
    ligne.rembourse += totalRembourse(p);
    ligne.nombre += 1;
    if (enRetard(p)) ligne.enRetard = true;
    parQui.set(p.adherentId, ligne);
  }
  return [...parQui.values()].sort((a, b) => b.encours - a.encours);
}

/** L'encours d'un adhérent donné — utile pour le signaler ailleurs. */
export function encoursAdherent(etat, adherentId) {
  return (etat.prets || [])
    .filter((p) => p.adherentId === adherentId)
    .reduce((s, p) => s + encoursPret(p), 0);
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

  // Ce que les adhérents doivent (intérêts compris) et ce qui manque
  // réellement en caisse (capital sorti, moins tout ce qui est rentré) sont
  // deux chiffres différents dès qu'un prêt porte intérêt. Confondre les deux
  // ferait mentir le solde des deux côtés à la fois.
  const encoursPrets = etat.prets.reduce((s, p) => s + encoursPret(p), 0);
  const capitalDehors = etat.prets.reduce((s, p) => s + effetCaissePret(p), 0);
  const produitsPrets = etat.prets.reduce((s, p) => s + interetsRecus(p), 0);
  const pretsEnRetard = etat.prets.filter((p) => enRetard(p)).length;

  return {
    totalCotisations, credits, debits, encoursPrets, capitalDehors, produitsPrets,
    pretsEnRetard,
    nbAdherents: etat.adherents.filter((a) => a.actif !== false).length,
    solde: totalCotisations + credits - debits - capitalDehors
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

/* ------------------------------------------- fonctions dans l'association --- */

/**
 * Le bureau. À ne pas confondre avec les DROITS dans l'application :
 *
 *   • le droit (administrateur / consultation) dit ce que le SERVEUR autorise
 *     à écrire. C'est la base de données qui l'applique, et elle ne connaît
 *     que ces deux niveaux ;
 *   • la fonction dit QUI EST QUI dans l'association. C'est un titre, porté
 *     par une fiche adhérent — pas par un compte, car on peut très bien être
 *     commissaire aux comptes sans adresse e-mail.
 *
 * Les deux se règlent séparément, volontairement : inventer un droit
 * « trésorier » que la base n'appliquerait pas serait du décor.
 */
export const FONCTIONS = [
  { cle: 'president',   nom: 'Président',              accord: 'du président' },
  { cle: 'tresorier',   nom: 'Trésorier',              accord: 'du trésorier' },
  { cle: 'secretaire',  nom: 'Secrétaire',             accord: 'du secrétaire' },
  { cle: 'commissaire', nom: 'Commissaire aux comptes', accord: 'du commissaire aux comptes' }
];

export function nomFonction(cle) {
  return FONCTIONS.find((f) => f.cle === cle)?.nom || '';
}

/** L'adhérent qui occupe une fonction, ou null si la place est vacante. */
export function titulaire(etat, cle) {
  return etat?.adherents?.find((a) => a.fonction === cle) || null;
}

/** « Signature du trésorier : Untel » — ou la ligne vierge si personne n'est nommé. */
export function ligneSignature(etat, cle) {
  const f = FONCTIONS.find((x) => x.cle === cle);
  if (!f) return '';
  const qui = titulaire(etat, cle);
  return 'Signature ' + f.accord + ' : ' + (qui ? nomComplet(qui) : '______________________');
}

/* --------------------------------------------------- moyens de versement --- */

/**
 * Les moyens par lesquels un adhérent verse sa cotisation : Airtel Money,
 * espèces remises au trésorier, virement…
 *
 * Ils vivent dans la fiche de l'association, donc dans le journal comme tout
 * le reste : les changer est un événement, pas une migration. Les bases
 * antérieures ne connaissaient qu'un numéro Airtel ; on le reprend ici sous
 * forme de canal, pour que rien ne se perde et qu'aucune reprise ne soit
 * nécessaire.
 */
export const CANAL_AUTRE = { id: 'autre', nom: 'Non précisé', type: 'autre', actif: false };

export function canaux(etat, toutMontrer = false) {
  const liste = etat?.association?.canaux;
  if (Array.isArray(liste) && liste.length) {
    return toutMontrer ? liste : liste.filter((c) => c.actif !== false);
  }
  const ancien = etat?.association?.airtelMoney;
  if (ancien) {
    return [{ id: 'airtel', nom: 'Airtel Money', type: 'mobile', numero: ancien, actif: true }];
  }
  return [];
}

export function canal(etat, id) {
  if (!id) return null;
  return canaux(etat, true).find((c) => c.id === id) || null;
}

/** Nom lisible d'un moyen, même s'il a été supprimé depuis la saisie. */
export function nomCanal(etat, id) {
  if (!id) return 'Non précisé';
  return canal(etat, id)?.nom || 'Moyen supprimé';
}

/** Abrégé de deux ou trois lettres, pour le repère affiché dans les cases. */
export function codeCanal(nom) {
  const mots = String(nom || '').trim().split(/[\s'’-]+/).filter(Boolean);
  if (!mots.length) return '—';
  if (mots.length === 1) return mots[0].slice(0, 3).toUpperCase();
  return mots.slice(0, 2).map((m) => m[0]).join('').toUpperCase();
}

/**
 * Répartition des cotisations d'une année par moyen de versement.
 * Renvoie [{ id, nom, montant, nombre }], du plus gros au plus petit.
 */
export function parMoyen(etat, annee) {
  const cumul = new Map();
  for (const c of etat.cotisations) {
    if (annee != null && c.annee !== annee) continue;
    const id = c.moyen || '';
    const ligne = cumul.get(id) || { id, nom: nomCanal(etat, id), montant: 0, nombre: 0 };
    ligne.montant += +c.montant || 0;
    ligne.nombre += 1;
    cumul.set(id, ligne);
  }
  return [...cumul.values()].sort((a, b) => b.montant - a.montant);
}

/* ---------------------------------------------------- clôture d'exercice --- */

/**
 * Le partage de fin d'exercice.
 *
 * C'est le moment de l'année où une tontine familiale peut se fâcher pour de
 * bon, et c'est donc celui où le calcul doit être posé noir sur blanc, ligne
 * par ligne, avant d'être annoncé.
 *
 * Deux régimes, selon ce que dit le règlement :
 *
 *   • 'integral' — on rend à chacun ses apports de l'exercice, augmentés de sa
 *     part du résultat. La caisse repart de zéro. C'est le cas le plus courant.
 *   • 'resultat' — les apports restent en caisse et on ne partage que le
 *     bénéfice.
 *
 * Trois choses sont volontairement séparées et jamais mélangées :
 *
 *   — les APPORTS, qui appartiennent déjà à chacun ;
 *   — le RÉSULTAT, qui se partage au prorata des apports ;
 *   — ce qui est DEHORS, en prêts non remboursés, et qu'on ne peut pas
 *     distribuer puisqu'il n'est pas là.
 *
 * Et la dette d'un adhérent vient en déduction de ce qu'il reçoit : on ne
 * rend pas 50 000 à quelqu'un qui en doit 30 000 pour lui en redemander 30 000
 * le lendemain.
 */
export function cloture(etat, annee, mode = 'integral') {
  const cotisations = (etat.cotisations || []).filter((c) => c.annee === annee);
  const mouvements = (etat.mouvements || [])
    .filter((m) => new Date(m.date).getFullYear() === annee);

  // Les remises du tour de rôle ne sont pas une charge : c'est l'argent des
  // adhérents qui leur revient à leur tour. On les isole.
  const estTour = (m) => (m.nature || '') === 'Tour de rôle';
  const estPartage = (m) => (m.nature || '') === 'Partage de clôture';

  const autresProduits = mouvements
    .filter((m) => !estTour(m) && !estPartage(m))
    .reduce((s, m) => s + (+m.credit || 0), 0);
  const charges = mouvements
    .filter((m) => !estTour(m) && !estPartage(m))
    .reduce((s, m) => s + (+m.debit || 0), 0);
  const remisTour = mouvements.filter(estTour).reduce((s, m) => s + (+m.debit || 0), 0);
  const dejaPartage = mouvements.filter(estPartage).reduce((s, m) => s + (+m.debit || 0), 0);

  const interets = (etat.prets || []).reduce((s, p) => s + interetsRecusAnnee(p, annee), 0);
  const produits = interets + autresProduits;
  const resultat = produits - charges;

  const totalApports = cotisations.reduce((s, c) => s + (+c.montant || 0), 0);

  const lignes = (etat.adherents || []).map((a) => {
    const apport = cotisations
      .filter((c) => c.adherentId === a.id)
      .reduce((s, c) => s + (+c.montant || 0), 0);
    const part = totalApports ? apport / totalApports : 0;
    const quotePart = Math.round(resultat * part);
    const dette = encoursAdherent(etat, a.id);
    const base = mode === 'resultat' ? 0 : apport;
    return { adherent: a, apport, part, quotePart, dette, aRecevoir: base + quotePart - dette };
  }).filter((l) => l.apport > 0 || l.dette > 0)
    .sort((x, y) => y.apport - x.apport);

  const aDistribuer = lignes.reduce((s, l) => s + l.aRecevoir, 0);
  const t = totaux(etat, null);

  return {
    annee, mode,
    totalApports, interets, autresProduits, produits, charges, resultat,
    remisTour, dejaPartage,
    lignes, aDistribuer,
    disponible: t.solde,
    dehors: t.capitalDehors,
    // Le signal qui compte : peut-on payer ce qu'on annonce ?
    manque: Math.max(0, aDistribuer - t.solde)
  };
}

/* -------------------------------------------------------- tour de rôle --- */

/**
 * La tontine « à tour de rôle » : tout le monde verse, et la totalité du mois
 * revient à une personne différente à chaque fois, jusqu'à ce que chacun ait
 * reçu une fois. Elle coexiste ici avec la caisse d'épargne et de prêts : la
 * même association pratique souvent les deux, et rien n'oblige à choisir.
 *
 * Le tour vit dans la fiche de l'association, comme les moyens de versement —
 * donc dans le journal, sans table nouvelle ni migration à faire tourner sur
 * une base déjà en service. Il tient en trois choses :
 *
 *   ordre  : les adhérents, dans l'ordre convenu ;
 *   debut  : le mois du premier tour ;
 *   recus  : ce qui a RÉELLEMENT été remis — le reste n'est qu'une prévision.
 *
 * Le calendrier n'est donc jamais stocké : il se déduit. Décaler le départ
 * d'un mois décale tout le monde, sans rien réécrire.
 */
export function tour(etat) {
  const t = etat?.association?.tour;
  if (!t || !Array.isArray(t.ordre) || !t.ordre.length) return null;
  if (t.actif === false) return null;
  return { actif: true, ordre: t.ordre, debut: t.debut || null, recus: t.recus || [] };
}

function ajouterMois(annee, mois, n) {
  const total = (annee * 12) + (mois - 1) + n;
  return { annee: Math.floor(total / 12), mois: (total % 12) + 1 };
}

/** Ce qui est entré dans la caisse pour ce mois — c'est ce que reçoit le bénéficiaire. */
export function cagnotteDuMois(etat, annee, mois) {
  return (etat.cotisations || [])
    .filter((c) => c.annee === annee && c.mois === mois)
    .reduce((s, c) => s + (+c.montant || 0), 0);
}

/**
 * Le calendrier complet du tour : un rang par adhérent inscrit.
 * [{ rang, annee, mois, adherent, recu, cagnotte, etat }] où etat vaut
 * 'recu' | 'a-remettre' | 'attendu'.
 */
export function calendrierTour(etat) {
  const t = tour(etat);
  if (!t) return [];
  const debut = t.debut || { annee: new Date().getFullYear(), mois: 1 };
  const maintenant = new Date();
  const rangCourant = (maintenant.getFullYear() * 12) + maintenant.getMonth();

  return t.ordre.map((adherentId, i) => {
    const { annee, mois } = ajouterMois(debut.annee, debut.mois, i);
    const recu = t.recus.find((r) => r.adherentId === adherentId
      && r.annee === annee && r.mois === mois)
      || t.recus.find((r) => r.adherentId === adherentId && r.rang === i);
    const passe = (annee * 12) + (mois - 1) <= rangCourant;
    return {
      rang: i,
      annee, mois,
      adherent: etat.adherents.find((a) => a.id === adherentId) || null,
      adherentId,
      recu: recu || null,
      cagnotte: cagnotteDuMois(etat, annee, mois),
      etat: recu ? 'recu' : passe ? 'a-remettre' : 'attendu'
    };
  });
}

/** Le tour en cours ou le prochain à honorer. */
export function prochainTour(etat) {
  const cal = calendrierTour(etat);
  return cal.find((l) => l.etat === 'a-remettre') || cal.find((l) => l.etat === 'attendu') || null;
}

/** Le tour qui tombe précisément sur ce mois-là, s'il y en a un. */
export function tourDuMois(etat, annee, mois) {
  return calendrierTour(etat).find((l) => l.annee === annee && l.mois === mois) || null;
}

/* ------------------------------------------------- cotisation attendue --- */

/**
 * Ce qu'un adhérent doit verser chaque mois.
 *
 * Dans cette tontine les engagements ne sont pas égaux : l'un met 2 000, un
 * autre 50 000. Le montant vit donc sur la fiche de l'adhérent. Le montant de
 * l'association ne sert que de valeur par défaut, pour ceux qui n'ont rien
 * déclaré de particulier. Zéro partout = pas d'engagement fixe, et alors
 * l'application ne réclame rien à personne : mieux vaut ne rien dire que
 * réclamer à tort.
 */
export function attenduMensuel(etat, adherent) {
  const propre = +adherent?.montantMensuel;
  if (Number.isFinite(propre) && propre > 0) return propre;
  const defaut = +etat?.association?.cotisationMensuelle;
  return Number.isFinite(defaut) && defaut > 0 ? defaut : 0;
}

/** Y a-t-il au moins un engagement chiffré quelque part ? */
export function aDesEngagements(etat) {
  return (etat?.adherents || []).some((a) => attenduMensuel(etat, a) > 0);
}

/**
 * L'état des versements d'un mois, adhérent par adhérent.
 * Renvoie [{ adherent, attendu, verse, manque, statut }] où statut vaut
 * 'paye' | 'partiel' | 'rien' | 'libre' (aucun montant attendu).
 */
export function suiviDuMois(etat, annee, mois) {
  return (etat?.adherents || [])
    .filter((a) => a.actif !== false)
    .map((a) => {
      const attendu = attenduMensuel(etat, a);
      const verse = (etat.cotisations || [])
        .filter((c) => c.adherentId === a.id && c.annee === annee && c.mois === mois)
        .reduce((s, c) => s + (+c.montant || 0), 0);
      const manque = Math.max(0, attendu - verse);
      const statut = !attendu ? (verse > 0 ? 'paye' : 'libre')
        : manque === 0 ? 'paye' : verse > 0 ? 'partiel' : 'rien';
      return { adherent: a, attendu, verse, manque, statut };
    })
    .sort((x, y) => y.manque - x.manque
      || (x.adherent.numero || '').localeCompare(y.adherent.numero || ''));
}

/** Ceux à relancer : il manque quelque chose, et on sait combien. */
export function impayesDuMois(etat, annee, mois) {
  return suiviDuMois(etat, annee, mois).filter((l) => l.manque > 0);
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
