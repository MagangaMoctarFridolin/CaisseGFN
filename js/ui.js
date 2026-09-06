/* ============================================================================
   ui.js — Les écrans de l'application.
   ========================================================================== */

import * as DB from './db.js';

const { fmtMontant, fmtNombre, fmtDate, nomComplet, MOIS_NOMS } = DB;

/* ------------------------------------------------------------------ fabrique */

export function h(balise, attrs = {}, ...enfants) {
  const e = document.createElement(balise);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of enfants.flat(3)) {
    if (c == null || c === false) continue;
    e.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return e;
}

let minuteurToast;
export function toast(message) {
  document.getElementById('toast')?.remove();
  const t = h('div', { id: 'toast' }, message);
  document.body.append(t);
  clearTimeout(minuteurToast);
  minuteurToast = setTimeout(() => t.remove(), 3200);
}

/** Petite fenêtre de formulaire. champs = [{cle, libelle, type, options, valeur, requis}] */
export function formulaire(titre, champs, surValider) {
  const d = h('dialog');
  const grille = h('div', { class: 'champs' });
  const entrees = {};
  for (const c of champs) {
    let entree;
    if (c.type === 'select') {
      entree = h('select', { name: c.cle }, (c.options || []).map((o) =>
        h('option', { value: o.valeur, selected: String(o.valeur) === String(c.valeur ?? '') }, o.libelle)));
    } else if (c.type === 'textarea') {
      entree = h('textarea', { name: c.cle, rows: 2 });
      entree.value = c.valeur ?? '';
    } else {
      entree = h('input', { name: c.cle, type: c.type || 'text', step: c.type === 'number' ? '1' : null,
        min: c.type === 'number' ? '0' : null, required: !!c.requis });
      entree.value = c.valeur ?? '';
    }
    entrees[c.cle] = entree;
    const bloc = h('div', { style: c.large ? 'grid-column:1/-1' : null }, h('label', {}, c.libelle), entree);
    grille.append(bloc);
  }
  const form = h('form', { method: 'dialog' },
    h('div', { class: 'corps' }, h('h2', {}, titre), grille),
    h('div', { class: 'pied' },
      h('button', { type: 'button', onClick: () => d.close() }, 'Annuler'),
      h('button', { class: 'primaire', type: 'submit' }, 'Enregistrer')));
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const valeurs = {};
    for (const [k, entree] of Object.entries(entrees)) {
      const c = champs.find((x) => x.cle === k);
      valeurs[k] = c.type === 'number' ? (entree.value === '' ? null : +entree.value) : entree.value.trim();
    }
    d.close();
    surValider(valeurs);
  });
  d.append(form);
  document.body.append(d);
  d.addEventListener('close', () => d.remove());
  d.showModal();
  setTimeout(() => grille.querySelector('input,select,textarea')?.focus(), 30);
}

export function confirmer(message, surOui) {
  const d = h('dialog', {},
    h('div', { class: 'corps' }, h('p', { style: 'margin:0' }, message)),
    h('div', { class: 'pied' },
      h('button', { onClick: () => d.close() }, 'Annuler'),
      h('button', { class: 'primaire', onClick: () => { d.close(); surOui(); } }, 'Confirmer')));
  document.body.append(d);
  d.addEventListener('close', () => d.remove());
  d.showModal();
}

/* ========================================================== tableau de bord === */

