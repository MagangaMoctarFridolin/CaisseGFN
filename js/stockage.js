/* ============================================================================
   stockage.js — Les façons d'atteindre la base.

   1. « local »    : cache dans le navigateur. Toujours actif, permet de
                     travailler hors connexion. Ne sort jamais de l'appareil.
   2. « dossier »  : sur Windows, l'application écrit DIRECTEMENT dans le
                     dossier OneDrive synchronisé (File System Access API).
                     C'est le client OneDrive qui se charge de la synchro.
   3. « graph »    : OneDrive par l'API Microsoft Graph. Demande une
                     inscription d'application Microsoft, indisponible dans
                     certains pays — gardé pour ceux qui peuvent l'utiliser.
   4. « supabase » : base partagée en ligne, atteignable depuis n'importe
                     quel appareil, et surtout : les droits d'écriture y sont
                     appliqués par le serveur.

   Deux familles de connecteurs, distinguées par `mode` :
     mode 'fichiers'   → listerJournaux(), lireFichier(), ecrireFichier()
                         (chemins relatifs au dossier de données,
                          ex. "journal/ev-pc-x.jsonl")
     mode 'evenements' → lireEvenements(), ecrireEvenements()

   Tous exposent : disponible(), connecter(), estConnecte(), etiquette().
   ========================================================================== */

const DOSSIER_DONNEES = 'donnees';

/* --------------------------------------------------------- réseau incertain
   Une connexion mobile qui faiblit ne doit ni bloquer l'application, ni faire
   croire à une panne. Trois précautions, appliquées à tous les appels en
   ligne :
     • un délai maximum : au-delà, la requête est abandonnée. Sans cela, une
       requête suspendue laisse la synchronisation « en cours » pour toujours
       et plus rien ne repart ;
     • une reprise automatique quand c'est le réseau qui a lâché, jamais quand
       c'est le serveur qui a répondu « non » — retenter un refus est inutile ;
     • un message qui dit ce qui s'est passé, en français.
   ------------------------------------------------------------------------ */

const DELAI_REQUETE = 20_000;
const PAUSE_REPRISE = 1200;

export async function fetchReseau(url, options = {}, essais = 2) {
  const { reessayable, ...reste } = options;
  for (let i = 0; i < essais; i++) {
    const frein = new AbortController();
    const minuteur = setTimeout(() => frein.abort(), DELAI_REQUETE);
    try {
      return await fetch(url, { ...reste, signal: frein.signal });
    } catch {
      // On n'arrive ici que si la requête n'a PAS abouti : coupure, DNS,
      // délai dépassé. Une réponse HTTP, même 500, ne passe pas par là.
      if (i < essais - 1) await new Promise((r) => setTimeout(r, PAUSE_REPRISE * (i + 1)));
    } finally { clearTimeout(minuteur); }
  }
  throw new Error(navigator.onLine
    ? 'Le serveur ne répond pas. Nouvel essai à la prochaine synchronisation.'
    : 'Pas de connexion : vos saisies restent sur cet appareil et partiront au retour du réseau.');
}

/* ------------------------------------------------------- petit magasin IndexedDB
   (uniquement pour conserver l'autorisation d'accès au dossier Windows) */

function idb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('tontine-poignees', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('cle');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function idbGet(cle) {
  const db = await idb();
  return new Promise((res, rej) => {
    const t = db.transaction('cle', 'readonly').objectStore('cle').get(cle);
    t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error);
  });
}
async function idbSet(cle, valeur) {
  const db = await idb();
  return new Promise((res, rej) => {
    const t = db.transaction('cle', 'readwrite').objectStore('cle').put(valeur, cle);
    t.onsuccess = () => res(); t.onerror = () => rej(t.error);
  });
}

/* =========================================================== 1. cache local === */

export class StockageLocal {
  constructor() { this.type = 'local'; this.mode = 'fichiers'; }
  disponible() { return true; }
  estConnecte() { return true; }
  etiquette() { return 'Cet appareil (hors connexion)'; }
  async connecter() { return true; }

