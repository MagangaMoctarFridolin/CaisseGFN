/* ============================================================================
   comptes.js — Comptes administrateurs et comptes adhérents (consultation).

   Ce qui est vraiment protégé, et ce qui ne l'est pas — à lire une fois :

   • Le code d'accès contrôle CE QUE L'ÉCRAN AUTORISE. Il empêche une saisie
     par erreur, il n'empêche pas quelqu'un de très déterminé qui possède déjà
     le fichier de données de le lire autrement.
   • La vraie barrière est du côté de OneDrive : un adhérent reçoit un lien de
     partage EN LECTURE SEULE (ou simplement le fichier de consultation envoyé
     par WhatsApp). Sans droit d'écriture sur le dossier OneDrive, il ne peut
     rien modifier, quoi qu'il fasse dans l'application.
   • Donc : ne donnez le droit de modification OneDrive qu'aux deux
     administrateurs.
   ========================================================================== */

import * as DB from './db.js';
import { h, formulaire, toast, confirmer } from './ui.js';

const SEL = 'tontine-gfn-v1';

export async function empreinte(code) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(SEL + '|' + code));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function comptesDe(etat) { return etat.comptes || []; }
export function admins(etat) { return comptesDe(etat).filter((c) => c.role === 'admin'); }

/* --------------------------------------------------------------- session */

const CLE_SESSION = 'tontine:session';

export function sessionCourante(etat) {
  try {
    const id = localStorage.getItem(CLE_SESSION);
    if (!id) return null;
    return comptesDe(etat).find((c) => c.id === id) || null;
  } catch { return null; }
}
export function ouvrirSession(compte) { localStorage.setItem(CLE_SESSION, compte.id); }
export function fermerSession() { localStorage.removeItem(CLE_SESSION); }

/* ------------------------------------------------------- écran de connexion */

/** Premier démarrage : aucun compte n'existe encore. */
export function ecranPremierAdmin(surCreation) {
  return h('div', { class: 'accueil' },
    h('div', { class: 'carte', style: 'max-width:460px;margin:3rem auto' },
      h('h1', {}, 'Bienvenue'),
      h('p', { class: 'doux' },
        'Créez le compte du premier administrateur. Vous pourrez ensuite ajouter le second administrateur et les comptes adhérents depuis les Réglages.'),
      h('button', {
        class: 'primaire', onClick: () => formulaire('Premier administrateur', [
          { cle: 'nom', libelle: 'Nom affiché', requis: true },
          { cle: 'identifiant', libelle: 'Identifiant de connexion', requis: true },
          { cle: 'code', libelle: "Code d'accès (au moins 4 caractères)", type: 'password', requis: true }
        ], async (v) => {
          if ((v.code || '').length < 4) return toast('Code trop court.');
          surCreation({
            id: DB.uid('cpt'), nom: v.nom, identifiant: v.identifiant.toLowerCase(),
            role: 'admin', empreinte: await empreinte(v.code)
          });
        })
      }, 'Créer le compte administrateur')));
}

export function ecranConnexion(etat, surConnexion) {
  const message = h('div');
  const identifiant = h('input', { type: 'text', autocapitalize: 'none', autocomplete: 'username' });
  const code = h('input', { type: 'password', autocomplete: 'current-password' });

  const tenter = async () => {
    const c = comptesDe(etat).find((x) => x.identifiant === identifiant.value.trim().toLowerCase());
    const emp = await empreinte(code.value);
    if (!c || c.empreinte !== emp) {
      message.replaceChildren(h('div', { class: 'mauvais' }, 'Identifiant ou code incorrect.'));
      return;
    }
    surConnexion(c);
  };

  const form = h('form', { onSubmit: (e) => { e.preventDefault(); tenter(); } },
    h('div', { style: 'margin-bottom:.7rem' }, h('label', {}, 'Identifiant'), identifiant),
    h('div', { style: 'margin-bottom:1rem' }, h('label', {}, "Code d'accès"), code),
    message,
    h('button', { class: 'primaire', type: 'submit', style: 'width:100%;justify-content:center' }, 'Se connecter'));

  return h('div', {},
    h('div', { class: 'carte', style: 'max-width:400px;margin:3rem auto' },
      h('h1', {}, etat.association?.nom || 'Tontine'),
      h('p', { class: 'doux' }, 'Connectez-vous pour continuer.'),
      form));
}

