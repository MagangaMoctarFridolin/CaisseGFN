/* ============================================================================
   synchro.js — Orchestre le cache local et OneDrive.

   Règle d'or : cet appareil n'écrit QUE dans son propre fichier journal.
   Il lit ceux des autres. Aucun fichier n'est donc jamais écrit par deux
   appareils à la fois, et OneDrive n'a aucun conflit à résoudre.
   ========================================================================== */

import * as DB from './db.js';
import { StockageLocal, StockageDossier, StockageGraph } from './stockage.js';

export class Synchro extends EventTarget {
  constructor(config) {
    super();
    this.config = config;
    this.local = new StockageLocal();
    this.dossier = new StockageDossier();
    this.graph = new StockageGraph(config.graph);
    this.distant = null;          // dossier | graph | null
    this.evenementsLocaux = [];   // journal de CET appareil
    this.evenementsDistants = []; // journaux des autres appareils
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

  prevenir() { this.dispatchEvent(new CustomEvent('maj')); }

  /* ---------------------------------------------------------------- démarrage */

  async demarrer() {
    // 1. Le cache local d'abord : l'application s'affiche immédiatement.
    this.evenementsLocaux = DB.lireJournal(await this.local.lireFichier(this.monJournal));
    const cacheDistant = await this.local.lireFichier('cache-distant.jsonl');
    this.evenementsDistants = DB.lireJournal(cacheDistant);
    this.recalculer();

    // 2. Retour d'une connexion Microsoft ?
    if (this.graph.disponible()) {
      try {
        if (await this.graph.terminerConnexion()) this.distant = this.graph;
        else if (this.graph.estConnecte()) this.distant = this.graph;
      } catch (e) { this.erreur = e.message; }
    }
    // 3. Dossier Windows autorisé lors d'une session précédente ?
    if (!this.distant && this.dossier.disponible() && await this.dossier.restaurer()) {
      this.distant = this.dossier;
    }
    this.prevenir();
    if (this.distant) this.synchroniser().catch(() => {});
  }

  async connecterDossier() {
    await this.dossier.connecter();
    this.distant = this.dossier;
    await this.synchroniser();
  }

  async connecterOneDrive() {
    if (!this.graph.disponible()) throw new Error("Identifiant d'application Microsoft absent — voir Réglages.");
    await this.graph.connecter(); // provoque une redirection
  }

  deconnecter() {
    if (this.distant === this.graph) this.graph.deconnecter();
    this.distant = null;
    this.prevenir();
  }

  /* ------------------------------------------------------------------ écriture */

  /** Enregistre une modification : ajoutée au journal local, puis poussée. */
  async enregistrer(entite, type, donnees) {
    const evenement = {
      id: DB.uid('ev'),
      ts: new Date().toISOString(),
      appareil: this.nomAppareil,
      type, entite, donnees
    };
    this.evenementsLocaux.push(evenement);
    this.recalculer();
    this.prevenir();

    const texte = DB.ecrireJournal(this.evenementsLocaux);
    await this.local.ecrireFichier(this.monJournal, texte);   // ne peut pas échouer
    if (this.distant) {
      try {
        await this.distant.ecrireFichier(this.monJournal, texte);
        this.derniereSynchro = new Date();
        this.erreur = null;
      } catch (e) {
        this.erreur = "Modification enregistrée sur cet appareil, mais pas encore envoyée : " + e.message;
      }
      this.prevenir();
    }
    return evenement;
  }

  /* --------------------------------------------------------------- lecture/pull */

  async synchroniser() {
    if (!this.distant || this.enCours) return;
    this.enCours = true; this.prevenir();
    try {
      // On (re)pousse notre journal, au cas où une écriture précédente a échoué.
      await this.distant.ecrireFichier(this.monJournal, DB.ecrireJournal(this.evenementsLocaux));

      const fichiers = await this.distant.listerJournaux();
      const autres = [];
      for (const nom of fichiers) {
        if (nom === `ev-${this.appareilId}.jsonl`) continue;
        const texte = await this.distant.lireFichier('journal/' + nom);
        if (texte) autres.push(...DB.lireJournal(texte));
      }
      this.evenementsDistants = autres;
      await this.local.ecrireFichier('cache-distant.jsonl', DB.ecrireJournal(autres));

      this.recalculer();
      await this.ecrireInstantane();
      this.derniereSynchro = new Date();
      this.erreur = null;
    } catch (e) {
      this.erreur = e.message;
    } finally {
      this.enCours = false;
      this.prevenir();
    }
  }

  /** Copie lisible de l'état complet, pour sauvegarde et inspection humaine. */
  async ecrireInstantane() {
    const instantane = {
      version: 1,
      genereLe: new Date().toISOString(),
      genereePar: this.nomAppareil,
      note: "Copie de sauvegarde reconstruite depuis les journaux. La source de vérité reste le dossier journal/.",
      etat: this.etat
    };
    const texte = JSON.stringify(instantane, null, 1);
    await this.local.ecrireFichier('snapshot.json', texte);
    if (this.distant) { try { await this.distant.ecrireFichier('snapshot.json', texte); } catch { /* non bloquant */ } }
  }

  recalculer() {
    this.etat = DB.rejouer(DB.fusionner(this.evenementsLocaux, this.evenementsDistants));
  }

  /** Importe un journal de reprise (fichier .jsonl) fourni par l'utilisateur. */
  async importerJournal(texte, nomFichier) {
    const evts = DB.lireJournal(texte);
    if (!evts.length) throw new Error('Aucun événement lisible dans ce fichier.');
    const nom = 'journal/' + (nomFichier || 'ev-import.jsonl');
    await this.local.ecrireFichier(nom, texte);
    if (this.distant) await this.distant.ecrireFichier(nom, texte);
    this.evenementsDistants = DB.fusionner(this.evenementsDistants, evts);
    await this.local.ecrireFichier('cache-distant.jsonl', DB.ecrireJournal(this.evenementsDistants));
    this.recalculer();
    this.prevenir();
    return evts.length;
  }

  get nbEvenements() { return this.evenementsLocaux.length + this.evenementsDistants.length; }
}