export function vueTableauBord(ctx) {
  const { etat, annee } = ctx;
  const t = DB.totaux(etat, annee);
  const tGlobal = DB.totaux(etat, null);
  const mois = DB.parMois(etat, annee);
  const max = Math.max(...mois, 1);
  const dev = etat.association.devise;

  const retards = etat.prets.filter((p) => DB.enRetard(p));

  return h('div', {},
    h('div', { class: 'barre' }, selecteurAnnee(ctx), h('span', { class: 'doux pousse' },
      `${etat.adherents.length} adhérents enregistrés`)),

    h('div', { class: 'grille', style: 'margin-bottom:1rem' },
      stat('Cotisations ' + annee, fmtMontant(t.totalCotisations, dev)),
      stat('Solde de la caisse', fmtMontant(tGlobal.solde, dev)),
      stat('Prêts en cours', fmtMontant(tGlobal.encoursPrets, dev)),
      retards.length
        ? stat('Remboursements en retard', retards.length, true)
        : stat('Adhérents actifs', t.nbAdherents)),

    etat.association.airtelMoney ? h('div', { class: 'carte',
      style: 'background:var(--accent-clair);border-color:transparent' },
      h('div', { style: 'display:flex;flex-wrap:wrap;align-items:baseline;gap:.2rem 1rem' },
        h('span', { style: 'font-size:.78rem;text-transform:uppercase;letter-spacing:.04em;color:var(--accent)' },
          'Cotisations par Airtel Money'),
        h('span', { style: 'font-size:1.5rem;font-weight:700;color:var(--accent);font-variant-numeric:tabular-nums' },
          etat.association.airtelMoney))) : null,

    h('div', { class: 'carte' },
      h('h2', {}, 'Cotisations par mois — ' + annee),
      mois.every((m) => !m)
        ? h('p', { class: 'vide' }, 'Aucune cotisation enregistrée pour cette année.')
        : h('div', {}, MOIS_NOMS.map((nom, i) => h('div', {
            style: 'display:grid;grid-template-columns:5.5rem 1fr 7rem;align-items:center;gap:.5rem;padding:.18rem 0'
          },
          h('span', { class: 'doux' }, nom),
          h('div', { style: 'background:var(--trait);border-radius:4px;height:14px;overflow:hidden' },
            h('div', { style: `width:${(mois[i] / max) * 100}%;height:100%;background:var(--accent);border-radius:4px` })),
          h('span', { class: 'num', style: 'text-align:right;font-variant-numeric:tabular-nums' },
            mois[i] ? fmtNombre(mois[i]) : '—'))))),

    retards.length ? h('div', { class: 'carte' },
      h('h2', {}, 'À relancer'),
      h('table', {}, h('tbody', {}, retards.map((p) => {
        const a = etat.adherents.find((x) => x.id === p.adherentId);
        return h('tr', {},
          h('td', {}, nomComplet(a)),
          h('td', { class: 'num' }, fmtMontant(DB.encoursPret(p), dev)),
          h('td', {}, h('span', { class: 'etiquette retard' }, 'échéance ' + fmtDate(p.dateLimite))));
      })))) : null,

    h('div', { class: 'carte' },
      h('h2', {}, 'Classement des apports'),
      tableauApports(ctx)));
}

function stat(libelle, valeur, alerte) {
  return h('div', { class: 'stat' + (alerte ? ' alerte' : '') },
    h('div', { class: 'libelle' }, libelle), h('div', { class: 'valeur' }, valeur));
}

function tableauApports(ctx) {
  const { etat, annee } = ctx;
  const dev = etat.association.devise;
  const lignes = etat.adherents.map((a) => ({
    a, annuel: DB.totalCotisationsAdherent(etat, a.id, annee),
    total: DB.totalCotisationsAdherent(etat, a.id, null)
  })).sort((x, y) => y.total - x.total);
  const totalGeneral = lignes.reduce((s, l) => s + l.total, 0) || 1;

  return h('div', { class: 'defilable' }, h('table', {},
    h('thead', {}, h('tr', {},
      h('th', {}, 'Adhérent'), h('th', { class: 'num' }, annee),
      h('th', { class: 'num' }, 'Cumul'), h('th', { class: 'num' }, 'Part'))),
    h('tbody', {}, lignes.map((l) => h('tr', {},
      h('td', {}, nomComplet(l.a)),
      h('td', { class: 'num' }, l.annuel ? fmtNombre(l.annuel) : '—'),
      h('td', { class: 'num' }, fmtNombre(l.total)),
      h('td', { class: 'num' }, ((l.total / totalGeneral) * 100).toFixed(1) + ' %'))),
      h('tr', { class: 'total' },
        h('td', {}, 'Total'),
        h('td', { class: 'num' }, fmtNombre(lignes.reduce((s, l) => s + l.annuel, 0))),
        h('td', { class: 'num' }, fmtMontant(totalGeneral, dev)),
        h('td', { class: 'num' }, '100 %')))));
}

function selecteurAnnee(ctx) {
  const annees = DB.anneesConnues(ctx.etat);
  const s = h('select', { style: 'width:auto', onChange: (e) => ctx.setAnnee(+e.target.value) },
    annees.map((a) => h('option', { value: a, selected: a === ctx.annee }, a)));
  return s;
}

/* ================================================================ adhérents === */

