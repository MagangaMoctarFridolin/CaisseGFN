/* ============================================================================
   declarations.js — « J'ai versé ma cotisation. »

   Un adhérent n'écrit rien dans les comptes : le journal lui reste fermé, et
   c'est la base de données qui le lui refuse, pas l'écran. Mais il peut
   DÉCLARER un versement qu'il vient de faire — montant, mois, moyen, numéro
   de téléphone, référence de la transaction.

   La déclaration atterrit dans une table à part, en attente. C'est
   l'administrateur qui la valide, et c'est sa validation — pas la déclaration
   — qui inscrit la cotisation dans le journal. La frontière entre « ce que dit
   l'adhérent » et « ce que dit la caisse » reste donc entière.

   Ce n'est PAS un encaissement : l'argent part par Airtel Money comme avant,
   l'application ne fait que recueillir ce que l'adhérent affirme avoir payé.
   ========================================================================== */

import * as DB from './db.js';
import { h, formulaire, toast, confirmer } from './ui.js';

const CLE_TEL = 'tontine:telephone';

const ETIQUETTES = {
  attente: { texte: 'en attente', classe: 'etiquette attente' },
  validee: { texte: 'validée', classe: 'etiquette' },
  refusee: { texte: 'refusée', classe: 'etiquette retard' }
};

function quand(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR') + ' à ' + d.toLocaleTimeString('fr-FR', {
    hour: '2-digit', minute: '2-digit'
  });
}

function periode(d) {
  return DB.MOIS_NOMS[(d.mois || 1) - 1] + ' ' + d.annee;
}

/* --------------------------------------------------- côté adhérent --------- */

/**
 * Le formulaire de déclaration. Le mois proposé est le mois courant, le
 * téléphone est celui de la dernière fois : l'adhérent n'a en général qu'à
 * saisir le montant et la référence.
 */
export function declarer(ctx, surEnvoi) {
  const { etat, synchro } = ctx;
  const maintenant = new Date();
  const moyens = DB.canaux(etat);

  formulaire('Déclarer un versement', [
    { cle: 'montant', libelle: 'Montant versé (' + etat.association.devise + ')',
      type: 'number', requis: true },
    { cle: 'mois', libelle: 'Mois concerné', type: 'select',
      valeur: String(maintenant.getMonth() + 1),
      options: DB.MOIS_NOMS.map((m, i) => ({ valeur: String(i + 1), libelle: m })) },
    { cle: 'annee', libelle: 'Année', type: 'select', valeur: String(ctx.annee),
      options: DB.anneesConnues(etat).map((a) => ({ valeur: String(a), libelle: String(a) })) },
    { cle: 'moyen', libelle: 'Par quel moyen', type: 'select',
      valeur: moyens[0]?.id || '',
      options: [...moyens.map((m) => ({ valeur: m.id, libelle: m.nom })),
        { valeur: '', libelle: '— autre —' }] },
    { cle: 'telephone', libelle: 'Votre numéro de téléphone',
      valeur: localStorage.getItem(CLE_TEL) || '' },
    { cle: 'reference', libelle: 'Référence de la transaction' },
    { cle: 'note', libelle: 'Remarque pour le trésorier', large: true }
  ], async (v) => {
    const montant = Math.round(+v.montant || 0);
    if (montant <= 0) return toast('Indiquez le montant versé.');
    try {
      if (v.telephone) localStorage.setItem(CLE_TEL, v.telephone);
      await synchro.supabase.declarer({
        montant, mois: +v.mois, annee: +v.annee,
        moyen: v.moyen, telephone: v.telephone,
        reference: v.reference, note: v.note
      });
      toast('Déclaration envoyée au trésorier.');
      surEnvoi?.();
    } catch (e) { toast('Envoi impossible : ' + e.message); }
  });
}

/**
 * Ce que l'adhérent voit sur son tableau de bord : le bouton, et le suivi de
 * ce qu'il a déjà déclaré.
 */
