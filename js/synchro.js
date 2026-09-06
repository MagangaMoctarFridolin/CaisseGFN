/* ============================================================================
   synchro.js — Orchestre le cache local et les destinations distantes.

   Un appareil peut avoir PLUSIEURS destinations à la fois. Sur le PC :
   le dossier OneDrive (la base et la sauvegarde) ET Supabase (le canal qui
   rejoint le téléphone). Sur le téléphone : Supabase seul.

   Deux règles gouvernent tout le reste :

   1. Pour les destinations à fichiers, cet appareil n'écrit QUE dans son
      propre fichier journal. Deux appareils ne touchent jamais au même
      fichier, donc OneDrive n'a aucun conflit à arbitrer.
   2. Les événements sont identifiés de façon unique et ne sont jamais
      modifiés. Les rejouer deux fois, dans n'importe quel ordre, donne le
      même résultat — c'est ce qui rend la fusion sûre.
   ========================================================================== */

import * as DB from './db.js';
import { StockageLocal, StockageDossier, StockageGraph, StockageSupabase } from './stockage.js';

export class Synchro extends EventTarget {
  constructor(config) {
    super();
    this.config = config;
    this.local = new StockageLocal();
    this.dossier = new StockageDossier();
    this.graph = new StockageGraph(config.graph);
    this.supabase = new StockageSupabase(config.supabase);

    this.distants = [];           // destinations actives
    this.evenementsLocaux = [];   // journal de CET appareil
    this.evenementsDistants = []; // ce qui vient des autres
    this.aPousser = new Set();    // identifiants pas encore acceptés par une destination
    this.etat = DB.ETAT_VIDE();
    this.derniereSynchro = null;
    this.enCours = false;
    this.erreur = null;

    this.appareilId = localStorage.getItem('tontine:appareil');
    if (!this.appareilId) {
      const type = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'tel' : 'pc';
      this.appareilId = `${type}-${Math.random().toString(36).slice(2, 8)}`;
      localStorage.setItem('tontine:appareil', this.appareilId);
    }
    this.nomAppareil = localStorage.getItem('tontine:appareil:nom') || this.appareilId;
  }

  get monJournal() { return `journal/ev-${this.appareilId}.jsonl`; }
  get modeServeur() { return this.distants.some((d) => d.type === 'supabase'); }

  prevenir() { this.dispatchEvent(new CustomEvent('maj')); }