export function vueAdherents(ctx) {
  const { etat } = ctx;
  const dev = etat.association.devise;

  const ajouter = () => formulaire('Nouvel adhérent', [
    { cle: 'numero', libelle: 'N° adhérent', valeur: prochainNumero(etat), requis: true },
    { cle: 'prenom', libelle: 'Prénom', requis: true },
    { cle: 'nom', libelle: 'Nom' },
    { cle: 'telephone', libelle: 'Téléphone' },
    { cle: 'email', libelle: 'E-mail', type: 'email' },
    { cle: 'dateAdhesion', libelle: "Date d'adhésion", type: 'date', valeur: new Date().toISOString().slice(0, 10) },
    { cle: 'remarques', libelle: 'Remarques', type: 'textarea', large: true }
  ], (v) => ctx.enregistrer('adherent', 'upsert', { id: DB.uid('adh'), actif: true, ...v }));

  const modifier = (a) => formulaire('Modifier ' + nomComplet(a), [
    { cle: 'numero', libelle: 'N° adhérent', valeur: a.numero, requis: true },
    { cle: 'prenom', libelle: 'Prénom', valeur: a.prenom },
    { cle: 'nom', libelle: 'Nom', valeur: a.nom },
    { cle: 'telephone', libelle: 'Téléphone', valeur: a.telephone },
    { cle: 'email', libelle: 'E-mail', type: 'email', valeur: a.email },
    { cle: 'dateAdhesion', libelle: "Date d'adhésion", type: 'date', valeur: a.dateAdhesion },
    { cle: 'actif', libelle: 'Statut', type: 'select', valeur: a.actif === false ? 'non' : 'oui',
      options: [{ valeur: 'oui', libelle: 'Actif' }, { valeur: 'non', libelle: 'Inactif' }] },
    { cle: 'remarques', libelle: 'Remarques', type: 'textarea', valeur: a.remarques, large: true }
  ], (v) => ctx.enregistrer('adherent', 'upsert', { ...a, ...v, actif: v.actif !== 'non' }));

  const supprimer = (a) => confirmer(
    `Retirer ${nomComplet(a)} de la liste ? Ses cotisations déjà saisies restent dans l'historique.`,
    () => ctx.enregistrer('adherent', 'delete', { id: a.id }));

  return h('div', {},
    h('div', { class: 'barre' },
      h('h1', {}, 'Adhérents'),
      ctx.peutEcrire ? h('button', { class: 'primaire pousse', onClick: ajouter }, '+ Ajouter') : null),
    etat.adherents.length === 0
      ? h('div', { class: 'carte' }, h('p', { class: 'vide' }, 'Aucun adhérent. Commencez par en ajouter un.'))
      : h('div', { class: 'carte' }, h('div', { class: 'defilable' }, h('table', {},
          h('thead', {}, h('tr', {},
            h('th', {}, 'N°'), h('th', {}, 'Adhérent'), h('th', {}, 'Contact'),
            h('th', {}, 'Adhésion'), h('th', { class: 'num' }, 'Cumul apports'),
            ctx.peutEcrire ? h('th', {}, '') : null)),
          h('tbody', {}, [...etat.adherents]
            .sort((a, b) => (a.numero || '').localeCompare(b.numero || ''))
            .map((a) => h('tr', {},
              h('td', {}, a.numero),
              h('td', {}, nomComplet(a), a.actif === false ? ' ' : '',
                a.actif === false ? h('span', { class: 'etiquette attente' }, 'inactif') : null),
              h('td', { class: 'doux' }, [a.telephone, a.email].filter(Boolean).join(' · ') || '—'),
              h('td', { class: 'doux' }, fmtDate(a.dateAdhesion)),
              h('td', { class: 'num' }, fmtMontant(DB.totalCotisationsAdherent(etat, a.id), dev)),
              ctx.peutEcrire ? h('td', { style: 'white-space:nowrap;text-align:right' },
                h('button', { onClick: () => modifier(a) }, 'Modifier'),
                ' ',
                h('button', { class: 'danger', onClick: () => supprimer(a) }, '✕')) : null)))))));
}

function prochainNumero(etat) {
  const nums = etat.adherents.map((a) => /^([A-Za-z]*)(\d+)$/.exec(a.numero || '')).filter(Boolean);
  if (!nums.length) return 'GFN001';
  const prefixe = nums[0][1] || 'GFN';
  const max = Math.max(...nums.map((m) => +m[2]));
  return prefixe + String(max + 1).padStart(nums[0][2].length, '0');
}

/* ============================================================== cotisations === */

