/* ============================================================================
   cloture.js — Le partage de fin d'exercice.

   Une tontine tient toute l'année sur la confiance, et elle se joue en une
   soirée de décembre. C'est là qu'on annonce à chacun ce qu'il reçoit, et
   c'est là qu'un chiffre mal posé devient une brouille de famille.

   Cet écran ne décide rien : il POSE le calcul, ligne par ligne, avant de
   l'annoncer. Il dit d'où vient chaque somme, ce qui reste dehors en prêts, et
   surtout — s'il y a assez en caisse pour payer ce qu'on s'apprête à promettre.

   L'inscription des versements de partage est une action distincte, demandée
   deux fois, et qui passe par le journal comme tout le reste : elle laisse une
   trace, et elle est réversible.
   ========================================================================== */

import * as DB from './db.js';
import { h, toast, confirmer } from './ui.js';

const { fmtMontant, fmtNombre, fmtDate, nomComplet } = DB;

const NATURE_PARTAGE = 'Partage de clôture';

const MODES = [
  { cle: 'integral', nom: 'Apports rendus + part du résultat',
    aide: 'La caisse se vide et repart à zéro l’année suivante. C’est le partage le plus courant.' },
  { cle: 'resultat', nom: 'Résultat seul, les apports restent en caisse',
    aide: 'Le capital reste investi ; on ne distribue que le bénéfice de l’année.' }
];

const CLE_MODE = 'tontine:cloture:mode';

/* ------------------------------------------------------------- écran --- */

