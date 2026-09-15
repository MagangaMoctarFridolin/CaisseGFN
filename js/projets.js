/* ============================================================================
   projets.js — Les caisses de projet.

   La caisse familiale tourne toute l'année et n'a pas de fin. Un projet, si :
   on réunit une somme pour une chose précise, on la dépense, on clôt. Les
   mélanger dans un même solde, c'est ne plus savoir ce qui appartient à quoi.

   D'où la règle qui gouverne tout : UNE ÉCRITURE APPARTIENT À UNE SEULE
   CAISSE. Les contributions et les dépenses d'un projet portent son
   identifiant, et disparaissent des comptes de la caisse familiale.

   Sur la visibilité, une chose doit être dite clairement plutôt que promise à
   moitié : « réservé aux participants » cache le projet à l'ÉCRAN des autres
   comptes. Ce n'est pas un secret — le journal partagé reste le journal
   partagé. C'est une discrétion, pas un coffre-fort, et l'écran le dit.
   ========================================================================== */

import * as DB from './db.js';
import { h, toast, formulaire, confirmer } from './ui.js';
import { lienWhatsApp } from './suivi.js';

const { fmtMontant, fmtNombre, fmtDate, nomComplet, MOIS_NOMS } = DB;

const CLE_OUVERT = 'tontine:projet:ouvert';

/* ------------------------------------------------------------ écriture --- */

/** Les projets vivent dans la fiche de l'association, comme les moyens. */
function ecrireProjets(ctx, liste) {
  return ctx.enregistrer('association', 'upsert', { ...ctx.etat.association, projets: liste });
}

function champsProjet(ctx, p = {}) {
  const dev = ctx.etat.association.devise;
  return [
    { cle: 'nom', libelle: 'Nom du projet', valeur: p.nom || '', requis: true },
    { cle: 'type', libelle: 'Nature de la caisse', type: 'select', valeur: p.type || 'objectif',
      options: DB.TYPES_PROJET.map((x) => ({ valeur: x.cle, libelle: x.nom })) },
    { cle: 'objectif', libelle: 'Somme à réunir (' + dev + ') — type « objectif »',
      type: 'number', valeur: p.objectif ?? null },
    { cle: 'dateCible', libelle: 'Échéance visée', type: 'date', valeur: p.dateCible || '' },
    { cle: 'mensualite', libelle: 'Mensualité par participant (' + dev + ') — type « tontine »',
      type: 'number', valeur: p.mensualite ?? null },
    { cle: 'visibilite', libelle: 'Qui voit ce projet', type: 'select',
      valeur: p.visibilite || 'ferme',
      options: DB.VISIBILITES_PROJET.map((x) => ({ valeur: x.cle, libelle: x.nom })) },
    { cle: 'description', libelle: 'À quoi sert cette caisse', type: 'textarea', large: true,
      valeur: p.description || '' }
  ];
}

/* --------------------------------------------------------------- écran --- */