/* ------------------------------------------------- gestion depuis Réglages */

export function blocComptes(ctx) {
  const { etat, session } = ctx;
  const liste = comptesDe(etat);
  const nbAdmins = admins(etat).length;

  const champsAdherent = () => [{ valeur: '', libelle: '— non lié —' },
    ...etat.adherents.map((a) => ({ valeur: a.id, libelle: DB.nomComplet(a) }))];

  const ajouter = (role) => formulaire(
    role === 'admin' ? 'Nouvel administrateur' : 'Nouveau compte adhérent (consultation)',
    [
      { cle: 'nom', libelle: 'Nom affiché', requis: true },
      { cle: 'identifiant', libelle: 'Identifiant', requis: true },
      { cle: 'code', libelle: "Code d'accès", type: 'password', requis: true },
      ...(role === 'adherent'
        ? [{ cle: 'adherentId', libelle: 'Fiche adhérent associée', type: 'select', options: champsAdherent() }]
        : [])
    ],
    async (v) => {
      if ((v.code || '').length < 4) return toast('Code trop court (4 caractères minimum).');
      const id = v.identifiant.trim().toLowerCase();
      if (liste.some((c) => c.identifiant === id)) return toast('Cet identifiant existe déjà.');
      if (role === 'admin' && nbAdmins >= 2) return toast('Deux administrateurs au maximum.');
      ctx.enregistrer('compte', 'upsert', {
        id: DB.uid('cpt'), nom: v.nom, identifiant: id, role,
        adherentId: v.adherentId || null, empreinte: await empreinte(v.code)
      });
    });

  const changerCode = (c) => formulaire("Nouveau code pour " + c.nom,
    [{ cle: 'code', libelle: "Code d'accès", type: 'password', requis: true }],
    async (v) => {
      if ((v.code || '').length < 4) return toast('Code trop court.');
      ctx.enregistrer('compte', 'upsert', { ...c, empreinte: await empreinte(v.code) });
      toast('Code modifié.');
    });

  const supprimer = (c) => {
    if (c.role === 'admin' && nbAdmins <= 1) return toast('Il doit rester au moins un administrateur.');
    if (c.id === session?.id) return toast('Vous ne pouvez pas supprimer votre propre compte.');
    confirmer(`Supprimer le compte de ${c.nom} ?`, () => ctx.enregistrer('compte', 'delete', { id: c.id }));
  };

  return h('div', { class: 'carte' },
    h('h2', {}, 'Comptes'),
    h('p', { class: 'doux' },
      'Deux administrateurs au maximum : eux seuls peuvent saisir. Les comptes adhérents ouvrent l’application en lecture seule.'),
    h('div', { class: 'defilable' }, h('table', {},
      h('thead', {}, h('tr', {},
        h('th', {}, 'Nom'), h('th', {}, 'Identifiant'), h('th', {}, 'Rôle'), h('th', {}, ''))),
      h('tbody', {}, liste.map((c) => h('tr', {},
        h('td', {}, c.nom, c.id === session?.id ? h('span', { class: 'doux' }, ' (vous)') : null),
        h('td', { class: 'doux' }, c.identifiant),
        h('td', {}, h('span', { class: 'etiquette' + (c.role === 'admin' ? '' : ' attente') },
          c.role === 'admin' ? 'administrateur' : 'consultation')),
        h('td', { style: 'text-align:right;white-space:nowrap' },
          h('button', { onClick: () => changerCode(c) }, 'Code'), ' ',
          h('button', { class: 'danger', onClick: () => supprimer(c) }, '✕'))))))),
    h('div', { class: 'barre', style: 'margin-top:.8rem' },
      h('button', { disabled: nbAdmins >= 2, onClick: () => ajouter('admin') },
        nbAdmins >= 2 ? 'Deux administrateurs déjà créés' : '+ Administrateur'),
      h('button', { onClick: () => ajouter('adherent') }, '+ Compte adhérent')),
    h('p', { class: 'doux', style: 'margin-top:.8rem' },
      'Le code d’accès protège l’écran, pas le fichier. Pour qu’un adhérent ne puisse réellement rien modifier, partagez-lui le dossier OneDrive en lecture seule, ou envoyez-lui simplement le fichier de consultation.'));
}

