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
${etat.association.airtelMoney ? `<div style="background:var(--accent-clair);padding:.8rem 1rem;text-align:center">
<span style="font-size:.78rem;text-transform:uppercase;letter-spacing:.04em;color:var(--accent)">Cotisations par Airtel Money</span>
<div style="font-size:1.5rem;font-weight:700;color:var(--accent)">${echapper(etat.association.airtelMoney)}</div></div>` : ''}
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

/* ===================== Comptes gérés par le serveur (mode Supabase) ======== */

/**
 * Écran de connexion quand la base en ligne est configurée.
 * Ici le rôle ne vient pas de l'appareil mais du serveur : c'est lui qui
 * décidera d'accepter ou de refuser chaque écriture.
 */
export function ecranConnexionServeur(synchro, surConnexion) {
  let mode = 'connexion';   // ou 'inscription'
  const zone = h('div');

  const dessiner = () => {
    const inscription = mode === 'inscription';
    const message = h('div');
    const nom = h('input', { type: 'text', autocomplete: 'name', required: inscription });
    const email = h('input', { type: 'email', autocapitalize: 'none',
      autocomplete: 'username', required: true, inputmode: 'email' });
    const motDePasse = h('input', { type: 'password', required: true,
      autocomplete: inscription ? 'new-password' : 'current-password' });
    const bouton = h('button', { class: 'primaire', type: 'submit',
      style: 'width:100%;justify-content:center' },
      inscription ? 'Créer mon compte' : 'Se connecter');

    const envoyer = async () => {
      // Garde-fou : ne JAMAIS partir avec un champ vide. Une requête sans
      // adresse est refusée par le serveur avec un message incompréhensible.
      const adresse = email.value.trim();
      if (!adresse || !adresse.includes('@')) {
        return message.replaceChildren(h('div', { class: 'mauvais' },
          'Saisissez une adresse e-mail valide.'));
      }
      if (!motDePasse.value) {
        return message.replaceChildren(h('div', { class: 'mauvais' }, 'Saisissez votre mot de passe.'));
      }
      if (inscription && motDePasse.value.length < 6) {
        return message.replaceChildren(h('div', { class: 'mauvais' },
          'Mot de passe trop court : six caractères au minimum.'));
      }
      if (inscription && !nom.value.trim()) {
        return message.replaceChildren(h('div', { class: 'mauvais' }, 'Indiquez votre nom.'));
      }
      bouton.disabled = true;
      bouton.textContent = inscription ? 'Création…' : 'Connexion…';
      message.replaceChildren();
      try {
        const profil = inscription
          ? await synchro.inscrireSupabase(adresse, motDePasse.value, nom.value)
          : await synchro.connecterSupabase(adresse, motDePasse.value);
        surConnexion(profil);
      } catch (e) {
        message.replaceChildren(h('div', { class: 'mauvais' }, e.message));
        bouton.disabled = false;
        bouton.textContent = inscription ? 'Créer mon compte' : 'Se connecter';
      }
    };

    zone.replaceChildren(h('div', { class: 'carte', style: 'max-width:400px;margin:3rem auto' },
      h('h1', {}, 'Caisse de la tontine'),
      h('p', { class: 'doux' }, inscription
        ? 'Choisissez une adresse e-mail et un mot de passe. Le tout premier compte créé devient administrateur ; les suivants doivent être approuvés par un administrateur.'
        : 'Connectez-vous avec votre adresse e-mail.'),
      h('form', { onSubmit: (e) => { e.preventDefault(); envoyer(); } },
        inscription
          ? h('div', { style: 'margin-bottom:.7rem' }, h('label', {}, 'Votre nom'), nom)
          : null,
        h('div', { style: 'margin-bottom:.7rem' }, h('label', {}, 'Adresse e-mail'), email),
        h('div', { style: 'margin-bottom:1rem' },
          h('label', {}, inscription ? 'Mot de passe (six caractères minimum)' : 'Mot de passe'),
          motDePasse),
        message, bouton),
      h('p', { style: 'margin-top:1rem;text-align:center' },
        h('button', { type: 'button', style: 'border:0;background:none;color:var(--accent);padding:0',
          onClick: () => { mode = inscription ? 'connexion' : 'inscription'; dessiner(); } },
          inscription ? 'J’ai déjà un compte — se connecter'
                      : 'Première fois ici — créer mon compte'))));
  };

  dessiner();
  return zone;
}