export function vueProjets(ctx) {
  const { etat } = ctx;
  const admin = ctx.peutEcrire;
  const moi = ctx.monAdherent || null;
  const visibles = DB.projetsVisibles(etat, moi, admin);

  let ouvertId = localStorage.getItem(CLE_OUVERT) || '';
  if (ouvertId && !visibles.some((p) => p.id === ouvertId)) ouvertId = '';

  const zone = h('div');

  const ouvrir = (p) => {
    ouvertId = p ? p.id : '';
    localStorage.setItem(CLE_OUVERT, ouvertId);
    zone.replaceChildren(p ? ecranProjet(ctx, p, () => ouvrir(null)) : liste());
  };

  /* --- création / modification --------------------------------------- */

  const creer = () => formulaire('Nouvelle caisse de projet', champsProjet(ctx), (v) => {
    const p = {
      id: DB.uid('prj'),
      nom: v.nom, type: v.type, description: v.description,
      objectif: v.type === 'objectif' ? (+v.objectif || 0) : 0,
      dateCible: v.type === 'objectif' ? v.dateCible : '',
      mensualite: v.type === 'tontine' ? (+v.mensualite || 0) : 0,
      visibilite: v.visibilite,
      membres: [], debut: new Date().toISOString().slice(0, 10), clos: false
    };
    ecrireProjets(ctx, [...DB.tousLesProjets(etat), p]);
    toast('Caisse créée — ajoutez maintenant les participants.');
    ouvrir(p);
  });

  const modifier = (p) => formulaire('Modifier « ' + p.nom + ' »', champsProjet(ctx, p), (v) => {
    const maj = {
      ...p, nom: v.nom, type: v.type, description: v.description,
      objectif: v.type === 'objectif' ? (+v.objectif || 0) : 0,
      dateCible: v.type === 'objectif' ? v.dateCible : '',
      mensualite: v.type === 'tontine' ? (+v.mensualite || 0) : 0,
      visibilite: v.visibilite
    };
    ecrireProjets(ctx, DB.tousLesProjets(etat).map((x) => (x.id === p.id ? maj : x)));
    toast('Caisse modifiée.');
    ctx.rafraichir();
  });

  /* --- la liste des caisses ------------------------------------------- */

  const liste = () => {
    if (!visibles.length) {
      return h('div', { class: 'carte' },
        h('p', {},
          'Une caisse de projet est une cagnotte à part : une somme réunie pour une chose précise, avec ses propres contributions, ses propres dépenses et son propre solde.'),
        h('p', { class: 'doux' },
          'Elle ne touche pas à la caisse familiale — les deux comptes restent séparés, et le solde de l’une n’entre jamais dans celui de l’autre.'),
        h('ul', { class: 'doux', style: 'line-height:1.9;padding-left:1.1rem' },
          DB.TYPES_PROJET.map((x) => h('li', {}, h('strong', {}, x.nom), ' — ', x.aide))),
        admin
          ? h('div', { class: 'barre', style: 'margin-top:1rem' },
              h('button', { class: 'primaire', onClick: creer }, 'Créer une caisse de projet'))
          : h('p', { class: 'doux' }, 'Aucune caisse de projet ne vous est ouverte pour le moment.'));
    }

    const carte = (p) => {
      const t = DB.totauxProjet(etat, p);
      const dev = etat.association.devise;
      return h('div', { class: 'carte projet' + (p.clos ? ' clos' : '') },
        h('div', { class: 'barre', style: 'margin-bottom:.4rem' },
          h('h2', { style: 'margin:0' }, p.nom),
          p.clos ? h('span', { class: 'etiquette' }, 'clôturée') : null,
          h('span', { class: 'etiquette' + (p.visibilite === 'ferme' ? ' attente' : '') },
            p.visibilite === 'ferme' ? 'réservé aux participants' : 'ouvert à tous les comptes'),
          h('span', { class: 'doux pousse' }, DB.nomTypeProjet(p.type))),
        p.description ? h('p', { class: 'doux', style: 'margin:.2rem 0 .6rem' }, p.description) : null,
        t.objectif
          ? h('div', {},
              h('div', { class: 'jauge', title: t.avancement + ' %' },
                h('div', { class: 'jauge-plein', style: `width:${t.avancement}%` })),
              h('p', { class: 'doux', style: 'margin:.3rem 0 .6rem' },
                `${fmtNombre(t.collecte)} collectés sur ${fmtMontant(t.objectif, dev)}`
                + (t.reste ? ` — il reste ${fmtMontant(t.reste, dev)} à trouver.` : ' — objectif atteint.')))
          : null,
        h('div', { class: 'grille', style: 'margin:.5rem 0' },
          stat('Collecté', fmtMontant(t.collecte, dev)),
          stat('Dépensé', fmtMontant(t.depense, dev)),
          stat('Solde', fmtMontant(t.solde, dev)),
          stat('Participants', (p.membres || []).length)),
        h('div', { class: 'barre', style: 'margin:0' },
          h('button', { class: 'primaire', onClick: () => ouvrir(p) }, 'Ouvrir la caisse'),
          admin ? h('button', { onClick: () => modifier(p) }, 'Modifier') : null));
    };

    return h('div', {},
      admin ? h('div', { class: 'barre' },
        h('button', { class: 'primaire', onClick: creer }, '+ Nouvelle caisse de projet')) : null,
      visibles.map(carte));
  };

  ouvrir(visibles.find((p) => p.id === ouvertId) || null);

  return h('div', {},
    h('div', { class: 'barre' },
      h('h1', {}, 'Caisses de projet'),
      h('span', { class: 'doux pousse' }, visibles.length
        ? `${visibles.length} caisse${visibles.length > 1 ? 's' : ''}` : '')),
    zone);
}

