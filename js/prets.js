/* ============================================================================
   prets.js — Les prêts : échéancier, encours, retards.

   La liste des prêts disait ce qui avait été prêté et ce qui restait dû. Elle
   ne disait pas QUAND on attendait quoi, ni combien chaque personne devait au
   total quand elle avait emprunté deux fois. Ce sont pourtant les deux seules
   questions qu'on se pose vraiment : « qui doit combien » et « qui est en
   retard ».

   L'échéancier n'est pas stocké. Il se déduit du montant, de la date d'octroi
   et du nombre de mensualités convenues, puis se confronte au cumul
   réellement remboursé. Un prêt sans mensualité convenue n'a donc pas
   d'échéancier — seulement une date limite. C'est volontaire : fabriquer un
   calendrier que personne n'a promis ne rend service à personne.
   ========================================================================== */

import * as DB from './db.js';
import { h, toast, formulaire, confirmer } from './ui.js';

const { fmtMontant, fmtNombre, fmtDate, nomComplet } = DB;

/* --------------------------------------------------------- échéancier --- */

function blocEcheancier(etat, p) {
  const dev = etat.association.devise;
  const lignes = DB.echeancier(p);
  if (!lignes.length) {
    return h('p', { class: 'doux' }, p.dateLimite
      ? 'Aucune mensualité convenue : ce prêt est à rembourser en une fois, avant le ' + fmtDate(p.dateLimite) + '.'
      : 'Aucune mensualité ni date limite : ce prêt n’a pas d’échéance convenue.');
  }
  const etiquette = (e) => e.etat === 'reglee'
    ? h('span', { class: 'etiquette' }, 'réglée')
    : e.etat === 'en-retard'
      ? h('span', { class: 'etiquette retard' }, 'en retard')
      : h('span', { class: 'doux' }, 'à venir');

  return h('div', { class: 'defilable' }, h('table', { class: 'echeancier' },
    h('thead', {}, h('tr', {},
      h('th', { class: 'num' }, 'N°'), h('th', {}, 'Échéance'),
      h('th', { class: 'num' }, 'Attendu'), h('th', { class: 'num' }, 'Couvert'),
      h('th', {}, 'État'))),
    h('tbody', {}, lignes.map((e) => h('tr', {},
      h('td', { class: 'num doux' }, e.rang),
      h('td', {}, fmtDate(e.date)),
      h('td', { class: 'num' }, fmtNombre(e.montant)),
      h('td', { class: 'num' }, e.couvert ? fmtNombre(e.couvert) : '—'),
      h('td', {}, etiquette(e))))),
    h('tfoot', {}, h('tr', { class: 'total' },
      h('td', { colspan: 2 }, 'Total'),
      h('td', { class: 'num' }, fmtMontant(p.montant, dev)),
      h('td', { class: 'num' }, fmtNombre(DB.totalRembourse(p))),
      h('td', {}, '')))));
}

/* ------------------------------------------------------------- écran --- */