  #cle(chemin) { return 'tontine:fichier:' + chemin; }

  async listerJournaux() {
    const noms = [];
    for (let i = 0; i < localStorage.length; i++) {
      const c = localStorage.key(i);
      if (c && c.startsWith('tontine:fichier:journal/')) noms.push(c.slice('tontine:fichier:'.length + 8));
    }
    return noms;
  }
  async lireFichier(chemin) { return localStorage.getItem(this.#cle(chemin)); }
  async ecrireFichier(chemin, texte) { localStorage.setItem(this.#cle(chemin), texte); }
}

/* ============================== 2. dossier OneDrive synchronisé (Windows/PC) === */

export class StockageDossier {
  constructor() { this.type = 'dossier'; this.mode = 'fichiers'; this.racine = null; }

  disponible() { return typeof window.showDirectoryPicker === 'function'; }
  estConnecte() { return !!this.racine; }
  etiquette() { return this.racine ? `Dossier « ${this.racine.name} »` : 'Dossier OneDrive du PC'; }

  /** Tente de rétablir l'accès accordé lors d'une session précédente. */
  async restaurer() {
    try {
      const poignee = await idbGet('racine');
      if (!poignee) return false;
      const perm = await poignee.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted') return false;
      this.racine = poignee;
      return true;
    } catch { return false; }
  }

  async connecter() {
    const poignee = await window.showDirectoryPicker({ id: 'tontine', mode: 'readwrite' });
    const perm = await poignee.requestPermission({ mode: 'readwrite' });
    if (perm !== 'granted') throw new Error("Autorisation d'écriture refusée sur ce dossier.");
    this.racine = poignee;
    await idbSet('racine', poignee);
    return true;
  }

  async #dossier(chemin, creer) {
    let d = this.racine;
    const parts = chemin.split('/').filter(Boolean);
    for (const p of parts) d = await d.getDirectoryHandle(p, { create: creer });
    return d;
  }

  async listerJournaux() {
    if (!this.racine) return [];
    try {
      const d = await this.#dossier(`${DOSSIER_DONNEES}/journal`, true);
      const noms = [];
      for await (const [nom, h] of d.entries()) if (h.kind === 'file' && nom.endsWith('.jsonl')) noms.push(nom);
      return noms;
    } catch { return []; }
  }

  async lireFichier(chemin) {
    if (!this.racine) return null;
    try {
      const parts = chemin.split('/');
      const nom = parts.pop();
      const d = await this.#dossier([DOSSIER_DONNEES, ...parts].join('/'), false);
      const f = await d.getFileHandle(nom);
      return await (await f.getFile()).text();
    } catch { return null; }
  }

  async ecrireFichier(chemin, texte) {
    if (!this.racine) throw new Error('Aucun dossier sélectionné.');
    const parts = chemin.split('/');
    const nom = parts.pop();
    const d = await this.#dossier([DOSSIER_DONNEES, ...parts].join('/'), true);
    const f = await d.getFileHandle(nom, { create: true });
    const w = await f.createWritable();
    await w.write(texte);
    await w.close();
  }
}

/* ================================= 3. OneDrive par Microsoft Graph (mobile) === */

const AUTORITE = 'https://login.microsoftonline.com/consumers/oauth2/v2.0';
const PORTEE = 'openid profile offline_access Files.ReadWrite';

function base64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function sha256(texte) {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(texte));
}

export class StockageGraph {
  constructor(config) {
    this.type = 'graph';
    this.mode = 'fichiers';
    this.clientId = config?.clientId || '';
    // Dossier de l'application dans OneDrive, ex. "Documents/Nielili/Tontine-App"
    this.cheminOneDrive = (config?.cheminOneDrive || 'Tontine-App').replace(/^\/+|\/+$/g, '');
    this.jeton = null;
    this.expire = 0;
  }

  disponible() { return !!this.clientId; }
  estConnecte() { return !!localStorage.getItem('tontine:graph:refresh'); }
  etiquette() { return 'OneDrive (compte Microsoft)'; }

  /* ---- authentification OAuth 2 avec PKCE, sans bibliothèque externe ---- */

  async connecter() {
    const verif = base64url(crypto.getRandomValues(new Uint8Array(48)));
    const defi = base64url(await sha256(verif));
    sessionStorage.setItem('tontine:pkce', verif);
    const url = new URL(AUTORITE + '/authorize');
    url.search = new URLSearchParams({
      client_id: this.clientId, response_type: 'code',
      redirect_uri: location.origin + location.pathname,
      scope: PORTEE, code_challenge: defi, code_challenge_method: 'S256',
      prompt: 'select_account'
    });
    location.assign(url);
  }

  /** À appeler au démarrage : récupère le code renvoyé par Microsoft. */
  async terminerConnexion() {
    const params = new URLSearchParams(location.search);
    const code = params.get('code');
    if (!code) return false;
    const verif = sessionStorage.getItem('tontine:pkce');
    history.replaceState({}, '', location.pathname);
    if (!verif) return false;
    const r = await fetch(AUTORITE + '/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId, grant_type: 'authorization_code', code,
        redirect_uri: location.origin + location.pathname, code_verifier: verif
      })
    });
    if (!r.ok) throw new Error('Connexion Microsoft refusée : ' + (await r.text()).slice(0, 200));
    this.#garderJetons(await r.json());
    return true;
  }

  #garderJetons(j) {
    this.jeton = j.access_token;
    this.expire = Date.now() + (j.expires_in - 60) * 1000;
    if (j.refresh_token) localStorage.setItem('tontine:graph:refresh', j.refresh_token);
  }

  async #jetonValide() {
    if (this.jeton && Date.now() < this.expire) return this.jeton;
    const refresh = localStorage.getItem('tontine:graph:refresh');
    if (!refresh) throw new Error('Non connecté à OneDrive.');
    const r = await fetch(AUTORITE + '/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId, grant_type: 'refresh_token',
        refresh_token: refresh, scope: PORTEE
      })
    });
    if (!r.ok) {
      localStorage.removeItem('tontine:graph:refresh');
      throw new Error('Session OneDrive expirée, reconnectez-vous.');
    }
    this.#garderJetons(await r.json());
    return this.jeton;
  }

  deconnecter() {
    localStorage.removeItem('tontine:graph:refresh');
    this.jeton = null; this.expire = 0;
  }

  /* ---------------------------- accès aux fichiers ---------------------------- */

  #url(chemin) {
    const p = `${this.cheminOneDrive}/${DOSSIER_DONNEES}/${chemin}`.replace(/\/+/g, '/');
    return 'https://graph.microsoft.com/v1.0/me/drive/root:/' + encodeURI(p);
  }

  async #appel(url, options = {}) {
    const jeton = await this.#jetonValide();
    return fetch(url, {
      ...options,
      headers: { Authorization: 'Bearer ' + jeton, ...(options.headers || {}) }
    });
  }

  async listerJournaux() {
    const r = await this.#appel(this.#url('journal') + ':/children?$select=name&$top=200');
    if (!r.ok) return [];
    const j = await r.json();
    return (j.value || []).map((x) => x.name).filter((n) => n.endsWith('.jsonl'));
  }

  async lireFichier(chemin) {
    const r = await this.#appel(this.#url(chemin) + ':/content');
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('Lecture OneDrive impossible (' + r.status + ')');
    return r.text();
  }

  async ecrireFichier(chemin, texte) {
    const r = await this.#appel(this.#url(chemin) + ':/content', {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body: new Blob([texte], { type: 'text/plain' })
    });
    if (!r.ok) throw new Error('Écriture OneDrive impossible (' + r.status + ')');
  }
}

