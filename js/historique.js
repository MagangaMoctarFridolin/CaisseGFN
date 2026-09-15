/* ============================================================================
   historique.js — Le journal des écritures, rendu lisible.

   L'application ne conserve pas seulement l'état courant : elle garde la
   suite des écritures qui y ont conduit. Chaque saisie est une ligne ajoutée
   à la fin d'un journal, et rien n'y est jamais réécrit. Cet écran ne fait
   qu'une chose : traduire ces lignes en phrases françaises.

   Ce n'est pas un gadget. Dans une tontine, savoir QUI a inscrit un montant,
   QUAND et DEPUIS QUEL APPAREIL vaut autant que le montant lui-même. Le jour
   où deux personnes ne sont pas d'accord sur ce qui a été versé, c'est ici
   que la réponse se trouve — et elle ne peut pas avoir été maquillée, puisque
   le journal est en écriture seule.
   ========================================================================== */

import * as DB from './db.js';
import { h, toast, telecharger } from './ui.js';

const { fmtNombre, nomComplet, MOIS_NOMS } = DB;

/* ------------------------------------------------------------ dictionnaire */

/**
 * Reconstruit, pour chaque fiche jamais touchée, la dernière version connue
 * de ses données — y compris celles qui ont été supprimées depuis.
 *
 * Sans cela, la ligne « suppression de l'adhérent adh_k3f… » resterait
 * illisible : la fiche n'existe plus dans l'état courant, donc plus aucun nom
 * n'y est attaché. Le journal, lui, se souvient.
 */
function dictionnaire(evenements) {
  const fiches = new Map();
  for (const e of evenements) {
    if (!e.donnees?.id || e.entite === 'association') continue;
    const cle = e.entite + ':' + e.donnees.id;
    fiches.set(cle, { ...(fiches.get(cle) || {}), ...e.donnees });
  }
  return fiches;
}

function fiche(dict, entite, id) {
  return (id && dict.get(entite + ':' + id)) || null;
}

function quiEst(dict, id) {
  const a = fiche(dict, 'adherent', id);
  return a ? nomComplet(a) : 'un adhérent retiré depuis';
}

/* -------------------------------------------------------------- traduction */

const LIBELLE_ENTITE = {
  association: "l'association", adherent: 'un adhérent', cotisation: 'une cotisation',
  pret: 'un prêt', mouvement: 'un mouvement', compte: 'un compte'
};

/**
 * Une écriture en une phrase. `premiere` dit si c'est la première fois que
 * cette fiche apparaît dans le journal : « ajout » plutôt que « modification ».
 */
export function decrire(e, dict, premiere, etat) {
  const d = e.donnees || {};
  const suppression = e.type === 'delete';
  const verbe = suppression ? 'Suppression' : premiere ? 'Ajout' : 'Modification';

  switch (e.entite) {
    case 'cotisation': {
      const qui = quiEst(dict, d.adherentId ?? fiche(dict, 'cotisation', d.id)?.adherentId);
      const c = suppression ? fiche(dict, 'cotisation', d.id) || {} : d;
      const periode = c.mois ? `${MOIS_NOMS[(c.mois || 1) - 1]} ${c.annee || ''}`.trim() : '';
      return {
        verbe, sujet: 'Cotisation',
        texte: [qui, periode].filter(Boolean).join(' — '),
        montant: suppression ? null : +d.montant || 0,
        precision: [c.moyen ? DB.nomCanal(etat, c.moyen) : null, c.reference]
          .filter(Boolean).join(' · ')
      };
    }
    case 'adherent': {
      const a = suppression ? fiche(dict, 'adherent', d.id) || {} : d;
      return {
        verbe, sujet: 'Adhérent', texte: nomComplet(a),
        precision: [a.numero, a.fonction ? DB.nomFonction(a.fonction) : null,
          a.actif === false ? 'inactif' : null].filter(Boolean).join(' · ')
      };
    }
    case 'pret': {
      const p = suppression ? fiche(dict, 'pret', d.id) || {} : d;
      const qui = quiEst(dict, p.adherentId);
      const nbRemb = (d.remboursements || []).length;
      return {
        verbe: suppression ? 'Suppression' : premiere ? 'Octroi' : 'Modification',
        sujet: 'Prêt', texte: qui,
        montant: suppression ? null : +p.montant || 0,
        precision: [p.objet, !premiere && nbRemb ? `${nbRemb} remboursement${nbRemb > 1 ? 's' : ''} enregistré${nbRemb > 1 ? 's' : ''}` : null]
          .filter(Boolean).join(' · ')
      };
    }
    case 'mouvement': {
      const m = suppression ? fiche(dict, 'mouvement', d.id) || {} : d;
      const signe = +m.credit ? +m.credit : -(+m.debit || 0);
      // Dire de QUELLE caisse il s'agit : sans cela, une dépense de projet
      // ressemblerait à une dépense de la caisse familiale.
      const caisse = m.projetId ? DB.projet(etat, m.projetId)?.nom || 'projet supprimé' : '';
      return {
        verbe, sujet: m.nature || 'Mouvement',
        texte: m.objet || (m.adherentId ? quiEst(dict, m.adherentId) : 'Écriture de caisse'),
        montant: suppression ? null : signe,
        precision: [caisse ? 'caisse « ' + caisse + ' »' : null, m.remarques]
          .filter(Boolean).join(' · ')
      };
    }
    case 'compte': {
      const c = suppression ? fiche(dict, 'compte', d.id) || {} : d;
      return { verbe, sujet: 'Compte local', texte: c.nom || c.identifiant || '—',
        precision: c.role === 'admin' ? 'administrateur' : 'consultation' };
    }
    case 'association': {
      const champs = Object.keys(d).filter((k) => k !== 'id');
      const nomsLisibles = {
        nom: 'nom', adresse: 'adresse', telephone: 'téléphone', email: 'e-mail',
        airtelMoney: 'numéro Airtel Money', canaux: 'moyens de versement',
        devise: 'devise', anneeDemarrage: 'année de démarrage',
        cotisationMensuelle: 'cotisation mensuelle de référence', tour: 'tour de rôle',
        projets: 'caisses de projet'
      };
      return { verbe: 'Réglage', sujet: 'Association',
        texte: champs.length > 4 ? 'Fiche de l’association mise à jour'
          : champs.map((k) => nomsLisibles[k] || k).join(', ') };
    }
    default:
      return { verbe, sujet: LIBELLE_ENTITE[e.entite] || e.entite, texte: '—' };
  }
}