export function vuePrets(ctx) {
  const { etat } = ctx;
  const dev = etat.association.devise;
  const optionsAdherents = etat.adherents.map((a) => ({ valeur: a.id, libelle: nomComplet(a) }));

  const champs = (p = {}) => [
    { cle: 'adherentId', libelle: 'Adhérent', type: 'select', valeur: p.adherentId,
      options: optionsAdherents },
    { cle: 'montant', libelle: 'Montant (' + dev + ')', type: 'number', requis: true,
      valeur: p.montant ?? null },
    { cle: 'dateOctroi', libelle: "Date d'octroi", type: 'date',
      valeur: p.dateOctroi || new Date().toISOString().slice(0, 10) },
    { cle: 'nbEcheances', libelle: 'Nombre de mensualités (0 = en une fois)', type: 'number',
      valeur: p.nbEcheances ?? null },
    { cle: 'dateLimite', libelle: 'Date limite de remboursement', type: 'date',
      valeur: p.dateLimite || '' },
    { cle: 'objet', libelle: 'Objet', large: true, valeur: p.objet || '' }
  ];

  const nouveau = () => {
    if (!optionsAdherents.length) return toast('Ajoutez d’abord un adhérent.');
    formulaire('Nouveau prêt', champs(),
      (v) => ctx.enregistrer('pret', 'upsert', { id: DB.uid('pret'), remboursements: [], ...v }));
  };

  const modifier = (p) => formulaire('Modifier le prêt', champs(p),
    (v) => ctx.enregistrer('pret', 'upsert', { ...p, ...v }));

  const rembourser = (p) => {
    const prochaine = DB.echeancier(p).find((e) => e.etat !== 'reglee');
    formulaire('Remboursement', [
      { cle: 'montant', libelle: 'Montant reçu (' + dev + ')', type: 'number', requis: true,
        valeur: prochaine ? prochaine.montant - prochaine.couvert : DB.encoursPret(p) },
      { cle: 'date', libelle: 'Date', type: 'date', valeur: new Date().toISOString().slice(0, 10) }
    ], (v) => ctx.enregistrer('pret', 'upsert', {
      ...p, remboursements: [...(p.remboursements || []), { id: DB.uid('remb'), ...v }]
    }));
  };

  const supprimer = (p) => confirmer('Supprimer ce prêt et son historique de remboursement ?',
    () => ctx.enregistrer('pret', 'delete', { id: p.id }));

  const prets = [...etat.prets].sort((a, b) =>
    (DB.encoursPret(b) > 0) - (DB.encoursPret(a) > 0)
    || (b.dateOctroi || '').localeCompare(a.dateOctroi || ''));

  const zoneDetail = h('div');
  const detailler = (p) => {
    const a = etat.adherents.find((x) => x.id === p.adherentId);
    zoneDetail.replaceChildren(h('div', { class: 'carte' },
      h('div', { class: 'barre' },
        h('h2', { style: 'margin:0' }, 'Échéancier — ' + nomComplet(a)),
        h('button', { class: 'pousse', onClick: () => zoneDetail.replaceChildren() }, 'Fermer')),
      h('p', { class: 'doux' },
        fmtMontant(p.montant, dev) + ' prêtés le ' + fmtDate(p.dateOctroi)
        + (p.objet ? ' — ' + p.objet : '')
        + ' · reste dû ' + fmtMontant(DB.encoursPret(p), dev)),
      blocEcheancier(etat, p),
      (p.remboursements || []).length ? h('div', {},
        h('h3', { style: 'margin-top:1rem' }, 'Remboursements reçus'),
        h('table', {}, h('tbody', {}, [...p.remboursements]
          .sort((x, y) => (x.date || '').localeCompare(y.date || ''))
          .map((r) => h('tr', {},
            h('td', { class: 'doux' }, fmtDate(r.date)),
            h('td', { class: 'num' }, fmtNombre(r.montant))))))) : null));
    zoneDetail.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  /* --- encours par adhérent ------------------------------------------- */

  const encours = DB.encoursParAdherent(etat).filter((l) => l.encours > 0 || l.nombre);
  const blocEncours = encours.length ? h('div', { class: 'carte' },
    h('h2', {}, 'Engagement par adhérent'),
    h('div', { class: 'defilable' }, h('table', { class: 'encours' },
      h('thead', {}, h('tr', {},
        h('th', {}, 'Adhérent'), h('th', { class: 'num' }, 'Prêts'),
        h('th', { class: 'num' }, 'Emprunté'), h('th', { class: 'num' }, 'Remboursé'),
        h('th', { class: 'num' }, 'Reste dû'), h('th', {}, ''))),
      h('tbody', {}, encours.map((l) => h('tr', {},
        h('td', {}, l.adherent ? nomComplet(l.adherent)
          : h('span', { class: 'doux' }, 'adhérent retiré')),
        h('td', { class: 'num doux' }, l.nombre),
        h('td', { class: 'num' }, fmtNombre(l.emprunte)),
        h('td', { class: 'num' }, fmtNombre(l.rembourse)),
        h('td', { class: 'num', style: l.encours ? 'font-weight:650' : '' },
          l.encours ? fmtNombre(l.encours) : '—'),
        h('td', {}, l.enRetard ? h('span', { class: 'etiquette retard' }, 'en retard')
          : l.encours ? h('span', { class: 'etiquette attente' }, 'en cours')
          : h('span', { class: 'etiquette' }, 'soldé'))))),
      h('tfoot', {}, h('tr', { class: 'total' },
        h('td', {}, 'Total'),
        h('td', { class: 'num' }, encours.reduce((s, l) => s + l.nombre, 0)),
        h('td', { class: 'num' }, fmtNombre(encours.reduce((s, l) => s + l.emprunte, 0))),
        h('td', { class: 'num' }, fmtNombre(encours.reduce((s, l) => s + l.rembourse, 0))),
        h('td', { class: 'num' }, fmtMontant(encours.reduce((s, l) => s + l.encours, 0), dev)),
        h('td', {}, '')))))) : null;

  /* --- rendu ----------------------------------------------------------- */

  return h('div', {},
    h('div', { class: 'barre' },
      h('h1', {}, 'Prêts'),
      ctx.peutEcrire ? h('button', { class: 'primaire pousse', onClick: nouveau }, '+ Nouveau prêt') : null),

    prets.length === 0
      ? h('div', { class: 'carte' }, h('p', { class: 'vide' }, 'Aucun prêt en cours.'))
      : h('div', { class: 'carte' }, h('div', { class: 'defilable' }, h('table', {},
          h('thead', {}, h('tr', {},
            h('th', {}, 'Adhérent'), h('th', { class: 'num' }, 'Montant'),
            h('th', { class: 'num' }, 'Remboursé'), h('th', { class: 'num' }, 'Reste dû'),
            h('th', {}, 'Échéance'), h('th', {}, 'État'), h('th', {}, ''))),
          h('tbody', {}, prets.map((p) => {
            const a = etat.adherents.find((x) => x.id === p.adherentId);
            const rembourse = DB.totalRembourse(p);
            const reste = DB.encoursPret(p);
            const retard = DB.enRetard(p);
            const ech = DB.echeancier(p);
            const enRetardEcheance = ech.filter((e) => e.etat === 'en-retard').length;
            return h('tr', {},
              h('td', {}, nomComplet(a), p.objet ? h('div', { class: 'doux' }, p.objet) : null),
              h('td', { class: 'num' }, fmtNombre(p.montant)),
              h('td', { class: 'num' }, fmtNombre(rembourse)),
              h('td', { class: 'num', style: reste ? 'font-weight:650' : '' },
                reste ? fmtNombre(reste) : '—'),
              h('td', { class: 'doux' }, ech.length
                ? `${ech.length} mensualités · fin ${fmtDate(ech[ech.length - 1].date)}`
                : fmtDate(p.dateLimite)),
              h('td', {}, reste === 0
                ? h('span', { class: 'etiquette' }, 'soldé')
                : h('span', { class: 'etiquette ' + (retard || enRetardEcheance ? 'retard' : 'attente') },
                    retard ? 'en retard'
                      : enRetardEcheance ? enRetardEcheance + ' échéance' + (enRetardEcheance > 1 ? 's' : '') + ' en retard'
                      : 'en cours')),
              h('td', { style: 'white-space:nowrap;text-align:right' },
                h('button', { onClick: () => detailler(p) }, 'Échéancier'),
                ctx.peutEcrire ? ' ' : null,
                ctx.peutEcrire && reste > 0
                  ? h('button', { onClick: () => rembourser(p) }, 'Rembourser') : null,
                ctx.peutEcrire ? ' ' : null,
                ctx.peutEcrire ? h('button', { onClick: () => modifier(p) }, 'Modifier') : null,
                ctx.peutEcrire ? ' ' : null,
                ctx.peutEcrire
                  ? h('button', { class: 'danger', onClick: () => supprimer(p) }, '✕') : null));
          }))))),

    zoneDetail,
    blocEncours);
}
