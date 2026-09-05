/* ============================================================================
   app.js — Démarrage, navigation, session.
   ========================================================================== */

import * as DB from './db.js';
import { Synchro } from './synchro.js';
import * as UI from './ui.js';
import * as Comptes from './comptes.js';
import { CONFIG } from '../config.js';

const { h, toast } = UI;

const ONGLETS = [
  { cle: 'tableau', nom: 'Tableau de bord', vue: UI.vueTableauBord },
  { cle: 'adherents', nom: 'Adhérents', vue: UI.vueAdherents },
  { cle: 'cotisations', nom: 'Cotisations', vue: UI.vueCotisations },
  { cle: 'prets', nom: 'Prêts', vue: UI.vuePrets },
  { cle: 'comptabilite', nom: 'Comptabilité', vue: UI.vueComptabilite },
  { cle: 'rapports', nom: 'Rapports', vue: UI.vueRapports },
  { cle: 'reglages', nom: 'Réglages', vue: UI.vueReglages }
];

const synchro = new Synchro(CONFIG);
let ongletActif = localStorage.getItem('tontine:onglet') || 'tableau';
let annee = +localStorage.getItem('tontine:annee') || 0;   // 0 = à déterminer au démarrage
let session = null;
let feuilleStyle = '';

/* ------------------------------------------------------------------ contexte */

function contexte() {
  return {
    etat: synchro.etat,
    synchro,
    session,
    annee,
    peutEcrire: session?.role === 'admin',
    setAnnee(a) { annee = a; localStorage.setItem('tontine:annee', a); rendre(); },
    rafraichir: rendre,
    blocComptes: session?.role === 'admin' ? Comptes.blocComptes : null,
    deconnexion() { Comptes.fermerSession(); session = null; rendre(); },
    async enregistrer(entite, type, donnees) {
      if (session?.role !== 'admin' && !(entite === 'compte' && !synchro.etat.comptes.length)) {
        return toast('Consultation seule : vous ne pouvez pas modifier les données.');
      }
      try { await synchro.enregistrer(entite, type, donnees); }
      catch (e) { toast('Erreur : ' + e.message); }
    },
    exporterConsultation() {
      const nom = `tontine-${(synchro.etat.association.nom || 'situation')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${new Date().toISOString().slice(0, 10)}.html`;
      UI.telecharger(nom, Comptes.fichierConsultation(synchro.etat, feuilleStyle), 'text/html;charset=utf-8');
    },
    async partagerConsultation() {
      const contenu = Comptes.fichierConsultation(synchro.etat, feuilleStyle);
      const fichier = new File([contenu], 'situation-tontine.html', { type: 'text/html' });
      if (navigator.canShare?.({ files: [fichier] })) {
        try {
          await navigator.share({ files: [fichier], title: synchro.etat.association.nom,
            text: 'Situation de la tontine' });
          return;
        } catch { /* partage annulé */ }
      }
      this.exporterConsultation();
      toast('Fichier téléchargé — envoyez-le depuis WhatsApp.');
    }
  };
}

/* ------------------------------------------------------------------- rendu */

/** Première ouverture : se placer sur l'année la plus récente qui contient des données. */
function anneeParDefaut(etat) {
  const avecDonnees = [...new Set(etat.cotisations.map((c) => c.annee))].filter(Boolean);
  const courante = new Date().getFullYear();
  if (!avecDonnees.length) return courante;
  return avecDonnees.includes(courante) ? courante : Math.max(...avecDonnees);
}

function rendre() {
  const app = document.getElementById('app');
  const etat = synchro.etat;
  if (!annee) annee = anneeParDefaut(etat);

  majEtatSynchro();

  // Aucun compte : on demande la création du premier administrateur.
  if (!Comptes.comptesDe(etat).length) {
    document.getElementById('onglets').hidden = true;
    app.replaceChildren(Comptes.ecranPremierAdmin(async (compte) => {
      await synchro.enregistrer('compte', 'upsert', compte);
      Comptes.ouvrirSession(compte);
      session = compte;
      rendre();
    }));
    return;
  }

  session = session || Comptes.sessionCourante(etat);
  if (!session) {
    document.getElementById('onglets').hidden = true;
    app.replaceChildren(Comptes.ecranConnexion(etat, (c) => {
      Comptes.ouvrirSession(c); session = c; rendre();
    }));
    return;
  }

  document.getElementById('onglets').hidden = false;
  const ctx = contexte();
  const onglet = ONGLETS.find((o) => o.cle === ongletActif) || ONGLETS[0];
  dessinerOnglets();
  app.replaceChildren(onglet.vue(ctx));
  document.querySelector('#entete .titre').textContent = etat.association.nom || 'Tontine';
}

function dessinerOnglets() {
  const nav = document.getElementById('onglets');
  nav.replaceChildren(...ONGLETS.map((o) => h('button', {
    'aria-current': o.cle === ongletActif ? 'page' : null,
    onClick: () => { ongletActif = o.cle; localStorage.setItem('tontine:onglet', o.cle); rendre(); }
  }, o.nom)));
}

function majEtatSynchro() {
  const z = document.getElementById('etatSynchro');
  if (!z) return;
  let classe = 'hors', texte = 'Hors ligne';
  if (synchro.enCours) { classe = ''; texte = 'Synchronisation…'; }
  else if (synchro.erreur) { classe = 'souci'; texte = 'Synchro à refaire'; }
  else if (synchro.distant) { classe = 'ok'; texte = 'OneDrive à jour'; }
  else { classe = 'hors'; texte = 'Sur cet appareil'; }
  z.className = classe;
  z.replaceChildren(h('span', { class: 'pastille' }), h('span', {}, texte));
  z.title = synchro.erreur || (synchro.derniereSynchro
    ? 'Dernière synchronisation à ' + synchro.derniereSynchro.toLocaleTimeString('fr-FR') : '');
}

/* --------------------------------------------------------------- démarrage */

async function demarrer() {
  try {
    feuilleStyle = await (await fetch('app.css')).text();
  } catch { feuilleStyle = ''; }

  synchro.addEventListener('maj', rendre);
  document.getElementById('etatSynchro').addEventListener('click', () => synchro.synchroniser());

  await synchro.demarrer();
  rendre();

  // Reprise automatique des données du classeur au tout premier lancement.
  if (!synchro.nbEvenements) {
    try {
      const texte = await (await fetch('donnees/journal/ev-reprise-excel.jsonl')).text();
      await synchro.importerJournal(texte, 'ev-reprise-excel.jsonl');
      annee = anneeParDefaut(synchro.etat);
      rendre();
    } catch { /* pas de fichier de reprise : on démarre à vide */ }
  }

  // Synchronisation régulière et au retour au premier plan.
  setInterval(() => { if (!document.hidden) synchro.synchroniser(); }, 90_000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) synchro.synchroniser(); });
  window.addEventListener('online', () => synchro.synchroniser());

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

demarrer();