/** Compte créé mais pas encore approuvé par un administrateur. */
export function ecranEnAttente(profil, surDeconnexion) {
  return h('div', {},
    h('div', { class: 'carte', style: 'max-width:440px;margin:3rem auto' },
      h('h1', {}, 'Compte en attente'),
      h('p', {}, `Bonjour ${profil?.nom || ''}. Votre compte est bien créé, mais un administrateur doit l’approuver avant que vous puissiez consulter la caisse.`),
      h('p', { class: 'doux' },
        'Prévenez l’un des deux administrateurs : l’approbation se fait en un clic depuis leur onglet Réglages.'),
      h('div', { class: 'barre', style: 'margin-top:1rem' },
        h('button', { onClick: () => location.reload() }, 'Vérifier à nouveau'),
        h('button', { onClick: surDeconnexion }, 'Se déconnecter'))));
}

/** Liste des comptes du serveur, dans les Réglages. */
export function blocComptesServeur(ctx) {
  const { synchro, session } = ctx;
  const corps = h('tbody', {}, h('tr', {}, h('td', { colspan: 4, class: 'doux' }, 'Chargement…')));

  const dessiner = (profils) => {
    corps.replaceChildren(...profils.map((p) => {
      const changerRole = () => formulaire('Rôle de ' + p.nom, [
        { cle: 'nom', libelle: 'Nom affiché', valeur: p.nom, requis: true },
        { cle: 'role', libelle: 'Rôle', type: 'select', valeur: p.role, options: [
          { valeur: 'adherent', libelle: 'Consultation seule' },
          { valeur: 'admin', libelle: 'Administrateur' }] },
        { cle: 'adherent_id', libelle: 'Fiche adhérent associée', type: 'select',
          valeur: p.adherent_id || '', options: [{ valeur: '', libelle: '— non liée —' },
            ...ctx.etat.adherents.map((a) => ({ valeur: a.id, libelle: DB.nomComplet(a) }))] },
        { cle: 'valide', libelle: 'Accès', type: 'select', valeur: p.valide ? 'oui' : 'non',
          options: [{ valeur: 'oui', libelle: 'Autorisé' }, { valeur: 'non', libelle: 'Suspendu' }] }
      ], async (v) => {
        try {
          await synchro.supabase.majProfil({ ...p, ...v, valide: v.valide === 'oui' });
          toast('Compte mis à jour.');
          charger();
        } catch (e) { toast(e.message); }
      });

      const valider = async () => {
        try {
          await synchro.supabase.majProfil({ ...p, valide: true });
          toast(p.nom + ' a maintenant accès.');
          charger();
        } catch (e) { toast(e.message); }
      };

      return h('tr', {},
        h('td', {}, p.nom, p.id === session?.id ? h('span', { class: 'doux' }, ' (vous)') : null),
        h('td', {}, !p.valide
          ? h('span', { class: 'etiquette retard' }, 'en attente')
          : h('span', { class: 'etiquette' + (p.role === 'admin' ? '' : ' attente') },
              p.role === 'admin' ? 'administrateur' : 'consultation')),
        h('td', { class: 'doux' }, p.adherent_id
          ? DB.nomComplet(ctx.etat.adherents.find((a) => a.id === p.adherent_id)) : '—'),
        h('td', { style: 'text-align:right;white-space:nowrap' },
          ctx.estAdmin && !p.valide
            ? h('button', { class: 'primaire', onClick: valider }, 'Approuver') : null,
          ' ',
          ctx.estAdmin ? h('button', { onClick: changerRole }, 'Modifier') : null));
    }));
    if (!profils.length) {
      corps.replaceChildren(h('tr', {}, h('td', { colspan: 4, class: 'doux' },
        'Aucun profil enregistré. Voir la marche à suivre ci-dessous.')));
    }
  };

  const charger = async () => {
    try { dessiner(await synchro.supabase.listerProfils()); }
    catch (e) {
      corps.replaceChildren(h('tr', {}, h('td', { colspan: 4, class: 'doux' },
        'Liste indisponible : ' + e.message)));
    }
  };
  charger();

  return h('div', { class: 'carte' },
    h('h2', {}, 'Comptes'),
    h('p', { class: 'doux' },
      'Chacun crée son compte depuis l’écran de connexion, puis vous l’approuvez ici. Les droits sont appliqués par le serveur : un compte en consultation se voit refuser toute écriture, même si quelqu’un modifiait la page dans son navigateur.'),
    h('div', { class: 'defilable' }, h('table', {},
      h('thead', {}, h('tr', {},
        h('th', {}, 'Nom'), h('th', {}, 'Rôle'), h('th', {}, 'Fiche adhérent'), h('th', {}, ''))),
      corps)),
    ctx.estAdmin ? h('p', { class: 'doux', style: 'margin-top:.9rem' },
      'Pour ajouter quelqu’un : donnez-lui l’adresse de l’application, il crée son compte lui-même en cliquant sur « Première fois ici », puis vous l’approuvez dans la liste ci-dessus.') : null);
}