export function vueCotisations(ctx) {
  const { etat, annee } = ctx;
  const dev = etat.association.devise;
  const adherents = [...etat.adherents].sort((a, b) => (a.numero || '').localeCompare(b.numero || ''));

  const trouver = (adherentId, mois) =>
    etat.cotisations.find((c) => c.adherentId === adherentId && c.annee === annee && c.mois === mois);

  const saisir = (a, mois, champ) => {
    const brut = champ.value.replace(/[^\d.-]/g, '');
    const montant = brut === '' ? 0 : Math.round(+brut);
    const existante = trouver(a.id, mois);
    if (montant === (existante ? +existante.montant : 0)) return;
    if (montant === 0 && existante) {
      ctx.enregistrer('cotisation', 'delete', { id: existante.id });
    } else if (montant > 0) {
      ctx.enregistrer('cotisation', 'upsert', {
        id: existante?.id || DB.uid('cot'),
        adherentId: a.id, annee, mois, montant,
        date: existante?.date || new Date().toISOString().slice(0, 10)
      });
    }
  };

  const totauxMois = Array.from({ length: 12 }, (_, i) =>
    adherents.reduce((s, a) => s + (+trouver(a.id, i + 1)?.montant || 0), 0));

  const corps = adherents.map((a) => {
    const cellules = Array.from({ length: 12 }, (_, i) => {
      const mois = i + 1;
      const c = trouver(a.id, mois);
      if (!ctx.peutEcrire) {
        return h('td', { class: 'num', style: 'padding:.5rem .55rem' }, c ? fmtNombre(c.montant) : '—');
      }
      const champ = h('input', {
        type: 'text', inputmode: 'numeric', value: c ? fmtNombre(c.montant) : '',
        'aria-label': `${nomComplet(a)} — ${MOIS_NOMS[i]}`,
        onFocus: (e) => { e.target.value = c ? String(Math.round(c.montant)) : ''; e.target.select(); },
        onBlur: (e) => saisir(a, mois, e.target),
        onKeydown: (e) => { if (e.key === 'Enter') e.target.blur(); }
      });
      return h('td', {}, champ);
    });
    const total = DB.totalCotisationsAdherent(etat, a.id, annee);
    return h('tr', {}, h('td', { class: 'nom' }, nomComplet(a)), cellules,
      h('td', { class: 'num', style: 'font-weight:650' }, total ? fmtNombre(total) : '—'));
  });

  return h('div', {},
    h('div', { class: 'barre' },
      h('h1', {}, 'Cotisations'), selecteurAnnee(ctx),
      h('span', { class: 'doux pousse' },
        'Total ' + annee + ' : ' + fmtMontant(totauxMois.reduce((s, x) => s + x, 0), dev))),
    h('p', { class: 'doux', style: 'margin-top:-.4rem' }, ctx.peutEcrire
      ? 'Cliquez dans une case pour saisir un montant. Laissez vide pour un mois non cotisé.'
      : 'Consultation seule : votre compte n’a pas le droit de modifier ces montants.'),
    adherents.length === 0
      ? h('div', { class: 'carte' }, h('p', { class: 'vide' }, 'Ajoutez d’abord des adhérents.'))
      : h('div', { class: 'carte' }, h('div', { class: 'defilable' },
          h('table', { class: 'saisie' },
            h('thead', {}, h('tr', {},
              h('th', {}, 'Adhérent'),
              MOIS_NOMS.map((m) => h('th', { class: 'num' }, m.slice(0, 4))),
              h('th', { class: 'num' }, 'Total'))),
            h('tbody', {}, corps),
            h('tfoot', {}, h('tr', { class: 'total' },
              h('td', { class: 'nom' }, 'Total'),
              totauxMois.map((t) => h('td', { class: 'num' }, t ? fmtNombre(t) : '—')),
              h('td', { class: 'num' }, fmtNombre(totauxMois.reduce((s, x) => s + x, 0)))))))));
}

/* ==================================================================== prêts === */

export function vuePrets(ctx) {
  const { etat } = ctx;
  const dev = etat.association.devise;
  const optionsAdherents = etat.adherents.map((a) => ({ valeur: a.id, libelle: nomComplet(a) }));

  const nouveau = () => {
    if (!optionsAdherents.length) return toast('Ajoutez d’abord un adhérent.');
    formulaire('Nouveau prêt', [
      { cle: 'adherentId', libelle: 'Adhérent', type: 'select', options: optionsAdherents },
      { cle: 'montant', libelle: 'Montant (' + dev + ')', type: 'number', requis: true },
      { cle: 'dateOctroi', libelle: "Date d'octroi", type: 'date', valeur: new Date().toISOString().slice(0, 10) },
      { cle: 'dateLimite', libelle: 'Date limite de remboursement', type: 'date' },
      { cle: 'objet', libelle: 'Objet', large: true }
    ], (v) => ctx.enregistrer('pret', 'upsert', { id: DB.uid('pret'), remboursements: [], ...v }));
  };

  const rembourser = (p) => formulaire('Remboursement', [
    { cle: 'montant', libelle: 'Montant reçu (' + dev + ')', type: 'number', requis: true,
      valeur: DB.encoursPret(p) },
    { cle: 'date', libelle: 'Date', type: 'date', valeur: new Date().toISOString().slice(0, 10) }
  ], (v) => ctx.enregistrer('pret', 'upsert', {
    ...p, remboursements: [...(p.remboursements || []), { id: DB.uid('remb'), ...v }]
  }));

  const supprimer = (p) => confirmer('Supprimer ce prêt et son historique de remboursement ?',
    () => ctx.enregistrer('pret', 'delete', { id: p.id }));

  const prets = [...etat.prets].sort((a, b) => (b.dateOctroi || '').localeCompare(a.dateOctroi || ''));

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
            h('th', {}, 'Échéance'), h('th', {}, 'État'), ctx.peutEcrire ? h('th', {}, '') : null)),
          h('tbody', {}, prets.map((p) => {
            const a = etat.adherents.find((x) => x.id === p.adherentId);
            const rembourse = (p.remboursements || []).reduce((s, r) => s + (+r.montant || 0), 0);
            const reste = DB.encoursPret(p);
            const retard = DB.enRetard(p);
            return h('tr', {},
              h('td', {}, nomComplet(a), p.objet ? h('div', { class: 'doux' }, p.objet) : null),
              h('td', { class: 'num' }, fmtNombre(p.montant)),
              h('td', { class: 'num' }, fmtNombre(rembourse)),
              h('td', { class: 'num', style: reste ? 'font-weight:650' : '' }, reste ? fmtNombre(reste) : '—'),
              h('td', { class: 'doux' }, fmtDate(p.dateLimite)),
              h('td', {}, reste === 0
                ? h('span', { class: 'etiquette' }, 'soldé')
                : h('span', { class: 'etiquette ' + (retard ? 'retard' : 'attente') }, retard ? 'en retard' : 'en cours')),
              ctx.peutEcrire ? h('td', { style: 'white-space:nowrap;text-align:right' },
                reste > 0 ? h('button', { onClick: () => rembourser(p) }, 'Rembourser') : null,
                ' ', h('button', { class: 'danger', onClick: () => supprimer(p) }, '✕')) : null);
          }))))));
}