/* ================================= 4. Supabase — base partagée en ligne === */

/**
 * Contrairement aux trois précédents, ce connecteur ne manipule pas des
 * fichiers mais des lignes : chaque écriture est un enregistrement dans la
 * table « evenements ».
 *
 * L'intérêt principal est ailleurs que dans la technique : les droits sont
 * appliqués PAR LE SERVEUR. Un compte adhérent se voit refuser l'écriture
 * par la base elle-même, et pas seulement par des boutons masqués. C'est la
 * seule façon d'avoir une lecture seule qui tienne vraiment.
 */
export class StockageSupabase {
  constructor(config) {
    this.type = 'supabase';
    this.mode = 'evenements';
    this.url = (config?.url || '').replace(/\/+$/, '');
    this.cle = config?.anonKey || '';
    this.session = null;   // { access_token, refresh_token, expire, utilisateur }
    this.profil = null;    // { id, nom, role }
    this.#restaurer();
  }

  disponible() { return !!(this.url && this.cle); }
  estConnecte() { return !!this.session; }
  etiquette() {
    if (!this.profil) return 'Base en ligne';
    const r = !this.profil.valide ? 'en attente'
      : this.profil.role === 'admin' ? 'administrateur' : 'consultation';
    return `Base en ligne — ${this.profil.nom} (${r})`;
  }

