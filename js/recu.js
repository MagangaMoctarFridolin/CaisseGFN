/* ============================================================================
   recu.js — Le reçu de versement.

   Un adhérent qui verse 10 000 FCFA par Airtel Money reçoit un SMS de
   l'opérateur, pas de la tontine. Il n'a donc aucune trace disant que la
   caisse, elle, a bien inscrit son versement. Le reçu comble ce trou : une
   page, un numéro, un montant, une signature.

   Il ne crée rien : il ne fait que présenter une cotisation déjà inscrite au
   journal. On peut donc le rééditer autant de fois qu'on veut, il dira
   toujours la même chose — et si la cotisation est corrigée plus tard, le
   reçu réédité portera la correction, comme il se doit.
   ========================================================================== */

import * as DB from './db.js';
import { h, toast, telecharger } from './ui.js';

const { fmtMontant, fmtDate, nomComplet, MOIS_NOMS } = DB;

/**
 * Le numéro du reçu. Il ne vient pas d'un compteur — un compteur se
 * désynchronise entre deux appareils hors ligne — mais de ce que le reçu
 * désigne : cet adhérent, ce mois, cette année. Deux appareils qui éditent le
 * reçu du même versement écrivent donc le même numéro.
 */
export function numeroRecu(etat, cotisation) {
  const a = etat.adherents.find((x) => x.id === cotisation.adherentId);
  const qui = (a?.numero || 'ADH').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return `${cotisation.annee}-${qui}-${String(cotisation.mois).padStart(2, '0')}`;
}

/** Le corps du reçu, en éléments : sert à l'écran comme au fichier. */
export function corpsRecu(etat, cotisation) {
  const a = etat.adherents.find((x) => x.id === cotisation.adherentId);
  const dev = etat.association.devise;
  const assoc = etat.association;

  const ligne = (libelle, valeur, fort) => h('tr', {},
    h('td', { class: 'doux', style: 'width:42%' }, libelle),
    h('td', { style: fort ? 'font-weight:700;font-size:1.05rem' : '' }, valeur));

  return h('div', { class: 'carte recu' },
    h('div', { style: 'display:flex;justify-content:space-between;flex-wrap:wrap;gap:1rem' },
      h('div', {},
        h('h2', { style: 'margin:0' }, assoc.nom),
        h('div', { class: 'doux' }, assoc.adresse || ''),
        assoc.telephone ? h('div', { class: 'doux' }, 'Tél. ' + assoc.telephone) : null),
      h('div', { style: 'text-align:right' },
        h('div', { style: 'font-size:.78rem;text-transform:uppercase;letter-spacing:.06em;color:var(--doux)' },
          'Reçu de versement'),
        h('div', { style: 'font-size:1.2rem;font-weight:700' }, 'N° ' + numeroRecu(etat, cotisation)),
        h('div', { class: 'doux' }, 'Édité le ' + fmtDate(new Date())))),

    h('table', { style: 'margin-top:1.2rem' }, h('tbody', {},
      ligne('Reçu de', nomComplet(a) + (a?.numero ? ' (n° ' + a.numero + ')' : '')),
      ligne('Au titre de', MOIS_NOMS[(cotisation.mois || 1) - 1] + ' ' + cotisation.annee),
      ligne('Somme de', fmtMontant(cotisation.montant, dev), true),
      ligne('Moyen de versement', DB.nomCanal(etat, cotisation.moyen)),
      cotisation.reference ? ligne('Référence', cotisation.reference) : null,
      ligne('Date du versement', fmtDate(cotisation.date)))),

    h('p', { class: 'doux', style: 'margin-top:1.2rem' },
      'Ce reçu atteste que la somme ci-dessus a été inscrite au journal de la caisse. Il ne vaut pas quittance d’un autre engagement.'),

    h('div', { style: 'margin-top:2.5rem' },
      h('div', { class: 'doux' }, 'Pour la caisse'),
      h('div', { style: 'margin-top:.2rem' },
        DB.titulaire(etat, 'tresorier') ? nomComplet(DB.titulaire(etat, 'tresorier'))
          : (DB.titulaire(etat, 'president') ? nomComplet(DB.titulaire(etat, 'president')) : ' ')),
      h('div', { style: 'border-bottom:1px solid var(--trait);margin-top:2.4rem;max-width:18rem' })));
}