/* ============================================================ comptabilité === */

export function vueComptabilite(ctx) {
  const { etat, annee } = ctx;
  const dev = etat.association.devise;
  const optionsAdherents = [{ valeur: '', libelle: '— aucun —' },
    ...etat.adherents.map((a) => ({ valeur: a.id, libelle: nomComplet(a) }))];

  const champs = (m = {}) => [
    { cle: 'date', libelle: 'Date', type: 'date', valeur: m.date || new Date().toISOString().slice(0, 10), requis: true },
    { cle: 'nature', libelle: 'Nature', type: 'select', valeur: m.nature || 'Cotisation',
      options: ['Cotisation', 'Prêt', 'Remboursement', 'Frais', 'Don', 'Autre'].map((x) => ({ valeur: x, libelle: x })) },
    { cle: 'credit', libelle: 'Crédit (entrée)', type: 'number', valeur: m.credit },
    { cle: 'debit', libelle: 'Débit (sortie)', type: 'number', valeur: m.debit },
    { cle: 'adherentId', libelle: 'Adhérent concerné', type: 'select', valeur: m.adherentId || '', options: optionsAdherents },
    { cle: 'objet', libelle: 'Objet', valeur: m.objet, large: true },
    { cle: 'remarques', libelle: 'Remarques', type: 'textarea', valeur: m.remarques, large: true }
  ];

  const ajouter = () => formulaire('Nouveau mouvement', champs(),
    (v) => ctx.enregistrer('mouvement', 'upsert', { id: DB.uid('mvt'), ...v }));
  const modifier = (m) => formulaire('Modifier le mouvement', champs(m),
    (v) => ctx.enregistrer('mouvement', 'upsert', { ...m, ...v }));
  const supprimer = (m) => confirmer('Supprimer ce mouvement ?',
    () => ctx.enregistrer('mouvement', 'delete', { id: m.id }));

  const mvts = etat.mouvements
    .filter((m) => new Date(m.date).getFullYear() === annee)
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  let solde = 0;
  const lignes = mvts.map((m) => {
    solde += (+m.credit || 0) - (+m.debit || 0);
    const a = etat.adherents.find((x) => x.id === m.adherentId);
    return h('tr', {},
      h('td', { class: 'doux' }, fmtDate(m.date)),
      h('td', {}, m.objet || m.nature || '—', a ? h('div', { class: 'doux' }, nomComplet(a)) : null),
      h('td', {}, h('span', { class: 'etiquette' }, m.nature || 'Autre')),
      h('td', { class: 'num' }, m.credit ? fmtNombre(m.credit) : ''),
      h('td', { class: 'num' }, m.debit ? fmtNombre(m.debit) : ''),
      h('td', { class: 'num' }, fmtNombre(solde)),
      ctx.peutEcrire ? h('td', { style: 'white-space:nowrap;text-align:right' },
        h('button', { onClick: () => modifier(m) }, 'Modifier'), ' ',
        h('button', { class: 'danger', onClick: () => supprimer(m) }, '✕')) : null);
  });

  const t = DB.totaux(etat, annee);

  return h('div', {},
    h('div', { class: 'barre' },
      h('h1', {}, 'Comptabilité'), selecteurAnnee(ctx),
      ctx.peutEcrire ? h('button', { class: 'primaire pousse', onClick: ajouter }, '+ Mouvement') : null),
    h('div', { class: 'grille', style: 'margin-bottom:1rem' },
      stat('Entrées ' + annee, fmtMontant(t.credits, dev)),
      stat('Sorties ' + annee, fmtMontant(t.debits, dev)),
      stat('Cotisations ' + annee, fmtMontant(t.totalCotisations, dev)),
      stat('Solde caisse', fmtMontant(DB.totaux(etat, null).solde, dev))),
    h('p', { class: 'doux', style: 'margin-top:-.4rem' },
      'Les cotisations saisies dans l’onglet Cotisations comptent déjà dans le solde ; n’inscrivez ici que les autres mouvements (frais, dons, prêts décaissés…).'),
    mvts.length === 0
      ? h('div', { class: 'carte' }, h('p', { class: 'vide' }, 'Aucun mouvement enregistré pour ' + annee + '.'))
      : h('div', { class: 'carte' }, h('div', { class: 'defilable' }, h('table', {},
          h('thead', {}, h('tr', {},
            h('th', {}, 'Date'), h('th', {}, 'Objet'), h('th', {}, 'Nature'),
            h('th', { class: 'num' }, 'Crédit'), h('th', { class: 'num' }, 'Débit'),
            h('th', { class: 'num' }, 'Solde'), ctx.peutEcrire ? h('th', {}, '') : null)),
          h('tbody', {}, lignes)))));
}