  /* ------------------------------------------------------- session locale */

  #restaurer() {
    try {
      const brut = localStorage.getItem('tontine:supabase:session');
      if (brut) this.session = JSON.parse(brut);
      const p = localStorage.getItem('tontine:supabase:profil');
      if (p) this.profil = JSON.parse(p);
    } catch { /* session illisible : on repart d'une connexion */ }
  }

  #garder(j) {
    this.session = {
      access_token: j.access_token,
      refresh_token: j.refresh_token,
      expire: Date.now() + (j.expires_in - 60) * 1000,
      utilisateur: j.user ? { id: j.user.id, email: j.user.email } : this.session?.utilisateur
    };
    localStorage.setItem('tontine:supabase:session', JSON.stringify(this.session));
  }

  deconnecter() {
    this.session = null; this.profil = null;
    localStorage.removeItem('tontine:supabase:session');
    localStorage.removeItem('tontine:supabase:profil');
  }

  /* ------------------------------------------------------ authentification */

  /**
   * Inscription depuis l'application, sans passer par le tableau de bord.
   * Le tout premier compte cree devient administrateur (c'est la base qui le
   * decide) ; les suivants arrivent en attente d'approbation.
   */
  async inscrire(email, motDePasse, nom) {
    const r = await fetchReseau(`${this.url}/auth/v1/signup`, {
      method: 'POST',
      headers: { apikey: this.cle, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: (email || '').trim(), password: motDePasse,
        data: { nom: (nom || '').trim() }
      })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const m = j.error_description || j.msg || j.message || '';
      if (j.error_code === 'anonymous_provider_disabled' || /anonymous/i.test(m)) {
        // Le serveur n'a reçu aucune adresse : le formulaire est parti vide.
        throw new Error("L'adresse e-mail n'est pas arrivée jusqu'au serveur. Rechargez la page et ressaisissez les trois champs.");
      }
      if (/already registered|already exists/i.test(m)) {
        throw new Error('Cette adresse a déjà un compte. Utilisez « Se connecter ».');
      }
      if (/password/i.test(m) && /least|court|short/i.test(m)) {
        throw new Error('Mot de passe trop court : six caractères au minimum.');
      }
      if (/email/i.test(m) && /invalid/i.test(m)) {
        throw new Error('Adresse e-mail refusée par le serveur : vérifiez la saisie.');
      }
      if (/signups? not allowed|disabled/i.test(m)) {
        throw new Error("Les inscriptions sont fermées sur le serveur. Prévenez l'administrateur.");
      }
      throw new Error(m || "Inscription impossible pour l'instant.");
    }
    if (!j.access_token) {
      // Cas d'une confirmation par e-mail encore exigee cote serveur.
      throw new Error("Compte créé. Confirmez l'adresse par l'e-mail reçu, puis connectez-vous.");
    }
    this.#garder(j);
    await this.chargerProfil();
    return this.profil;
  }

  async connecter(email, motDePasse) {
    const r = await fetchReseau(`${this.url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: this.cle, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: (email || '').trim(), password: motDePasse })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      throw new Error(j.error_description || j.msg || j.message ||
        'Connexion refusée : vérifiez l’adresse e-mail et le mot de passe.');
    }
    this.#garder(j);
    await this.chargerProfil();
    return this.profil;
  }

  async #jeton() {
    if (!this.session) throw new Error('Non connecté.');
    if (Date.now() < this.session.expire) return this.session.access_token;
    const r = await fetchReseau(`${this.url}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { apikey: this.cle, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: this.session.refresh_token }),
      reessayable: true
    });
    if (!r.ok) {
      // Le serveur en panne n'est pas une session expirée : on garde la
      // session et on réessaiera. Seul un vrai refus referme la session.
      if (r.status >= 500) throw new Error('La base en ligne ne répond pas pour le moment.');
      this.deconnecter();
      throw new Error('Session expirée, reconnectez-vous.');
    }
    this.#garder(await r.json());
    return this.session.access_token;
  }

  async #appel(chemin, options = {}) {
    const jeton = await this.#jeton();
    // On ne rejoue d'office qu'une lecture : rejouer une écriture dont la
    // réponse s'est perdue créerait un doublon. Les écritures sûres — celles
    // qui portent un identifiant fourni par l'appareil — le disent.
    const rejouable = !options.method || options.method === 'GET' || options.reessayable;
    const r = await fetchReseau(this.url + chemin, {
      ...options,
      headers: {
        apikey: this.cle, Authorization: 'Bearer ' + jeton,
        'Content-Type': 'application/json', ...(options.headers || {})
      }
    }, rejouable ? 2 : 1);
    if (!r.ok) {
      const texte = await r.text().catch(() => '');
      // Un refus posé par une fonction du serveur (raise exception) arrive avec
      // son message en français : on le montre tel quel, il est plus parlant.
      let motif = '';
      try { motif = (JSON.parse(texte).message || '').trim(); } catch { /* pas du JSON */ }
      if (motif && !/row-level security/i.test(motif)) throw new Error(motif);
      if (r.status === 401 || r.status === 403 || /row-level security/i.test(texte)) {
        throw new Error("Écriture refusée par le serveur : ce compte est en consultation seule.");
      }
      throw new Error(`Supabase a répondu ${r.status}. ${texte.slice(0, 160)}`);
    }
    return r;
  }

  async chargerProfil() {
    const id = this.session?.utilisateur?.id;
    if (!id) return null;
    const r = await this.#appel(`/rest/v1/profils?select=id,nom,role,adherent_id,valide,bloque&id=eq.${id}`);
    const lignes = await r.json();
    this.profil = lignes[0] || {
      id, nom: this.session.utilisateur.email, role: 'adherent', valide: false,
      manquant: true   // aucun profil : traité comme un compte en attente
    };
    localStorage.setItem('tontine:supabase:profil', JSON.stringify(this.profil));
    return this.profil;
  }

  /* ---------------------------------------------------------- événements */

  /** Tous les événements de la base, remis dans la forme utilisée par l'app. */
  async lireEvenements() {
    const tout = [];
    const parPage = 1000;
    for (let debut = 0; ; debut += parPage) {
      const r = await this.#appel(
        `/rest/v1/evenements?select=id,ts,appareil,type,entite,donnees&order=ts.asc`,
        { headers: { Range: `${debut}-${debut + parPage - 1}` } });
      const lignes = await r.json();
      tout.push(...lignes.map((l) => ({
        id: l.id, ts: l.ts, appareil: l.appareil,
        type: l.type, entite: l.entite, donnees: l.donnees
      })));
      if (lignes.length < parPage) break;
    }
    return tout;
  }

  /** Ajoute des événements. Les identifiants déjà présents sont ignorés. */
  async ecrireEvenements(evenements) {
    if (!evenements.length) return;
    for (let i = 0; i < evenements.length; i += 200) {
      await this.#appel('/rest/v1/evenements', {
        method: 'POST',
        // Chaque événement porte son identifiant et la base ignore les
        // doublons : renvoyer deux fois le même lot est sans conséquence.
        reessayable: true,
        headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify(evenements.slice(i, i + 200).map((e) => ({
          id: e.id, ts: e.ts, appareil: e.appareil,
          type: e.type, entite: e.entite, donnees: e.donnees
        })))
      });
    }
  }

  /* ------------------------------------------- code d'accès de l'association */

  /**
   * Présente le code d'accès au serveur. S'il correspond, le compte est
   * approuvé sur-le-champ. La vérification a lieu dans la base : ni le code
   * attendu ni la table qui le contient ne sont accessibles au navigateur.
   */
  async rejoindreAvecCode(code) {
    const r = await this.#appel('/rest/v1/rpc/rejoindre', {
      method: 'POST', body: JSON.stringify({ code: (code || '').trim() })
    });
    const accepte = await r.json();
    if (accepte === true) await this.chargerProfil();
    return accepte === true;
  }

  /** Administrateurs seulement : lire le code en vigueur. */
  async lireCodeAdhesion() {
    const r = await this.#appel('/rest/v1/rpc/lire_code_adhesion', {
      method: 'POST', body: '{}'
    });
    return (await r.json()) || '';
  }

  /** Administrateurs seulement : définir un nouveau code. */
  async definirCodeAdhesion(code) {
    await this.#appel('/rest/v1/rpc/definir_code_adhesion', {
      method: 'POST', body: JSON.stringify({ nouveau: (code || '').trim() })
    });
  }

  /** Liste des comptes, pour l'écran Réglages. */
  async listerProfils() {
    const r = await this.#appel('/rest/v1/profils?select=id,nom,role,adherent_id,valide,bloque&order=nom.asc');
    return r.json();
  }

  async majProfil(profil) {
    await this.#appel(`/rest/v1/profils?id=eq.${profil.id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ nom: profil.nom, role: profil.role,
                             adherent_id: profil.adherent_id || null,
                             valide: !!profil.valide, bloque: !!profil.bloque })
    });
  }

  /* ------------------------------------------- déclarations de versement */

  /**
   * Dépôt d'une déclaration par un adhérent. Ce n'est pas une écriture dans
   * les comptes : c'est une demande, que l'administrateur validera ou non.
   * La base n'accepte la ligne que si l'auteur est bien celui qui la dépose.
   */
  async declarer(d) {
    const r = await this.#appel('/rest/v1/declarations', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        auteur: this.session?.utilisateur?.id,
        nom: this.profil?.nom || '',
        adherent_id: this.profil?.adherent_id || null,
        annee: d.annee, mois: d.mois, montant: d.montant,
        moyen: d.moyen || null, reference: d.reference || null,
        telephone: d.telephone || null, note: d.note || null
      })
    });
    return (await r.json())[0];
  }

  /** L'adhérent ne voit que les siennes : c'est la base qui filtre. */
  async listerDeclarations(statut) {
    const filtre = statut ? `&statut=eq.${statut}` : '';
    const r = await this.#appel(
      `/rest/v1/declarations?select=*${filtre}&order=cree_le.desc&limit=200`);
    return r.json();
  }

  async majDeclaration(id, champs) {
    await this.#appel(`/rest/v1/declarations?id=eq.${id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(champs)
    });
  }

  async supprimerDeclaration(id) {
    await this.#appel(`/rest/v1/declarations?id=eq.${id}`, { method: 'DELETE' });
  }

  /**
   * Suppression définitive d'un compte. C'est le serveur qui décide :
   * réservé aux administrateurs, interdit sur son propre compte, et interdit
   * s'il ne resterait plus aucun administrateur. Le journal des écritures
   * n'est pas touché — les saisies de la personne restent, sans auteur.
   */
  async supprimerCompte(id) {
    await this.#appel('/rest/v1/rpc/supprimer_compte', {
      method: 'POST', body: JSON.stringify({ cible: id })
    });
  }
}