function stat(libelle, valeur) {
  return h('div', { class: 'stat' },
    h('div', { class: 'libelle' }, libelle), h('div', { class: 'valeur' }, valeur));
}

/* ------------------------------------------------- l'écran d'une caisse --- */

function ecranProjet(ctx, p, retour) {
  const { etat } = ctx;
  const dev = etat.association.devise;
  const admin = ctx.peutEcrire;
  const t = DB.totauxProjet(etat, p);

  const maintenant = new Date();
  const annee = maintenant.getFullYear();
  const mois = maintenant.getMonth() + 1;
  const lignes = DB.contributionsProjet(etat, p, annee, mois);
  const mvts = DB.mouvementsProjet(etat, p.id);

  const majProjet = (maj) =>
    ecrireProjets(ctx, DB.tousLesProjets(etat).map((x) => (x.id === p.id ? maj : x)));

  /* --- participants ---------------------------------------------------- */

  const gererMembres = () => {
    const dehors = [...etat.adherents]
      .filter((a) => a.actif !== false && !(p.membres || []).includes(a.id))
      .sort((a, b) => (a.numero || '').localeCompare(b.numero || ''));
    if (!dehors.length) return toast('Tous les adhérents actifs participent déjà.');
    formulaire('Inscrire un participant', [
      { cle: 'adherentId', libelle: 'Adhérent', type: 'select',
        options: dehors.map((a) => ({ valeur: a.id, libelle: nomComplet(a) })) }
    ], (v) => {
      majProjet({ ...p, membres: [...(p.membres || []), v.adherentId] });
      toast('Participant inscrit.');
      ctx.rafraichir();
    });
  };

  const retirer = (l) => confirmer(
    `Retirer ${nomComplet(l.adherent)} de « ${p.nom} » ?`,
    l.verse
      ? `Il a déjà versé ${fmtMontant(l.verse, dev)} : ces écritures restent dans la caisse du projet et dans le journal. Seul son accès à l’écran change.`
      : 'Il n’a encore rien versé.',
    () => {
      majProjet({ ...p, membres: (p.membres || []).filter((id) => id !== l.adherentId) });
      toast('Participant retiré.');
      ctx.rafraichir();
    });

  /* --- l'argent -------------------------------------------------------- */

  const moyens = DB.canaux(etat, true);

  const contribuer = (preselection) => {
    if (!(p.membres || []).length) return toast('Inscrivez d’abord des participants.');
    formulaire('Contribution à « ' + p.nom + ' »', [
      { cle: 'adherentId', libelle: 'Participant', type: 'select', valeur: preselection || '',
        options: lignes.map((l) => ({ valeur: l.adherentId,
          libelle: l.adherent ? nomComplet(l.adherent) : 'adhérent retiré' })) },
      { cle: 'credit', libelle: 'Montant (' + dev + ')', type: 'number', requis: true,
        valeur: p.mensualite || null },
      { cle: 'date', libelle: 'Date', type: 'date', valeur: new Date().toISOString().slice(0, 10) },
      { cle: 'moyen', libelle: 'Moyen', type: 'select', valeur: '',
        options: [{ valeur: '', libelle: '— non précisé —' },
          ...moyens.map((m) => ({ valeur: m.id, libelle: m.nom }))] },
      { cle: 'reference', libelle: 'Référence de la transaction' }
    ], (v) => {
      const montant = Math.round(+v.credit || 0);
      if (montant <= 0) return toast('Indiquez un montant.');
      const qui = etat.adherents.find((a) => a.id === v.adherentId);
      ctx.enregistrer('mouvement', 'upsert', {
        id: DB.uid('mvt'), projetId: p.id, date: v.date, nature: 'Contribution',
        credit: montant, debit: null, adherentId: v.adherentId,
        moyen: v.moyen, reference: v.reference,
        objet: 'Contribution — ' + (qui ? nomComplet(qui) : '')
      });
      toast('Contribution inscrite.');
    });
  };

  const depenser = () => formulaire('Dépense de « ' + p.nom + ' »', [
    { cle: 'objet', libelle: 'Objet de la dépense', requis: true, large: true },
    { cle: 'debit', libelle: 'Montant (' + dev + ')', type: 'number', requis: true },
    { cle: 'date', libelle: 'Date', type: 'date', valeur: new Date().toISOString().slice(0, 10) },
    { cle: 'reference', libelle: 'Justificatif / référence' }
  ], (v) => {
    const montant = Math.round(+v.debit || 0);
    if (montant <= 0) return toast('Indiquez un montant.');
    if (montant > t.solde) {
      return confirmer(
        `Cette dépense de ${fmtMontant(montant, dev)} dépasse le solde du projet (${fmtMontant(t.solde, dev)}).`,
        'La caisse du projet passera en négatif. À n’inscrire que si quelqu’un a réellement avancé l’argent.',
        () => inscrireDepense(v, montant));
    }
    inscrireDepense(v, montant);
  });

  const inscrireDepense = (v, montant) => {
    ctx.enregistrer('mouvement', 'upsert', {
      id: DB.uid('mvt'), projetId: p.id, date: v.date, nature: 'Dépense',
      credit: null, debit: montant, adherentId: '',
      objet: v.objet, reference: v.reference
    });
    toast('Dépense inscrite.');
  };

  const supprimerEcriture = (m) => confirmer(
    'Retirer cette écriture de la caisse du projet ?',
    'Elle disparaît des totaux, mais le journal en garde la trace.',
    () => ctx.enregistrer('mouvement', 'delete', { id: m.id }));

  /* --- clôturer / supprimer -------------------------------------------- */

  const clore = () => confirmer(
    p.clos ? `Rouvrir « ${p.nom} » ?` : `Clôturer « ${p.nom} » ?`,
    p.clos ? 'La caisse redevient modifiable.'
      : `Le solde est de ${fmtMontant(t.solde, dev)}. La caisse reste consultable, mais elle sera marquée close. Rien n’est effacé.`,
    () => { majProjet({ ...p, clos: !p.clos }); ctx.rafraichir(); });

  const supprimer = () => confirmer(
    `Supprimer définitivement la caisse « ${p.nom} » ?`,
    mvts.length
      ? `Ses ${mvts.length} écritures ne seront plus rattachées à aucune caisse : elles retomberaient dans la comptabilité générale. Clôturez plutôt que de supprimer.`
      : 'Cette caisse est vide : rien ne sera perdu.',
    () => {
      ecrireProjets(ctx, DB.tousLesProjets(etat).filter((x) => x.id !== p.id));
      toast('Caisse supprimée.');
      retour();
      ctx.rafraichir();
    });

  /* --- relance d'un participant (type tontine) -------------------------- */

  const messageProjet = (l) => {
    const nom = l.adherent?.prenom || nomComplet(l.adherent);
    return [
      `Bonjour ${nom},`,
      `Pour le projet « ${p.nom} », votre participation de ${fmtMontant(l.attendu, dev)} `
        + `au titre de ${MOIS_NOMS[mois - 1]} ${annee} n'est pas encore enregistrée`
        + (l.duMois > 0 ? ` (déjà reçu : ${fmtMontant(l.duMois, dev)}).` : '.'),
      `Merci — ${etat.association.nom}.`
    ].join('\n\n');
  };

  /* --- rendu ------------------------------------------------------------ */

  const enRetard = p.type === 'tontine' ? lignes.filter((l) => l.manque > 0) : [];

  return h('div', {},
    h('div', { class: 'barre' },
      h('button', { onClick: retour }, '‹ Toutes les caisses'),
      h('h1', { style: 'margin:0' }, p.nom),
      p.clos ? h('span', { class: 'etiquette' }, 'clôturée') : null,
      h('span', { class: 'doux pousse' }, DB.nomTypeProjet(p.type))),

    p.description ? h('p', { class: 'doux', style: 'margin-top:-.4rem' }, p.description) : null,

    h('div', { class: 'grille', style: 'margin-bottom:1rem' },
      stat('Collecté', fmtMontant(t.collecte, dev)),
      stat('Dépensé', fmtMontant(t.depense, dev)),
      stat('Solde du projet', fmtMontant(t.solde, dev)),
      t.objectif ? stat('Reste à trouver', fmtMontant(t.reste, dev))
        : stat('Participants', (p.membres || []).length)),

    t.objectif ? h('div', { class: 'carte' },
      h('div', { class: 'barre', style: 'margin-bottom:.4rem' },
        h('h2', { style: 'margin:0' }, 'Avancement'),
        h('span', { class: 'doux pousse' },
          t.avancement + ' %' + (p.dateCible ? ' — échéance ' + fmtDate(p.dateCible) : ''))),
      h('div', { class: 'jauge' }, h('div', { class: 'jauge-plein', style: `width:${t.avancement}%` })),
      h('p', { class: 'doux', style: 'margin:.5rem 0 0' },
        t.reste
          ? `${fmtNombre(t.collecte)} réunis sur ${fmtMontant(t.objectif, dev)} — il reste ${fmtMontant(t.reste, dev)}.`
          : `Objectif atteint : ${fmtMontant(t.collecte, dev)} réunis.`)) : null,

    /* Les participants */
    h('div', { class: 'carte' },
      h('div', { class: 'barre' },
        h('h2', { style: 'margin:0' }, 'Participants'),
        admin && !p.clos ? h('button', { class: 'pousse', onClick: gererMembres },
          '+ Inscrire un participant') : null),
      (p.membres || []).length === 0
        ? h('p', { class: 'vide' },
            'Aucun participant. Inscrivez ceux de vos adhérents qui prennent part à ce projet.')
        : h('div', { class: 'defilable' }, h('table', { class: 'participants' },
            h('thead', {}, h('tr', {},
              h('th', {}, 'Participant'),
              h('th', { class: 'num' }, 'Versé au total'),
              p.type === 'tontine' ? h('th', { class: 'num' }, MOIS_NOMS[mois - 1]) : null,
              p.type === 'tontine' ? h('th', { class: 'num' }, 'Manque') : null,
              h('th', { class: 'num' }, 'Part'),
              admin && !p.clos ? h('th', {}, '') : null)),
            h('tbody', {}, lignes.map((l) => h('tr', {},
              h('td', {}, l.adherent ? nomComplet(l.adherent)
                : h('span', { class: 'doux' }, 'adhérent retiré')),
              h('td', { class: 'num' }, l.verse ? fmtNombre(l.verse) : '—'),
              p.type === 'tontine'
                ? h('td', { class: 'num' }, l.duMois ? fmtNombre(l.duMois) : '—') : null,
              p.type === 'tontine'
                ? h('td', { class: 'num', style: l.manque ? 'font-weight:650' : '' },
                    l.manque ? fmtNombre(l.manque) : '—') : null,
              h('td', { class: 'num doux' },
                t.collecte ? ((l.verse / t.collecte) * 100).toFixed(1) + ' %' : '—'),
              admin && !p.clos ? h('td', { style: 'text-align:right;white-space:nowrap' },
                h('button', { onClick: () => contribuer(l.adherentId) }, 'Contribution'),
                ' ',
                h('button', { class: 'danger', title: 'Retirer du projet',
                  onClick: () => retirer(l) }, '✕')) : null))),
            h('tfoot', {}, h('tr', { class: 'total' },
              h('td', {}, 'Total'),
              h('td', { class: 'num' }, fmtMontant(t.collecte, dev)),
              p.type === 'tontine' ? h('td', { class: 'num' },
                fmtNombre(lignes.reduce((s, l) => s + l.duMois, 0))) : null,
              p.type === 'tontine' ? h('td', { class: 'num' },
                fmtNombre(lignes.reduce((s, l) => s + l.manque, 0))) : null,
              h('td', { class: 'num' }, t.collecte ? '100 %' : '—'),
              admin && !p.clos ? h('td', {}, '') : null))))),

    /* Les relances, pour une seconde tontine */
    enRetard.length ? h('div', { class: 'carte' },
      h('h2', {}, 'À relancer pour ' + MOIS_NOMS[mois - 1] + ' ' + annee),
      h('div', { class: 'defilable' }, h('table', { class: 'relances-projet' },
        h('tbody', {}, enRetard.map((l) => {
          const texte = messageProjet(l);
          const lien = lienWhatsApp(l.adherent?.telephone, texte);
          return h('tr', {},
            h('td', {}, nomComplet(l.adherent)),
            h('td', { class: 'num', style: 'font-weight:650' }, fmtNombre(l.manque)),
            h('td', { style: 'text-align:right' }, lien
              ? h('a', { class: 'bouton', href: lien, target: '_blank', rel: 'noopener' }, 'Relancer')
              : h('button', {
                  onClick: async () => {
                    try { await navigator.clipboard.writeText(texte); toast('Message copié.'); }
                    catch { await confirmer('Copie impossible. Le message est ci-dessous.', texte); }
                  } }, 'Copier le message')));
        }))))) : null,

    /* Les écritures */
    h('div', { class: 'carte' },
      h('div', { class: 'barre' },
        h('h2', { style: 'margin:0' }, 'Écritures de la caisse'),
        admin && !p.clos ? h('button', { class: 'primaire pousse', onClick: () => contribuer() },
          '+ Contribution') : null,
        admin && !p.clos ? h('button', { onClick: depenser }, '+ Dépense') : null),
      mvts.length === 0
        ? h('p', { class: 'vide' }, 'Aucune écriture pour le moment.')
        : h('div', { class: 'defilable' }, h('table', {},
            h('thead', {}, h('tr', {},
              h('th', {}, 'Date'), h('th', {}, 'Objet'),
              h('th', { class: 'num' }, 'Entrée'), h('th', { class: 'num' }, 'Sortie'),
              h('th', { class: 'num' }, 'Solde'),
              admin && !p.clos ? h('th', {}, '') : null)),
            h('tbody', {}, (() => {
              let solde = 0;
              return mvts.map((m) => {
                solde += (+m.credit || 0) - (+m.debit || 0);
                return h('tr', {},
                  h('td', { class: 'doux' }, fmtDate(m.date)),
                  h('td', {}, m.objet || m.nature || '—',
                    m.reference ? h('div', { class: 'doux' }, 'réf. ' + m.reference) : null,
                    m.moyen ? h('div', { class: 'doux' }, DB.nomCanal(etat, m.moyen)) : null),
                  h('td', { class: 'num' }, m.credit ? fmtNombre(m.credit) : ''),
                  h('td', { class: 'num' }, m.debit ? fmtNombre(m.debit) : ''),
                  h('td', { class: 'num' }, fmtNombre(solde)),
                  admin && !p.clos ? h('td', { style: 'text-align:right' },
                    h('button', { class: 'danger', onClick: () => supprimerEcriture(m) }, '✕')) : null);
              });
            })())))),

    /* Réglages de la caisse */
    admin ? h('div', { class: 'carte' },
      h('h2', {}, 'Réglages de cette caisse'),
      h('p', { class: 'doux' },
        p.visibilite === 'ferme'
          ? 'Réservé aux participants : les autres comptes ne voient pas ce projet dans l’application. C’est une discrétion, pas un coffre-fort — les écritures voyagent dans le même journal partagé que le reste, et un adhérent qui sait l’ouvrir peut les y lire. Dites-le si la somme est sensible.'
          : 'Ouvert : tous les comptes de l’association voient ce projet en consultation. La saisie reste réservée aux administrateurs.'),
      h('div', { class: 'barre', style: 'margin-top:.8rem' },
        h('button', { onClick: clore }, p.clos ? 'Rouvrir la caisse' : 'Clôturer la caisse'),
        h('button', { class: 'danger', onClick: supprimer }, 'Supprimer la caisse'))) : null);
}