  #activer(destination) {
    if (!this.distants.includes(destination)) this.distants.push(destination);
  }
  #desactiver(destination) {
    this.distants = this.distants.filter((d) => d !== destination);
  }

  /* ---------------------------------------------------------------- démarrage */

  async demarrer() {
    // 1. Le cache local d'abord : l'application s'affiche immédiatement.
    this.evenementsLocaux = DB.lireJournal(await this.local.lireFichier(this.monJournal));
    this.evenementsDistants = DB.lireJournal(await this.local.lireFichier('cache-distant.jsonl'));
    try {
      const attente = JSON.parse(localStorage.getItem('tontine:a-pousser') || '[]');
      this.aPousser = new Set(attente);
    } catch { /* liste d'attente illisible : elle se reconstruira */ }
    this.recalculer();

    // 2. Destinations déjà autorisées lors d'une session précédente.
    if (this.supabase.disponible() && this.supabase.estConnecte()) {
      this.#activer(this.supabase);
      // Le rôle et l'autorisation d'accès peuvent avoir changé depuis la
      // dernière fois : on les relit AVANT le premier affichage, sinon un
      // compte fraîchement approuvé resterait bloqué sur l'écran d'attente.
      try { await this.supabase.chargerProfil(); }
      catch (e) { this.erreur = e.message; }
    }
    if (this.graph.disponible()) {
      try {
        if (await this.graph.terminerConnexion() || this.graph.estConnecte()) this.#activer(this.graph);
      } catch (e) { this.erreur = e.message; }
    }
    if (this.dossier.disponible() && await this.dossier.restaurer()) this.#activer(this.dossier);

    this.prevenir();
    if (this.distants.length) this.synchroniser().catch(() => {});
  }

  async connecterDossier() {
    await this.dossier.connecter();
    this.#activer(this.dossier);
    await this.synchroniser();
  }

  async inscrireSupabase(email, motDePasse, nom) {
    const profil = await this.supabase.inscrire(email, motDePasse, nom);
    this.#activer(this.supabase);
    await this.synchroniser();
    return profil;
  }

  async rejoindreAvecCode(code) {
    const accepte = await this.supabase.rejoindreAvecCode(code);
    if (accepte) await this.synchroniser();
    this.prevenir();
    return accepte;
  }

  async connecterSupabase(email, motDePasse) {
    const profil = await this.supabase.connecter(email, motDePasse);
    this.#activer(this.supabase);
    await this.synchroniser();
    return profil;
  }

  async connecterOneDrive() {
    if (!this.graph.disponible()) throw new Error("Identifiant d'application Microsoft absent — voir Réglages.");
    await this.graph.connecter();
  }

  deconnecter(type) {
    if (!type || type === 'supabase') { this.supabase.deconnecter(); this.#desactiver(this.supabase); }
    if (!type || type === 'graph') { this.graph.deconnecter?.(); this.#desactiver(this.graph); }
    if (!type || type === 'dossier') this.#desactiver(this.dossier);
    this.prevenir();
  }

  /* ------------------------------------------------------------------ écriture */

  /** Enregistre une modification : journal local d'abord, destinations ensuite. */
  async enregistrer(entite, type, donnees) {
    const evenement = {
      id: DB.uid('ev'),
      ts: new Date().toISOString(),
      appareil: this.nomAppareil,
      type, entite, donnees
    };
    this.evenementsLocaux.push(evenement);
    this.aPousser.add(evenement.id);
    this.recalculer();
    this.prevenir();

    await this.#sauverLocal();
    await this.#pousser();
    this.prevenir();
    return evenement;
  }

  async #sauverLocal() {
    await this.local.ecrireFichier(this.monJournal, DB.ecrireJournal(this.evenementsLocaux));
    localStorage.setItem('tontine:a-pousser', JSON.stringify([...this.aPousser]));
  }

  /** Envoie vers chaque destination ce qu'elle n'a pas encore. */
  async #pousser() {
    if (!this.distants.length) return;
    const enAttente = this.evenementsLocaux.filter((e) => this.aPousser.has(e.id));
    if (!enAttente.length) return;

    let unSucces = false;
    const soucis = [];
    for (const destination of this.distants) {
      try {
        if (destination.mode === 'evenements') {
          await destination.ecrireEvenements(enAttente);
        } else {
          // Les destinations à fichiers reçoivent le journal complet de cet
          // appareil : c'est le seul fichier qu'il a le droit de réécrire.
          await destination.ecrireFichier(this.monJournal, DB.ecrireJournal(this.evenementsLocaux));
        }
        unSucces = true;
      } catch (e) {
        soucis.push(`${destination.etiquette()} : ${e.message}`);
      }
    }

    if (unSucces && !soucis.length) {
      this.aPousser.clear();
      this.derniereSynchro = new Date();
      this.erreur = null;
    } else if (soucis.length) {
      this.erreur = soucis.length === this.distants.length
        ? 'Saisie conservée sur cet appareil, pas encore envoyée. ' + soucis[0]
        : 'Envoyé en partie. ' + soucis.join(' · ');
      if (unSucces) this.derniereSynchro = new Date();
    }
    await this.#sauverLocal();
  }

  /* --------------------------------------------------------------- lecture */

  async synchroniser() {
    if (!this.distants.length || this.enCours) return;
    this.enCours = true; this.prevenir();
    try {
      await this.#pousser();

      const recoltes = [];
      const soucis = [];
      for (const destination of this.distants) {
        try {
          recoltes.push(await this.#tirer(destination));
        } catch (e) { soucis.push(`${destination.etiquette()} : ${e.message}`); }
      }

      // On ne garde que ce qui ne vient pas de nous : notre journal fait foi.
      const miens = new Set(this.evenementsLocaux.map((e) => e.id));
      this.evenementsDistants = DB.fusionner(...recoltes).filter((e) => !miens.has(e.id));
      await this.local.ecrireFichier('cache-distant.jsonl', DB.ecrireJournal(this.evenementsDistants));

      this.recalculer();
      await this.ecrireInstantane();
      this.derniereSynchro = new Date();
      this.erreur = soucis.length ? soucis.join(' · ') : null;
    } catch (e) {
      this.erreur = e.message;
    } finally {
      this.enCours = false;
      this.prevenir();
    }
  }

  async #tirer(destination) {
    if (destination.mode === 'evenements') return destination.lireEvenements();
    const evts = [];
    for (const nom of await destination.listerJournaux()) {
      if (nom === `ev-${this.appareilId}.jsonl`) continue;
      const texte = await destination.lireFichier('journal/' + nom);
      if (texte) evts.push(...DB.lireJournal(texte));
    }
    return evts;
  }

  /**
   * Copie lisible de l'état complet. Écrite dans les destinations à fichiers
   * seulement : c'est la sauvegarde OneDrive, consultable sans l'application.
   */
  async ecrireInstantane() {
    const instantane = {
      version: 1,
      genereLe: new Date().toISOString(),
      genereePar: this.nomAppareil,
      note: "Sauvegarde reconstruite depuis les journaux. La source de vérité reste le dossier journal/.",
      etat: this.etat
    };
    const texte = JSON.stringify(instantane, null, 1);
    await this.local.ecrireFichier('snapshot.json', texte);
    for (const d of this.distants) {
      if (d.mode !== 'fichiers') continue;
      try { await d.ecrireFichier('snapshot.json', texte); } catch { /* non bloquant */ }
    }
  }

  recalculer() {
    this.etat = DB.rejouer(DB.fusionner(this.evenementsLocaux, this.evenementsDistants));
  }

  /** Importe un journal de reprise (.jsonl) fourni par l'utilisateur. */
  async importerJournal(texte, nomFichier) {
    const evts = DB.lireJournal(texte);
    if (!evts.length) throw new Error('Aucun événement lisible dans ce fichier.');

    // Repris comme s'il venait d'un autre appareil, puis poussé vers les
    // destinations qui savent recevoir des événements isolés.
    this.evenementsDistants = DB.fusionner(this.evenementsDistants, evts);
    await this.local.ecrireFichier('cache-distant.jsonl', DB.ecrireJournal(this.evenementsDistants));
    await this.local.ecrireFichier('journal/' + (nomFichier || 'ev-import.jsonl'), texte);

    for (const d of this.distants) {
      try {
        if (d.mode === 'evenements') await d.ecrireEvenements(evts);
        else await d.ecrireFichier('journal/' + (nomFichier || 'ev-import.jsonl'), texte);
      } catch (e) { this.erreur = `Import local réussi, envoi incomplet : ${e.message}`; }
    }
    this.recalculer();
    this.prevenir();
    return evts.length;
  }

  get nbEvenements() { return this.evenementsLocaux.length + this.evenementsDistants.length; }
  get nbEnAttente() { return this.aPousser.size; }
}