export function blocCloture(ctx, zone) {
  const { etat } = ctx;

  let mode = localStorage.getItem(CLE_MODE) || 'integral';
  if (!MODES.some((m) => m.cle === mode)) mode = 'integral';

  const editer = () => {
    zone.replaceChildren(documentCloture(ctx, mode));
    zone.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const choix = h('select', { style: 'width:auto',
    onChange: (e) => { mode = e.target.value; localStorage.setItem(CLE_MODE, mode); editer(); } },
    MODES.map((m) => h('option', { value: m.cle, selected: m.cle === mode }, m.nom)));

  return h('div', {},
    h('h2', {}, 'Clôture de l’exercice ' + ctx.annee),
    h('p', { class: 'doux' },
      'Ce que reçoit chacun en fin d’année : ses apports, sa part du résultat, moins ce qu’il doit encore. Le document se recalcule à chaque ouverture — rien n’est figé tant que vous n’inscrivez pas les versements.'),
    h('div', { class: 'barre' },
      h('span', { class: 'doux' }, 'Règle de partage :'), choix,
      h('button', { class: 'primaire', onClick: editer }, 'Établir le partage ' + ctx.annee)),
    h('p', { class: 'doux', style: 'margin:0' },
      MODES.find((m) => m.cle === mode)?.aide || ''));
}

/* ---------------------------------------------------------- document --- */

function documentCloture(ctx, mode) {
  const { etat, annee } = ctx;
  const dev = etat.association.devise;
  const c = DB.cloture(etat, annee, mode);

  const ligneCompte = (libelle, valeur, aide, fort) => h('tr', {},
    h('td', {}, libelle, aide ? h('div', { class: 'doux' }, aide) : null),
    h('td', { class: 'num', style: fort ? 'font-weight:700' : '' }, fmtNombre(valeur)));

  /* --- l'inscription des versements --------------------------------- */

  const aPayer = c.lignes.filter((l) => l.aRecevoir > 0);

  const inscrire = () => confirmer(
    `Inscrire ${aPayer.length} versement${aPayer.length > 1 ? 's' : ''} de partage, pour ${fmtMontant(aPayer.reduce((s, l) => s + l.aRecevoir, 0), dev)} ?`,
    'Chaque part devient une sortie de caisse datée d’aujourd’hui. À ne faire qu’une fois l’argent réellement remis. Rien n’est effacé : ces écritures s’annulent comme les autres, depuis la Comptabilité.',
    async () => {
      const aujourdhui = new Date().toISOString().slice(0, 10);
      for (const l of aPayer) {
        await ctx.enregistrer('mouvement', 'upsert', {
          id: DB.uid('mvt'), date: aujourdhui, nature: NATURE_PARTAGE,
          credit: null, debit: l.aRecevoir, adherentId: l.adherent.id,
          objet: `Partage de clôture ${annee} — ${nomComplet(l.adherent)}`,
          remarques: `Apports ${fmtNombre(l.apport)} · part du résultat ${fmtNombre(l.quotePart)}`
            + (l.dette ? ` · dette retenue ${fmtNombre(l.dette)}` : '')
        });
      }
      toast(aPayer.length + ' versements inscrits.');
      ctx.rafraichir();
    });

  /* --- rendu -------------------------------------------------------- */

  return h('div', { class: 'carte cloture' },
    h('div', { style: 'display:flex;justify-content:space-between;flex-wrap:wrap;gap:1rem' },
      h('div', {},
        h('h2', {}, etat.association.nom),
        h('div', { class: 'doux' }, etat.association.adresse || '')),
      h('div', { class: 'doux', style: 'text-align:right' },
        h('div', {}, 'Édité le ' + fmtDate(new Date())),
        h('div', {}, 'Exercice ' + annee))),

    h('h1', { style: 'margin-top:.8rem' }, 'Partage de l’exercice ' + annee),
    h('p', { class: 'doux', style: 'margin-top:-.2rem' },
      MODES.find((m) => m.cle === mode)?.nom),

    /* Le compte de l'exercice */
    h('h3', { style: 'margin-top:1.4rem' }, 'Le compte de l’exercice'),
    h('table', {}, h('tbody', {},
      ligneCompte('Apports des adhérents', c.totalApports,
        'Les cotisations inscrites au titre de ' + annee),
      ligneCompte('Intérêts encaissés sur les prêts', c.interets,
        'Ce qui, dans les remboursements reçus, dépasse le capital prêté'),
      c.autresProduits ? ligneCompte('Autres entrées', c.autresProduits, 'Dons et divers') : null,
      c.charges ? ligneCompte('Charges de l’exercice', -c.charges, 'Frais et sorties diverses') : null,
      h('tr', { class: 'total' },
        h('td', {}, 'Résultat à partager'),
        h('td', { class: 'num' }, fmtMontant(c.resultat, dev))))),

    (c.remisTour || c.dehors) ? h('div', {},
      h('h3', { style: 'margin-top:1.2rem' }, 'Ce qui n’entre pas dans le partage'),
      h('table', {}, h('tbody', {},
        c.remisTour ? ligneCompte('Déjà remis au titre du tour de rôle', c.remisTour,
          'Cet argent est déjà revenu à ses bénéficiaires') : null,
        c.dehors ? ligneCompte('Capital dehors, en prêts non remboursés', c.dehors,
          'Cette somme n’est pas en caisse : elle ne peut pas être distribuée') : null))) : null,

    /* Le partage */
    h('h3', { style: 'margin-top:1.4rem' }, 'Ce que reçoit chacun'),
    c.lignes.length
      ? h('div', { class: 'defilable' }, h('table', { class: 'partage' },
          h('thead', {}, h('tr', {},
            h('th', {}, 'Adhérent'),
            h('th', { class: 'num' }, 'Apports'),
            h('th', { class: 'num' }, 'Part'),
            h('th', { class: 'num' }, 'Part du résultat'),
            h('th', { class: 'num' }, 'Dette retenue'),
            h('th', { class: 'num' }, 'À recevoir'))),
          h('tbody', {}, c.lignes.map((l) => h('tr', {},
            h('td', {}, nomComplet(l.adherent)),
            h('td', { class: 'num' }, l.apport ? fmtNombre(l.apport) : '—'),
            h('td', { class: 'num doux' }, (l.part * 100).toFixed(1) + ' %'),
            h('td', { class: 'num' }, l.quotePart ? fmtNombre(l.quotePart) : '—'),
            h('td', { class: 'num' }, l.dette ? fmtNombre(l.dette) : '—'),
            h('td', { class: 'num', style: 'font-weight:700' },
              l.aRecevoir < 0
                ? h('span', { class: 'etiquette retard' }, 'doit ' + fmtNombre(-l.aRecevoir))
                : fmtNombre(l.aRecevoir))))),
          h('tfoot', {}, h('tr', { class: 'total' },
            h('td', {}, 'Total'),
            h('td', { class: 'num' }, fmtNombre(c.totalApports)),
            h('td', { class: 'num' }, '100 %'),
            h('td', { class: 'num' }, fmtNombre(c.resultat)),
            h('td', { class: 'num' }, fmtNombre(c.lignes.reduce((s, l) => s + l.dette, 0))),
            h('td', { class: 'num' }, fmtMontant(c.aDistribuer, dev))))))
      : h('p', { class: 'vide' }, 'Aucun apport enregistré pour ' + annee + '.'),

    /* Le contrôle de caisse — le seul chiffre qui empêche une soirée de mal finir */
    h('h3', { style: 'margin-top:1.4rem' }, 'Contrôle de caisse'),
    h('table', {}, h('tbody', {},
      ligneCompte('Disponible en caisse', c.disponible,
        'Tout ce qui est rentré depuis le début, moins tout ce qui est sorti et ce qui est prêté'),
      ligneCompte('Annoncé aux adhérents', c.aDistribuer, null, true))),
    c.manque > 0
      ? h('div', { class: 'mauvais', style: 'margin-top:.8rem' },
          'Il manque ' + fmtMontant(c.manque, dev) + ' pour payer ce partage. '
          + (c.dehors ? 'Le plus probable : ' + fmtMontant(c.dehors, dev) + ' sont encore dehors en prêts non remboursés. '
              : '')
          + 'Attendez les remboursements, ou partagez au prorata de ce qui est réellement là.')
      : h('div', { class: 'avert', style: 'margin-top:.8rem;background:var(--accent-clair);color:var(--accent)' },
          'La caisse couvre le partage annoncé'
          + (c.disponible - c.aDistribuer > 0
              ? ' — il resterait ' + fmtMontant(c.disponible - c.aDistribuer, dev) + ' en caisse.' : '.')),

    c.dejaPartage
      ? h('p', { class: 'doux', style: 'margin-top:.8rem' },
          fmtMontant(c.dejaPartage, dev) + ' ont déjà été inscrits en partage pour ' + annee
          + ' : vérifiez avant d’en inscrire d’autres.')
      : null,

    /* Signatures et action */
    blocSignaturesCloture(etat),

    ctx.peutEcrire && aPayer.length ? h('div', { class: 'barre', style: 'margin-top:1.5rem' },
      h('button', { onClick: () => window.print() }, 'Imprimer / PDF'),
      h('button', { class: c.manque > 0 ? 'danger' : 'primaire', onClick: inscrire },
        'Inscrire les versements de partage'),
      h('span', { class: 'doux' },
        'À ne faire qu’une fois l’argent réellement remis.')) : null);
}

function blocSignaturesCloture(etat) {
  const tenues = DB.FONCTIONS.filter((f) => DB.titulaire(etat, f.cle));
  const aSigner = tenues.length ? tenues : DB.FONCTIONS;
  return h('div', {},
    h('p', { class: 'doux', style: 'margin-top:2rem' },
      'Arrêté par le bureau, le ' + fmtDate(new Date()) + '.'),
    h('div', { style: 'display:flex;flex-wrap:wrap;gap:2.5rem;margin-top:1.5rem' },
      aSigner.map((f) => h('div', { style: 'min-width:14rem' },
        h('div', { class: 'doux' }, f.nom),
        h('div', { style: 'margin-top:.2rem' },
          DB.titulaire(etat, f.cle) ? nomComplet(DB.titulaire(etat, f.cle)) : ' '),
        h('div', { style: 'border-bottom:1px solid var(--trait);margin-top:2.2rem' })))));
}
