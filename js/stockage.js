/* ============================================================================
   stockage.js — Les trois façons d'atteindre la base sur OneDrive.

   1. « local »   : cache dans le navigateur. Toujours actif, permet de
                    travailler hors connexion. Ne sort jamais de l'appareil.
   2. « dossier » : sur Windows, l'application écrit DIRECTEMENT dans le
                    dossier OneDrive synchronisé (File System Access API).
                    C'est le client OneDrive qui se charge de la synchro.
   3. « graph »   : sur le téléphone, l'application parle à OneDrive par
                    l'API Microsoft Graph (connexion au compte Microsoft).

   Tous exposent la même interface :
       disponible(), connecter(), estConnecte(), etiquette()
       listerJournaux() -> [nomFichier]
       lireFichier(chemin) -> texte | null
       ecrireFichier(chemin, texte)
   Les chemins sont relatifs au dossier de données, ex. "journal/ev-pc-x.jsonl".
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
  constructor() { this.type = 'local'; }
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
  constructor() { this.type = 'dossier'; this.racine = null; }

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
