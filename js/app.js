/* ============================================================================
   app.js — Démarrage, navigation, session.

   Deux régimes possibles, choisis automatiquement :

   • Base en ligne configurée (config.js → supabase) : la connexion se fait
     par e-mail et mot de passe, et c'est le SERVEUR qui dit qui a le droit
     d'écrire. Un adhérent est réellement bloqué, pas seulement bridé.

   • Sinon : comptes locaux à code d'accès, stockés dans le journal. Utile
     pour un PC seul, hors ligne, mais la protection n'est que celle de
     l'écran.
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
const surServeur = synchro.supabase.disponible();
let ongletActif = localStorage.getItem('tontine:onglet') || 'tableau';
let annee = +localStorage.getItem('tontine:annee') || 0;
// Tant que l'utilisateur n'a pas choisi une année lui-même, on se replace
// automatiquement sur celle qui contient des données — sinon un appareil qui
// se connecte pour la première fois ouvre une année vide alors que la base
// est pleine.
let anneeChoisie = !!annee;
let session = null;
let feuilleStyle = '';

/* ------------------------------------------------------------------ contexte */

function contexte() {
  const peutEcrire = session?.role === 'admin' && (!surServeur || session?.valide);
  return {
    etat: synchro.etat,
    synchro,
    session,
    annee,
    peutEcrire,
    surServeur,
    setAnnee(a) { annee = a; anneeChoisie = true; localStorage.setItem('tontine:annee', a); rendre(); },
    rafraichir: rendre,
    blocComptes: surServeur
      ? Comptes.blocComptesServeur
      : (peutEcrire ? Comptes.blocComptes : null),
    deconnexion() {
      if (surServeur) synchro.deconnecter('supabase');
      else Comptes.fermerSession();
      session = null;
      rendre();
    },
    async enregistrer(entite, type, donnees) {
      if (!peutEcrire) return toast('Consultation seule : vous ne pouvez pas modifier les données.');
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

/* --------------------------------------------------------------------- rendu */

/** Première ouverture : se placer sur l'année la plus récente qui a des données. */
function anneeParDefaut(etat) {
  const avecDonnees = [...new Set(etat.cotisations.map((c) => c.annee))].filter(Boolean);
  const courante = new Date().getFullYear();
  if (!avecDonnees.length) return courante;
  return avecDonnees.includes(courante) ? courante : Math.max(...avecDonnees);
}

function rendre() {
  const app = document.getElementById('app');
  const etat = synchro.etat;
  if (!anneeChoisie) annee = anneeParDefaut(etat);
  const onglets = document.getElementById('onglets');

  majEtatSynchro();
  document.querySelector('#entete .titre').textContent =
    etat.association.nom || 'Tontine';

  /* --- régime « base en ligne » --------------------------------------- */
  if (surServeur) {
    if (!synchro.supabase.estConnecte()) {
      onglets.hidden = true;
      app.replaceChildren(Comptes.ecranConnexionServeur(synchro, (profil) => {
        session = profil;
        rendre();
      }));
      return;
    }
    session = synchro.supabase.profil;
    // Compte créé mais pas encore approuvé : rien ne doit être visible.
    if (session && !session.valide) {
      onglets.hidden = true;
      app.replaceChildren(Comptes.ecranEnAttente(session, () => {
        synchro.deconnecter('supabase'); session = null; rendre();
      }));
      return;
    }
  } else {
    /* --- régime « comptes locaux » ------------------------------------ */
    if (!Comptes.comptesDe(etat).length) {
      onglets.hidden = true;
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
      onglets.hidden = true;
      app.replaceChildren(Comptes.ecranConnexion(etat, (c) => {
        Comptes.ouvrirSession(c); session = c; rendre();
      }));
      return;
    }
  }

  onglets.hidden = false;
  const ctx = contexte();
  const onglet = ONGLETS.find((o) => o.cle === ongletActif) || ONGLETS[0];
  dessinerOnglets();
  app.replaceChildren(onglet.vue(ctx));
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
  let classe, texte;
  if (synchro.enCours) { classe = ''; texte = 'Synchronisation…'; }
  else if (synchro.nbEnAttente) { classe = 'souci'; texte = `${synchro.nbEnAttente} à envoyer`; }
  else if (synchro.erreur) { classe = 'souci'; texte = 'Synchro à refaire'; }
  else if (synchro.distants.length) {
    classe = 'ok';
    texte = synchro.distants.length > 1 ? 'À jour partout'
      : synchro.distants[0].type === 'supabase' ? 'Base en ligne à jour' : 'OneDrive à jour';
  } else { classe = 'hors'; texte = 'Sur cet appareil'; }
  z.className = classe;
  z.replaceChildren(h('span', { class: 'pastille' }), h('span', {}, texte));
  z.title = synchro.erreur || (synchro.derniereSynchro
    ? 'Dernière synchronisation à ' + synchro.derniereSynchro.toLocaleTimeString('fr-FR') : '');
}

/* ----------------------------------------------------------------- démarrage */

async function demarrer() {
  try { feuilleStyle = await (await fetch('app.css')).text(); } catch { feuilleStyle = ''; }

  synchro.addEventListener('maj', rendre);
  document.getElementById('etatSynchro').addEventListener('click', () => synchro.synchroniser());

  await synchro.demarrer();
  rendre();

  // Reprise des données du classeur au tout premier lancement (PC hors ligne).
  if (!synchro.nbEvenements && !surServeur) {
    try {
      const texte = await (await fetch('donnees/journal/ev-reprise-excel.jsonl')).text();
      await synchro.importerJournal(texte, 'ev-reprise-excel.jsonl');
      rendre();
    } catch { /* pas de fichier de reprise : on démarre à vide */ }
  }

  setInterval(() => { if (!document.hidden) synchro.synchroniser(); }, 90_000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) synchro.synchroniser(); });
  window.addEventListener('online', () => synchro.synchroniser());

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

demarrer();