/* ================================================================ rapports === */

export function vueRapports(ctx) {
  const { etat, annee } = ctx;
  const dev = etat.association.devise;
  const zone = h('div');

  const fiche = (a) => {
    const cots = etat.cotisations.filter((c) => c.adherentId === a.id).sort((x, y) =>
      x.annee - y.annee || x.mois - y.mois);
    const prets = etat.prets.filter((p) => p.adherentId === a.id);
    const total = cots.reduce((s, c) => s + (+c.montant || 0), 0);
    const totalGeneral = etat.cotisations.reduce((s, c) => s + (+c.montant || 0), 0) || 1;
    zone.replaceChildren(h('div', { class: 'carte' },
      h('div', { style: 'display:flex;justify-content:space-between;flex-wrap:wrap;gap:1rem' },
        h('div', {},
          h('h2', {}, etat.association.nom),
          h('div', { class: 'doux' }, etat.association.adresse),
          h('h3', { style: 'margin-top:1rem' }, 'État financier par adhérent')),
        h('div', { class: 'doux', style: 'text-align:right' },
          h('div', {}, 'Édité le ' + fmtDate(new Date())),
          h('div', {}, 'N° ' + (a.numero || '—')),
          h('div', {}, 'Adhésion : ' + fmtDate(a.dateAdhesion)))),
      h('h1', { style: 'margin-top:.8rem' }, nomComplet(a)),
      h('div', { class: 'grille', style: 'margin:.8rem 0' },
        stat('Apports cumulés', fmtMontant(total, dev)),
        stat('Part dans la caisse', ((total / totalGeneral) * 100).toFixed(1) + ' %'),
        stat('Prêts en cours', fmtMontant(prets.reduce((s, p) => s + DB.encoursPret(p), 0), dev))),
      h('h3', {}, 'Historique des apports'),
      cots.length ? h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Période'), h('th', { class: 'num' }, 'Montant'))),
        h('tbody', {}, cots.map((c) => h('tr', {},
          h('td', {}, MOIS_NOMS[c.mois - 1] + ' ' + c.annee),
          h('td', { class: 'num' }, fmtNombre(c.montant)))),
          h('tr', { class: 'total' }, h('td', {}, 'Total'), h('td', { class: 'num' }, fmtMontant(total, dev)))))
        : h('p', { class: 'doux' }, 'Aucun apport enregistré.'),
      prets.length ? h('div', {}, h('h3', { style: 'margin-top:1rem' }, 'Prêts'),
        h('table', {}, h('tbody', {}, prets.map((p) => h('tr', {},
          h('td', {}, fmtDate(p.dateOctroi) + (p.objet ? ' — ' + p.objet : '')),
          h('td', { class: 'num' }, fmtNombre(p.montant)),
          h('td', { class: 'num' }, 'reste ' + fmtNombre(DB.encoursPret(p)))))))) : null,
      h('p', { style: 'margin-top:2.5rem' }, 'Signature du trésorier : ______________________')));
    zone.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const rapportMensuel = () => {
    const mois = DB.parMois(etat, annee);
    const t = DB.totaux(etat, annee);
    zone.replaceChildren(h('div', { class: 'carte' },
      h('h2', {}, etat.association.nom),
      h('h3', {}, 'Rapport annuel ' + annee + ' — édité le ' + fmtDate(new Date())),
      h('div', { class: 'grille', style: 'margin:.8rem 0' },
        stat('Cotisations', fmtMontant(t.totalCotisations, dev)),
        stat('Entrées diverses', fmtMontant(t.credits, dev)),
        stat('Sorties', fmtMontant(t.debits, dev)),
        stat('Solde caisse', fmtMontant(DB.totaux(etat, null).solde, dev))),
      h('h3', {}, 'Détail par mois'),
      h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Mois'), h('th', { class: 'num' }, 'Cotisations'))),
        h('tbody', {}, MOIS_NOMS.map((m, i) => h('tr', {},
          h('td', {}, m), h('td', { class: 'num' }, mois[i] ? fmtNombre(mois[i]) : '—'))),
          h('tr', { class: 'total' }, h('td', {}, 'Total'),
            h('td', { class: 'num' }, fmtMontant(mois.reduce((s, x) => s + x, 0), dev))))),
      h('h3', { style: 'margin-top:1rem' }, 'Détail par adhérent'),
      tableauApports(ctx)));
    zone.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return h('div', {},
    h('div', { class: 'barre' }, h('h1', {}, 'Rapports'), selecteurAnnee(ctx)),
    h('div', { class: 'carte' },
      h('h2', {}, 'Éditer un document'),
      h('div', { class: 'barre' },
        h('button', { class: 'primaire', onClick: rapportMensuel }, 'Rapport annuel ' + annee),
        h('button', { onClick: () => window.print() }, 'Imprimer / PDF'),
        h('button', { onClick: () => exporterCSV(etat, annee) }, 'Exporter pour Excel (CSV)'),
        h('button', { onClick: () => exporterJSON(etat) }, 'Sauvegarde complète (JSON)')),
      h('h3', { style: 'margin-top:1rem' }, 'Fiche individuelle'),
      h('div', { class: 'barre' }, etat.adherents.length
        ? etat.adherents.map((a) => h('button', { onClick: () => fiche(a) }, nomComplet(a)))
        : h('span', { class: 'doux' }, 'Aucun adhérent.'))),
    zone);
}

