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
    const r = await fetch(`${this.url}/auth/v1/signup`, {
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
      if (/already registered|already exists/i.test(m)) {
        throw new Error('Cette adresse a déjà un compte. Utilisez « Se connecter ».');
      }
      if (/password/i.test(m) && /least|court|short/i.test(m)) {
        throw new Error('Mot de passe trop court : six caractères au minimum.');
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
    const r = await fetch(`${this.url}/auth/v1/token?grant_type=password`, {
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
    const r = await fetch(`${this.url}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { apikey: this.cle, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: this.session.refresh_token })
    });
    if (!r.ok) { this.deconnecter(); throw new Error('Session expirée, reconnectez-vous.'); }
    this.#garder(await r.json());
    return this.session.access_token;
  }

  async #appel(chemin, options = {}) {
    const jeton = await this.#jeton();
    const r = await fetch(this.url + chemin, {
      ...options,
      headers: {
        apikey: this.cle, Authorization: 'Bearer ' + jeton,
        'Content-Type': 'application/json', ...(options.headers || {})
      }
    });
    if (!r.ok) {
      const texte = await r.text().catch(() => '');
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
    const r = await this.#appel(`/rest/v1/profils?select=id,nom,role,adherent_id,valide&id=eq.${id}`);
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
        headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify(evenements.slice(i, i + 200).map((e) => ({
          id: e.id, ts: e.ts, appareil: e.appareil,
          type: e.type, entite: e.entite, donnees: e.donnees
        })))
      });
    }
  }

  /** Liste des comptes, pour l'écran Réglages. */
  async listerProfils() {
    const r = await this.#appel('/rest/v1/profils?select=id,nom,role,adherent_id,valide&order=nom.asc');
    return r.json();
  }

  async majProfil(profil) {
    await this.#appel(`/rest/v1/profils?id=eq.${profil.id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ nom: profil.nom, role: profil.role,
                             adherent_id: profil.adherent_id || null, valide: !!profil.valide })
    });
  }
}