/** Page autonome, lisible sans l'application : c'est ce qu'on envoie. */
export function fichierRecu(etat, cotisation, feuilleStyle) {
  const bloc = corpsRecu(etat, cotisation);
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Reçu ${numeroRecu(etat, cotisation)} — ${etat.association.nom}</title>
<style>${feuilleStyle || ''}
body { padding: 1.5rem; max-width: 46rem; margin: 0 auto; }
</style></head>
<body>${bloc.outerHTML}</body></html>`;
}

export function telechargerRecu(etat, cotisation, feuilleStyle) {
  const a = etat.adherents.find((x) => x.id === cotisation.adherentId);
  const nom = 'recu-' + numeroRecu(etat, cotisation) + '-'
    + (nomComplet(a) || 'adherent').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    + '.html';
  telecharger(nom, fichierRecu(etat, cotisation, feuilleStyle), 'text/html;charset=utf-8');
}

export async function partagerRecu(etat, cotisation, feuilleStyle) {
  const contenu = fichierRecu(etat, cotisation, feuilleStyle);
  const fichier = new File([contenu], 'recu-' + numeroRecu(etat, cotisation) + '.html',
    { type: 'text/html' });
  if (navigator.canShare?.({ files: [fichier] })) {
    try {
      await navigator.share({ files: [fichier], title: 'Reçu de versement' });
      return;
    } catch { /* partage annulé */ }
  }
  telechargerRecu(etat, cotisation, feuilleStyle);
  toast('Reçu téléchargé — envoyez-le depuis WhatsApp.');
}

/* ------------------------------------------------------------------ écran */

/**
 * Le bloc « Reçus de versement » des Rapports : on choisit un adhérent, on
 * voit ses versements, on édite le reçu de celui qu'on veut.
 */
export function blocRecus(ctx, zone) {
  const { etat, annee } = ctx;
  const dev = etat.association.devise;

  const liste = h('div');

  const montrer = (a) => {
    const cots = etat.cotisations
      .filter((c) => c.adherentId === a.id && c.annee === annee && +c.montant > 0)
      .sort((x, y) => y.mois - x.mois);
    liste.replaceChildren(cots.length
      ? h('div', { class: 'defilable' }, h('table', { class: 'recus' },
          h('thead', {}, h('tr', {},
            h('th', {}, 'Période'), h('th', { class: 'num' }, 'Montant'),
            h('th', {}, 'Moyen'), h('th', {}, 'N° de reçu'), h('th', {}, ''))),
          h('tbody', {}, cots.map((c) => h('tr', {},
            h('td', {}, MOIS_NOMS[(c.mois || 1) - 1] + ' ' + c.annee),
            h('td', { class: 'num' }, fmtMontant(c.montant, dev)),
            h('td', { class: 'doux' }, DB.nomCanal(etat, c.moyen)),
            h('td', { class: 'doux' }, numeroRecu(etat, c)),
            h('td', { style: 'text-align:right;white-space:nowrap' },
              h('button', { onClick: () => {
                zone.replaceChildren(corpsRecu(etat, c));
                zone.scrollIntoView({ behavior: 'smooth', block: 'start' });
              } }, 'Afficher'),
              ' ',
              h('button', { onClick: () => ctx.telechargerRecu(c) }, 'Télécharger'),
              ' ',
              h('button', { onClick: () => ctx.partagerRecu(c) }, 'Partager…')))))))
      : h('p', { class: 'doux' }, 'Aucun versement enregistré pour ' + nomComplet(a) + ' en ' + annee + '.'));
  };

  return h('div', {},
    h('h2', {}, 'Reçu de versement'),
    h('p', { class: 'doux' },
      'Choisissez un adhérent : ses versements de ' + annee + ' s’affichent, et chacun peut être édité en reçu à envoyer.'),
    h('div', { class: 'barre choix-recu' }, etat.adherents.length
      ? [...etat.adherents].sort((x, y) => (x.numero || '').localeCompare(y.numero || ''))
          .map((a) => h('button', { onClick: () => montrer(a) }, nomComplet(a)))
      : h('span', { class: 'doux' }, 'Aucun adhérent.')),
    liste);
}