export function blocMesDeclarations(ctx) {
  const { synchro } = ctx;
  const corps = h('div', { class: 'doux' }, 'Chargement…');

  const dessiner = (liste) => {
    if (!liste.length) {
      corps.replaceChildren(h('p', { class: 'doux', style: 'margin:.2rem 0 0' },
        'Vous n’avez encore rien déclaré. Versez d’abord par le moyen de votre choix, puis annoncez-le ici : le trésorier le retrouvera sans avoir à vous appeler.'));
      return;
    }
    corps.replaceChildren(h('div', { class: 'defilable' }, h('table', {},
      h('thead', {}, h('tr', {},
        h('th', {}, 'Période'), h('th', { class: 'num' }, 'Montant'),
        h('th', {}, 'Moyen'), h('th', {}, 'État'), h('th', {}, ''))),
      h('tbody', {}, liste.map((d) => {
        const et = ETIQUETTES[d.statut] || ETIQUETTES.attente;
        return h('tr', {},
          h('td', {}, periode(d), h('div', { class: 'doux' }, quand(d.cree_le))),
          h('td', { class: 'num' }, DB.fmtNombre(d.montant)),
          h('td', { class: 'doux' }, DB.nomCanal(ctx.etat, d.moyen),
            d.reference ? h('div', { class: 'doux' }, d.reference) : null),
          h('td', {}, h('span', { class: et.classe }, et.texte),
            d.statut === 'refusee' && d.motif
              ? h('div', { class: 'doux' }, d.motif) : null),
          h('td', { style: 'text-align:right' }, d.statut === 'attente'
            ? h('button', { class: 'danger', onClick: () => retirer(d) }, 'Retirer')
            : null));
      })))));
  };

  const retirer = async (d) => {
    if (!await confirmer('Retirer cette déclaration ?',
      'Elle n’a pas encore été validée : rien ne sera perdu dans les comptes.')) return;
    try {
      await synchro.supabase.supprimerDeclaration(d.id);
      toast('Déclaration retirée.');
      charger();
    } catch (e) { toast(e.message); }
  };

  const charger = async () => {
    try { dessiner(await synchro.supabase.listerDeclarations()); }
    catch (e) { corps.replaceChildren(h('p', { class: 'doux' }, 'Indisponible : ' + e.message)); }
  };
  charger();

  return h('div', { class: 'carte' },
    h('div', { class: 'barre' },
      h('h2', { style: 'margin:0' }, 'Mes versements déclarés'),
      h('button', { class: 'primaire pousse',
        onClick: () => declarer(ctx, charger) }, 'Déclarer un versement')),
    h('p', { class: 'doux', style: 'margin-top:-.3rem' },
      'L’application n’encaisse pas : vous payez par Airtel Money ou de la main à la main, puis vous le déclarez ici. Le trésorier valide, et la cotisation entre alors dans les comptes.'),
    corps);
}

/* ------------------------------------------------ côté administrateur ------ */

/**
 * La corbeille du trésorier : ce que les adhérents annoncent avoir versé, et
 * qui attend son verdict. Valider écrit la cotisation ; refuser laisse une
 * trace et un motif, pour que l'adhérent sache pourquoi.
 */