export function telecharger(nom, contenu, type) {
  const url = URL.createObjectURL(new Blob([contenu], { type }));
  const a = h('a', { href: url, download: nom });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast('Fichier « ' + nom + ' » téléchargé.');
}

function exporterCSV(etat, annee) {
  const sep = ';';
  const lignes = [['N°', 'Nom', 'Prénom', ...MOIS_NOMS, 'Total'].join(sep)];
  for (const a of [...etat.adherents].sort((x, y) => (x.numero || '').localeCompare(y.numero || ''))) {
    const mois = Array.from({ length: 12 }, (_, i) =>
      etat.cotisations.filter((c) => c.adherentId === a.id && c.annee === annee && c.mois === i + 1)
        .reduce((s, c) => s + (+c.montant || 0), 0));
    lignes.push([a.numero, a.nom, a.prenom, ...mois.map((m) => m || ''),
      DB.totalCotisationsAdherent(etat, a.id, annee)].join(sep));
  }
  const totaux = Array.from({ length: 12 }, (_, i) => DB.parMois(etat, annee)[i]);
  lignes.push(['', 'TOTAL', '', ...totaux.map((t) => t || ''), totaux.reduce((s, x) => s + x, 0)].join(sep));
  telecharger(`cotisations-${annee}.csv`, '﻿' + lignes.join('\r\n'), 'text/csv;charset=utf-8');
}