/* ------------------------------ fichier de consultation à envoyer sur WhatsApp */

/**
 * Fabrique un fichier HTML autonome contenant l'état actuel : il s'ouvre sur
 * n'importe quel téléphone, sans installation, sans compte Microsoft, et ne
 * permet aucune modification.
 */
export function fichierConsultation(etat, styles) {
  const dev = etat.association.devise || 'FCFA';
  const nb = (v) => Math.round(+v || 0).toLocaleString('fr-FR').replace(/ | /g, ' ');
  const annees = DB.anneesConnues(etat).filter((a) =>
    etat.cotisations.some((c) => c.annee === a));
  const annee = annees[0] ?? new Date().getFullYear();
  const t = DB.totaux(etat, annee);
  const global = DB.totaux(etat, null);

  const lignes = [...etat.adherents]
    .sort((a, b) => DB.totalCotisationsAdherent(etat, b.id) - DB.totalCotisationsAdherent(etat, a.id))
    .map((a) => {
      const mois = Array.from({ length: 12 }, (_, i) => etat.cotisations
        .filter((c) => c.adherentId === a.id && c.annee === annee && c.mois === i + 1)
        .reduce((s, c) => s + (+c.montant || 0), 0));
      return `<tr><td class="nom">${echapper(DB.nomComplet(a))}</td>${
        mois.map((m) => `<td class="num">${m ? nb(m) : '—'}</td>`).join('')
      }<td class="num" style="font-weight:650">${nb(DB.totalCotisationsAdherent(etat, a.id, annee))}</td>
        <td class="num">${nb(DB.totalCotisationsAdherent(etat, a.id))}</td></tr>`;
    }).join('');

  const totMois = DB.parMois(etat, annee);

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${echapper(etat.association.nom)} — consultation</title>
<style>${styles}
body{padding:0}main{max-width:1000px;margin:0 auto;padding:1rem}
.bandeau{background:var(--accent);color:#fff;padding:1rem}
.bandeau h1{margin:0;font-size:1.1rem}.bandeau p{margin:.2rem 0 0;opacity:.85;font-size:.85rem}
</style></head><body>
<div class="bandeau"><h1>${echapper(etat.association.nom)}</h1>
<p>Situation au ${new Date().toLocaleDateString('fr-FR')} — document de consultation, non modifiable</p></div>
<main>
<div class="grille" style="margin-bottom:1rem">
  <div class="stat"><div class="libelle">Cotisations ${annee}</div><div class="valeur">${nb(t.totalCotisations)} ${dev}</div></div>
  <div class="stat"><div class="libelle">Solde de la caisse</div><div class="valeur">${nb(global.solde)} ${dev}</div></div>
  <div class="stat"><div class="libelle">Prêts en cours</div><div class="valeur">${nb(global.encoursPrets)} ${dev}</div></div>
  <div class="stat"><div class="libelle">Adhérents</div><div class="valeur">${etat.adherents.length}</div></div>
</div>
<div class="carte"><h2>Cotisations ${annee}</h2><div class="defilable"><table class="saisie">
<thead><tr><th>Adhérent</th>${DB.MOIS_NOMS.map((m) => `<th class="num">${m.slice(0, 4)}</th>`).join('')}<th class="num">${annee}</th><th class="num">Cumul</th></tr></thead>
<tbody>${lignes}</tbody>
<tfoot><tr class="total"><td class="nom">Total</td>${totMois.map((m) => `<td class="num">${m ? nb(m) : '—'}</td>`).join('')}
<td class="num">${nb(totMois.reduce((s, x) => s + x, 0))}</td><td class="num">${nb(global.totalCotisations)}</td></tr></tfoot>
</table></div></div>
<p class="doux">Document produit par l’application de gestion de la tontine. Pour toute correction, contactez le trésorier.</p>
</main></body></html>`;
}

function echapper(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