/* ------------------------------------------------------------------- écran */

const PAS = 60;

const PERIODES = [
  { cle: 'tout', nom: 'Depuis le début', depuis: () => null },
  { cle: '7', nom: '7 derniers jours', depuis: () => Date.now() - 7 * 864e5 },
  { cle: '30', nom: '30 derniers jours', depuis: () => Date.now() - 30 * 864e5 },
  { cle: 'annee', nom: 'Cette année', depuis: () => new Date(new Date().getFullYear(), 0, 1).getTime() }
];

const FILTRES_OBJET = [
  { cle: '', nom: 'Toutes les écritures' },
  { cle: 'cotisation', nom: 'Cotisations' },
  { cle: 'adherent', nom: 'Adhérents' },
  { cle: 'pret', nom: 'Prêts' },
  { cle: 'mouvement', nom: 'Caisse' },
  { cle: 'association', nom: 'Réglages' }
];

function horodatage(ts) {
  const d = new Date(ts);
  if (isNaN(d)) return '—';
  const aujourdhui = new Date();
  const memeJour = d.toDateString() === aujourdhui.toDateString();
  const heure = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return memeJour ? "aujourd'hui " + heure
    : d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }) + ' ' + heure;
}

export function vueHistorique(ctx) {
  const { etat, synchro } = ctx;

  const tout = DB.fusionner(synchro.evenementsLocaux, synchro.evenementsDistants);
  const dict = dictionnaire(tout);

  // Première apparition d'une fiche : c'est ce qui distingue « ajout » de
  // « modification ». On le calcule dans l'ordre chronologique, une fois.
  const vues = new Set();
  const enrichis = tout.map((e) => {
    const cle = e.entite + ':' + (e.donnees?.id || '');
    const premiere = !vues.has(cle);
    vues.add(cle);
    return { e, premiere, d: decrire(e, dict, premiere, etat) };
  }).reverse(); // du plus récent au plus ancien

  let periode = 'tout';
  let objet = '';
  let recherche = '';
  let limite = PAS;

  const liste = h('div');
  const compteur = h('span', { class: 'doux pousse' });

  const filtrer = () => {
    const depuis = PERIODES.find((p) => p.cle === periode)?.depuis() ?? null;
    const q = recherche.trim().toLowerCase();
    return enrichis.filter(({ e, d }) => {
      if (objet && e.entite !== objet) return false;
      if (depuis && new Date(e.ts).getTime() < depuis) return false;
      if (q) {
        const foin = [d.sujet, d.texte, d.precision, e.appareil].filter(Boolean).join(' ').toLowerCase();
        if (!foin.includes(q)) return false;
      }
      return true;
    });
  };

  const dessiner = () => {
    const retenus = filtrer();
    compteur.textContent = retenus.length
      ? `${fmtNombre(retenus.length)} écriture${retenus.length > 1 ? 's' : ''}`
      : 'aucune écriture';

    if (!retenus.length) {
      liste.replaceChildren(h('div', { class: 'carte' }, h('p', { class: 'vide' },
        tout.length ? 'Aucune écriture ne correspond à cette recherche.'
          : 'Le journal est vide : rien n’a encore été saisi sur cet appareil.')));
      return;
    }

    const visibles = retenus.slice(0, limite);
    liste.replaceChildren(
      h('div', { class: 'carte' }, h('div', { class: 'defilable' }, h('table', { class: 'journal' },
        h('thead', {}, h('tr', {},
          h('th', {}, 'Quand'), h('th', {}, 'Écriture'),
          h('th', { class: 'num' }, 'Montant'), h('th', {}, 'Appareil'))),
        h('tbody', {}, visibles.map(({ e, d }) => h('tr', {},
          h('td', { class: 'doux', style: 'white-space:nowrap' }, horodatage(e.ts)),
          h('td', {},
            h('span', { class: 'etiquette' + (d.verbe === 'Suppression' ? ' retard' : '') }, d.verbe),
            ' ',
            h('strong', { style: 'font-weight:600' }, d.sujet),
            d.texte ? h('span', {}, ' — ' + d.texte) : null,
            d.precision ? h('div', { class: 'doux' }, d.precision) : null),
          h('td', { class: 'num' }, d.montant == null ? '—'
            : (d.montant < 0 ? '− ' : '') + fmtNombre(Math.abs(d.montant))),
          h('td', { class: 'doux' }, e.appareil || '—'))))))),
      retenus.length > limite
        ? h('div', { class: 'barre', style: 'justify-content:center' },
            h('button', { onClick: () => { limite += PAS; dessiner(); } },
              `Afficher ${Math.min(PAS, retenus.length - limite)} écritures de plus`))
        : h('p', { class: 'doux', style: 'text-align:center' },
            'Fin du journal — ' + fmtNombre(retenus.length) + ' écriture' + (retenus.length > 1 ? 's' : '') + '.'));
  };

  const relancer = () => { limite = PAS; dessiner(); };

  const choix = (options, valeur, surChangement) => h('select', {
    style: 'width:auto', onChange: (e) => { surChangement(e.target.value); relancer(); }
  }, options.map((o) => h('option', { value: o.cle, selected: o.cle === valeur }, o.nom)));

  const champRecherche = h('input', {
    type: 'search', placeholder: 'Rechercher un nom, un appareil…',
    style: 'width:auto;min-width:12rem',
    onInput: (e) => { recherche = e.target.value; relancer(); }
  });

  dessiner();

  return h('div', {},
    h('div', { class: 'barre' },
      h('h1', {}, 'Journal'),
      choix(PERIODES, periode, (v) => { periode = v; }),
      choix(FILTRES_OBJET, objet, (v) => { objet = v; }),
      champRecherche,
      compteur),
    h('p', { class: 'doux', style: 'margin-top:-.4rem' },
      'Chaque saisie faite dans l’application ajoute une ligne ici, et aucune ligne n’est jamais réécrite : corriger un montant n’efface pas l’ancien, cela ajoute une correction au-dessus. C’est la mémoire de la caisse — celle qu’on ouvre le jour où deux personnes ne se souviennent pas de la même chose.'),
    liste,
    h('div', { class: 'barre', style: 'margin-top:1rem' },
      h('button', { onClick: () => exporterJournal(enrichis) },
        'Exporter le journal (CSV)'),
      h('button', { onClick: () => window.print() }, 'Imprimer')));
}

function exporterJournal(enrichis) {
  const sep = ';';
  const propre = (v) => String(v ?? '').replace(/[;\r\n]/g, ' ');
  const lignes = [['Date', 'Heure', 'Action', 'Objet', 'Détail', 'Montant', 'Appareil', 'Identifiant'].join(sep)];
  for (const { e, d } of [...enrichis].reverse()) {
    const dt = new Date(e.ts);
    lignes.push([
      isNaN(dt) ? '' : dt.toLocaleDateString('fr-FR'),
      isNaN(dt) ? '' : dt.toLocaleTimeString('fr-FR'),
      propre(d.verbe), propre(d.sujet), propre([d.texte, d.precision].filter(Boolean).join(' · ')),
      d.montant == null ? '' : Math.round(d.montant),
      propre(e.appareil), propre(e.id)
    ].join(sep));
  }
  telecharger(`journal-ecritures-${new Date().toISOString().slice(0, 10)}.csv`,
    '﻿' + lignes.join('\r\n'), 'text/csv;charset=utf-8');
  toast('Journal exporté — ' + fmtNombre(enrichis.length) + ' écritures.');
}