function exporterJSON(etat) {
  telecharger(`sauvegarde-tontine-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify(etat, null, 1), 'application/json');
}

/* ================================================================ réglages === */

export function vueReglages(ctx) {
  const { etat, synchro } = ctx;
  const assoc = etat.association;
  const admin = ctx.estAdmin;

  const modifierAssoc = () => formulaire("Informations de l'association", [
    { cle: 'nom', libelle: 'Nom', valeur: assoc.nom, requis: true },
    { cle: 'adresse', libelle: 'Adresse du siège', valeur: assoc.adresse },
    { cle: 'telephone', libelle: 'Téléphone', valeur: assoc.telephone },
    { cle: 'email', libelle: 'E-mail', valeur: assoc.email },
    { cle: 'airtelMoney', libelle: 'Numéro Airtel Money (cotisations)', valeur: assoc.airtelMoney },
    { cle: 'devise', libelle: 'Devise', valeur: assoc.devise }
  ], (v) => ctx.enregistrer('association', 'upsert', v));

  const bloc = (titre, ...contenu) => h('div', { class: 'carte' }, h('h2', {}, titre), ...contenu);

  const relie = synchro.distants.length > 0;
  const dossierRelie = synchro.distants.includes(synchro.dossier);

  const zoneImport = h('input', { type: 'file', accept: '.jsonl,.json,.txt', style: 'display:none',
    onChange: async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const n = await synchro.importerJournal(await f.text(), f.name);
        toast(n + ' événements importés.');
      } catch (err) { toast('Import impossible : ' + err.message); }
      e.target.value = '';
    } });

  const baseVide = etat.adherents.length === 0 && etat.cotisations.length === 0;

  return h('div', {},
    h('div', { class: 'barre' },
      h('h1', {}, 'Réglages'),
      h('span', { class: 'doux pousse' }, ctx.session
        ? `Connecté : ${ctx.session.nom} (${admin ? 'administrateur' : 'adhérent'})` : '')),

    baseVide && admin ? h('div', { class: 'carte',
      style: 'border-color:var(--ambre);background:var(--ambre-clair)' },
      h('h2', { style: 'color:var(--ambre)' }, 'Reprendre les données du classeur'),
      h('p', { style: 'color:var(--ambre)' },
        'La base est encore vide. Les 402 000 FCFA de 2023 et les onze adhérents attendent dans le fichier de reprise, à importer une seule fois.'),
      h('p', { class: 'doux' },
        'Le fichier est dans le dossier Tontine-App, sous donnees/journal/ev-reprise-excel.jsonl. Une fois importé, tous les appareils le recevront.'),
      h('div', { class: 'barre' },
        h('button', { class: 'primaire', onClick: () => zoneImport.click() },
          'Importer le fichier de reprise'))) : null,

    ctx.blocComptes ? ctx.blocComptes(ctx) : null,

    bloc('Partager avec les adhérents',
      h('p', { class: 'doux' },
        'Le fichier de consultation est une page unique contenant la situation du moment. Il s’ouvre sur n’importe quel téléphone, sans installation ni compte Microsoft, et ne peut pas être modifié — c’est ce qu’il faut envoyer sur WhatsApp.'),
      h('div', { class: 'barre' },
        h('button', { class: 'primaire', onClick: () => ctx.exporterConsultation() },
          'Créer le fichier de consultation'),
        h('button', { onClick: () => ctx.partagerConsultation() }, 'Partager…'))),

    bloc('Où vont les données',
      h('ul', { class: 'doux', style: 'margin:.2rem 0 .8rem;padding-left:1.1rem;line-height:1.8' },
        h('li', {}, 'Cet appareil — toujours, même sans réseau'),
        synchro.distants.map((d) => h('li', {}, d.etiquette(),
          h('span', { class: 'etiquette', style: 'margin-left:.4rem' }, 'actif'))),
        !relie ? h('li', {}, 'Aucune destination distante : rien ne quitte cet appareil.') : null),
      h('div', { class: 'barre' },
        admin && synchro.dossier.disponible() && !dossierRelie
          ? h('button', { class: relie ? '' : 'primaire', onClick: async () => {
              try { await synchro.connecterDossier(); toast('Dossier OneDrive relié.'); }
              catch (e) { toast(e.message); } } },
            'Relier le dossier OneDrive (PC)')
          : null,
        h('button', { onClick: () => synchro.synchroniser() }, 'Synchroniser maintenant'),
        ctx.session ? h('button', { onClick: ctx.deconnexion }, 'Se déconnecter') : null),
      h('p', { class: 'doux' },
        `Appareil : ${synchro.nomAppareil} · ${synchro.nbEvenements} écritures dans l'historique` +
        (synchro.nbEnAttente ? ` · ${synchro.nbEnAttente} en attente d'envoi` : '') +
        (synchro.derniereSynchro ? ` · dernière synchro à ${synchro.derniereSynchro.toLocaleTimeString('fr-FR')}` : '')),
      admin && ctx.surServeur && !dossierRelie && synchro.dossier.disponible()
        ? h('div', { class: 'avert' },
            'Sur le PC, reliez aussi le dossier OneDrive : la base en ligne fait circuler les saisies entre les appareils, et OneDrive en garde la copie complète et lisible.')
        : null,
      synchro.erreur ? h('div', { class: 'mauvais' }, synchro.erreur) : null),

    bloc('Association',
      h('table', {}, h('tbody', {},
        [['Nom', assoc.nom], ['Siège', assoc.adresse], ['Téléphone', assoc.telephone || '—'],
         ['E-mail', assoc.email || '—'],
         ['Airtel Money', assoc.airtelMoney || '—'], ['Devise', assoc.devise]].map(([k, v]) =>
          h('tr', {}, h('td', { class: 'doux' }, k), h('td', {}, v))))),
      admin ? h('div', { class: 'barre', style: 'margin-top:.8rem' },
        h('button', { onClick: modifierAssoc }, 'Modifier')) : null),

    bloc('Nom de cet appareil',
      h('p', { class: 'doux' }, 'Ce nom apparaît dans l’historique des écritures, pour savoir qui a saisi quoi.'),
      h('div', { class: 'barre' },
        h('button', { onClick: () => formulaire('Nom de cet appareil',
          [{ cle: 'nom', libelle: 'Nom', valeur: synchro.nomAppareil, requis: true }],
          (v) => { synchro.nomAppareil = v.nom; localStorage.setItem('tontine:appareil:nom', v.nom);
                   toast('Nom enregistré.'); ctx.rafraichir(); }) }, 'Renommer'))),

    bloc('Reprise et sauvegarde',
      h('p', { class: 'doux' }, 'Importer un journal (.jsonl) fourni par un autre appareil, ou repartir des données du classeur Excel.'),
      h('div', { class: 'barre' },
        admin ? h('button', { onClick: () => zoneImport.click() }, 'Importer un journal') : null,
        h('button', { onClick: () => exporterJSON(etat) }, 'Télécharger une sauvegarde')),
      zoneImport));
}