export function blocDeclarationsAValider(ctx) {
  const { synchro, etat } = ctx;
  const carte = h('div', { class: 'carte' });
  const corps = h('div', { class: 'doux' }, 'Chargement…');
  const titre = h('h2', {}, 'Versements déclarés');

  const cotisationExistante = (adherentId, annee, mois) =>
    etat.cotisations.find((c) => c.adherentId === adherentId && c.annee === annee && c.mois === mois);

  const valider = (d) => {
    const options = etat.adherents.map((a) => ({ valeur: a.id, libelle: DB.nomComplet(a) }));
    const dejaLa = d.adherent_id ? cotisationExistante(d.adherent_id, d.annee, d.mois) : null;
    formulaire(`Valider le versement de ${d.nom}`, [
      { cle: 'adherentId', libelle: 'Adhérent concerné', type: 'select',
        valeur: d.adherent_id || '',
        options: [{ valeur: '', libelle: '— à choisir —' }, ...options] },
      { cle: 'montant', libelle: dejaLa
          ? `Montant total du mois (${DB.fmtNombre(dejaLa.montant)} déjà inscrit)`
          : 'Montant à inscrire',
        type: 'number', valeur: Math.round((+d.montant || 0) + (+dejaLa?.montant || 0)) },
      { cle: 'moyen', libelle: 'Moyen', type: 'select', valeur: d.moyen || '',
        options: [{ valeur: '', libelle: '— non précisé —' },
          ...DB.canaux(etat, true).map((m) => ({ valeur: m.id, libelle: m.nom }))] },
      { cle: 'reference', libelle: 'Référence', valeur: d.reference || '' },
      { cle: 'date', libelle: 'Date du versement', type: 'date',
        valeur: (d.cree_le || new Date().toISOString()).slice(0, 10) }
    ], async (v) => {
      if (!v.adherentId) return toast('Choisissez l’adhérent concerné.');
      const montant = Math.round(+v.montant || 0);
      if (montant <= 0) return toast('Montant invalide.');
      const existante = cotisationExistante(v.adherentId, d.annee, d.mois);
      const id = existante?.id || DB.uid('cot');
      try {
        await synchro.enregistrer('cotisation', 'upsert', {
          id, adherentId: v.adherentId, annee: d.annee, mois: d.mois,
          montant, moyen: v.moyen, reference: v.reference, date: v.date
        });
        await synchro.supabase.majDeclaration(d.id, {
          statut: 'validee', cotisation_id: id,
          traite_le: new Date().toISOString(),
          traite_par: synchro.supabase.session?.utilisateur?.id || null
        });
        toast('Versement inscrit dans les cotisations.');
        charger();
        ctx.rafraichir();
      } catch (e) { toast(e.message); }
    });
  };

  const refuser = (d) => formulaire(`Refuser le versement de ${d.nom}`, [
    { cle: 'motif', libelle: 'Motif (l’adhérent le verra)', large: true, requis: true }
  ], async (v) => {
    try {
      await synchro.supabase.majDeclaration(d.id, {
        statut: 'refusee', motif: v.motif,
        traite_le: new Date().toISOString(),
        traite_par: synchro.supabase.session?.utilisateur?.id || null
      });
      toast('Déclaration refusée.');
      charger();
    } catch (e) { toast(e.message); }
  });

  const dessiner = (liste) => {
    const attente = liste.filter((d) => d.statut === 'attente');
    titre.replaceChildren('Versements déclarés', attente.length
      ? h('span', { class: 'etiquette attente', style: 'margin-left:.5rem' },
          attente.length + ' à traiter')
      : null);

    if (!liste.length) {
      corps.replaceChildren(h('p', { class: 'doux', style: 'margin:.2rem 0 0' },
        'Aucune déclaration pour le moment. Les adhérents peuvent annoncer leurs versements depuis leur téléphone ; ils apparaîtront ici.'));
      return;
    }
    corps.replaceChildren(h('div', { class: 'defilable' }, h('table', {},
      h('thead', {}, h('tr', {},
        h('th', {}, 'Adhérent'), h('th', {}, 'Période'), h('th', { class: 'num' }, 'Montant'),
        h('th', {}, 'Moyen et référence'), h('th', {}, 'État'), h('th', {}, ''))),
      h('tbody', {}, liste.map((d) => {
        const et = ETIQUETTES[d.statut] || ETIQUETTES.attente;
        return h('tr', {},
          h('td', {}, d.nom,
            d.telephone ? h('div', { class: 'doux' }, d.telephone) : null),
          h('td', {}, periode(d), h('div', { class: 'doux' }, quand(d.cree_le))),
          h('td', { class: 'num' }, DB.fmtNombre(d.montant)),
          h('td', { class: 'doux' }, DB.nomCanal(etat, d.moyen),
            d.reference ? h('div', {}, d.reference) : null,
            d.note ? h('div', { style: 'font-style:italic' }, d.note) : null),
          h('td', {}, h('span', { class: et.classe }, et.texte),
            d.statut === 'refusee' && d.motif ? h('div', { class: 'doux' }, d.motif) : null),
          h('td', { style: 'text-align:right;white-space:nowrap' },
            d.statut === 'attente' ? h('button', { class: 'primaire',
              onClick: () => valider(d) }, 'Valider') : null,
            d.statut === 'attente' ? h('button', { onClick: () => refuser(d) }, 'Refuser') : null));
      })))));
  };

  const charger = async () => {
    try { dessiner(await synchro.supabase.listerDeclarations()); }
    catch (e) { corps.replaceChildren(h('p', { class: 'doux' }, 'Indisponible : ' + e.message)); }
  };
  charger();

  carte.replaceChildren(titre,
    h('p', { class: 'doux' },
      'Ce que les adhérents annoncent avoir versé. Rien n’entre dans les comptes tant que vous n’avez pas validé : c’est votre validation qui écrit la cotisation.'),
    corps);
  return carte;
}
