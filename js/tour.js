/* ============================================================================
   tour.js — La tontine à tour de rôle.

   L'autre moitié de la tontine. Jusqu'ici l'application ne savait faire qu'une
   chose : accumuler, prêter, rendre compte. Or dans LA GRANDE FAMILLE NIELILI
   l'argent tourne aussi : chacun verse, et la totalité du mois revient à une
   personne, puis à la suivante, jusqu'à ce que tout le monde soit passé.

   Ce qui manquait n'était pas un calcul, c'était une mémoire : qui a déjà
   reçu, qui attend son tour. Le reste s'en déduit — le calendrier n'est pas
   stocké, il se recalcule à partir de l'ordre convenu et du mois de départ.
   Décaler le départ décale tout le monde, sans réécrire une ligne.

   Une remise n'est pas qu'une case cochée : c'est de l'argent qui sort de la
   caisse. Elle inscrit donc aussi un mouvement au débit, faute de quoi le
   solde affiché mentirait dès le premier tour.
   ========================================================================== */

import * as DB from './db.js';
import { h, toast, formulaire, confirmer } from './ui.js';

const { fmtMontant, fmtNombre, fmtDate, nomComplet, MOIS_NOMS } = DB;

const NATURE_TOUR = 'Tour de rôle';

/* ------------------------------------------------------------ écriture --- */

/** Toute modification du tour repasse par la fiche de l'association. */
function ecrire(ctx, tour) {
  return ctx.enregistrer('association', 'upsert', { ...ctx.etat.association, tour });
}

function tourBrut(etat) {
  const t = etat?.association?.tour;
  return {
    actif: t?.actif !== false,
    ordre: Array.isArray(t?.ordre) ? [...t.ordre] : [],
    debut: t?.debut || null,
    recus: Array.isArray(t?.recus) ? [...t.recus] : []
  };
}

/* -------------------------------------------------------------- écran --- */

export function vueTour(ctx) {
  const { etat } = ctx;
  const dev = etat.association.devise;
  const admin = ctx.peutEcrire;
  const brut = tourBrut(etat);
  const enPlace = brut.ordre.length > 0;

  /* --- mise en place ------------------------------------------------- */

  const actifs = [...etat.adherents]
    .filter((a) => a.actif !== false)
    .sort((a, b) => (a.numero || '').localeCompare(b.numero || ''));

  const mettreEnPlace = () => {
    if (!actifs.length) return toast('Ajoutez d’abord des adhérents.');
    const maintenant = new Date();
    formulaire('Mettre en place le tour de rôle', [
      { cle: 'mois', libelle: 'Mois du premier tour', type: 'select',
        valeur: String(maintenant.getMonth() + 1),
        options: MOIS_NOMS.map((m, i) => ({ valeur: String(i + 1), libelle: m })) },
      { cle: 'annee', libelle: 'Année du premier tour', type: 'number',
        valeur: maintenant.getFullYear() }
    ], (v) => {
      ecrire(ctx, {
        actif: true,
        ordre: actifs.map((a) => a.id),
        debut: { annee: +v.annee || maintenant.getFullYear(), mois: +v.mois || 1 },
        recus: []
      });
      toast('Tour de rôle mis en place — ajustez l’ordre si besoin.');
    });
  };

  if (!enPlace) {
    return h('div', {},
      h('div', { class: 'barre' }, h('h1', {}, 'Tour de rôle')),
      h('div', { class: 'carte' },
        h('p', {},
          'Dans une tontine à tour de rôle, tout le monde verse chaque mois et la totalité revient à une seule personne, différente à chaque tour, jusqu’à ce que chacun ait reçu une fois.'),
        h('p', { class: 'doux' },
          'Cet écran ne remplace pas la caisse : il s’ajoute à elle. Les cotisations restent saisies normalement ; le tour dit simplement à qui revient la somme du mois, et garde la trace de ce qui a été remis.'),
        h('p', { class: 'doux' },
          'À mettre en place une fois : l’ordre convenu entre vous, et le mois du premier tour. Tout le reste se calcule.'),
        admin ? h('div', { class: 'barre', style: 'margin-top:1rem' },
          h('button', { class: 'primaire', onClick: mettreEnPlace },
            'Mettre en place le tour de rôle'))
          : h('p', { class: 'doux' }, 'Aucun tour n’est en place pour le moment.')));
  }

  /* --- calendrier ----------------------------------------------------- */

  const calendrier = DB.calendrierTour(etat);
  const prochain = DB.prochainTour(etat);
  const nbRecus = calendrier.filter((l) => l.etat === 'recu').length;
  const totalRemis = calendrier.reduce((s, l) => s + (+l.recu?.montant || 0), 0);

  /* --- actions -------------------------------------------------------- */

  const deplacer = (rang, pas) => {
    const ordre = [...brut.ordre];
    const cible = rang + pas;
    if (cible < 0 || cible >= ordre.length) return;
    [ordre[rang], ordre[cible]] = [ordre[cible], ordre[rang]];
    ecrire(ctx, { ...brut, ordre });
  };

  const remettre = (ligne) => {
    const moyens = DB.canaux(etat, true);
    formulaire(`Remise du tour — ${nomComplet(ligne.adherent)}`, [
      { cle: 'montant', libelle: 'Somme remise (' + dev + ')', type: 'number', requis: true,
        valeur: ligne.recu?.montant ?? (ligne.cagnotte || null) },
      { cle: 'date', libelle: 'Date de la remise', type: 'date',
        valeur: ligne.recu?.date || new Date().toISOString().slice(0, 10) },
      { cle: 'moyen', libelle: 'Moyen', type: 'select', valeur: ligne.recu?.moyen || '',
        options: [{ valeur: '', libelle: '— non précisé —' },
          ...moyens.map((m) => ({ valeur: m.id, libelle: m.nom }))] },
      { cle: 'remarques', libelle: 'Remarques', type: 'textarea', large: true,
        valeur: ligne.recu?.remarques || '' }
    ], async (v) => {
      const montant = Math.round(+v.montant || 0);
      if (montant <= 0) return toast('Indiquez la somme remise.');

      // La sortie de caisse. On garde son identifiant dans le tour pour
      // pouvoir la reprendre — ou la retirer — si la remise est corrigée.
      const mouvementId = ligne.recu?.mouvementId || DB.uid('mvt');
      await ctx.enregistrer('mouvement', 'upsert', {
        id: mouvementId, date: v.date, nature: NATURE_TOUR,
        credit: null, debit: montant, adherentId: ligne.adherentId,
        objet: `Tour de rôle — ${MOIS_NOMS[ligne.mois - 1]} ${ligne.annee}`,
        remarques: v.remarques || ''
      });

      const recus = brut.recus.filter((r) => !(r.adherentId === ligne.adherentId
        && r.annee === ligne.annee && r.mois === ligne.mois));
      recus.push({ adherentId: ligne.adherentId, rang: ligne.rang,
        annee: ligne.annee, mois: ligne.mois,
        montant, date: v.date, moyen: v.moyen, remarques: v.remarques || '', mouvementId });
      await ecrire(ctx, { ...brut, recus });
      toast('Remise enregistrée et sortie de caisse inscrite.');
    });
  };

  const annulerRemise = (ligne) => confirmer(
    `Annuler la remise à ${nomComplet(ligne.adherent)} ?`,
    'La sortie de caisse correspondante sera retirée elle aussi. Les deux écritures restent visibles dans le journal.',
    async () => {
      if (ligne.recu?.mouvementId) {
        await ctx.enregistrer('mouvement', 'delete', { id: ligne.recu.mouvementId });
      }
      const recus = brut.recus.filter((r) => !(r.adherentId === ligne.adherentId
        && r.annee === ligne.annee && r.mois === ligne.mois));
      await ecrire(ctx, { ...brut, recus });
      toast('Remise annulée.');
    });

  const retirer = (ligne) => confirmer(
    `Retirer ${nomComplet(ligne.adherent)} du tour ?`,
    'Les tours suivants avanceront d’un mois. Ce qui lui a déjà été remis reste inscrit.',
    () => ecrire(ctx, { ...brut, ordre: brut.ordre.filter((id) => id !== ligne.adherentId) }));

  const ajouter = () => {
    const absents = actifs.filter((a) => !brut.ordre.includes(a.id));
    if (!absents.length) return toast('Tous les adhérents actifs sont déjà dans le tour.');
    formulaire('Ajouter au tour', [
      { cle: 'adherentId', libelle: 'Adhérent', type: 'select',
        options: absents.map((a) => ({ valeur: a.id, libelle: nomComplet(a) })) }
    ], (v) => {
      ecrire(ctx, { ...brut, ordre: [...brut.ordre, v.adherentId] });
      toast('Ajouté en fin de tour.');
    });
  };

  const changerDebut = () => formulaire('Mois du premier tour', [
    { cle: 'mois', libelle: 'Mois', type: 'select', valeur: String(brut.debut?.mois || 1),
      options: MOIS_NOMS.map((m, i) => ({ valeur: String(i + 1), libelle: m })) },
    { cle: 'annee', libelle: 'Année', type: 'number',
      valeur: brut.debut?.annee || new Date().getFullYear() }
  ], (v) => {
    ecrire(ctx, { ...brut, debut: { annee: +v.annee, mois: +v.mois } });
    toast('Calendrier décalé.');
  });

  const arreter = () => confirmer('Arrêter le tour de rôle ?',
    'Le calendrier disparaît de l’application, mais rien n’est effacé : les remises déjà inscrites restent dans la caisse et dans le journal. Vous pourrez le relancer plus tard.',
    () => ecrire(ctx, { ...brut, actif: false }));

  /* --- rendu ---------------------------------------------------------- */

  const lignes = calendrier.map((l) => {
    const etiquette = l.etat === 'recu'
      ? h('span', { class: 'etiquette' }, 'remis')
      : l.etat === 'a-remettre'
        ? h('span', { class: 'etiquette attente' }, 'à remettre')
        : h('span', { class: 'doux' }, 'à venir');

    return h('tr', { class: l.etat === 'a-remettre' ? 'a-remettre' : null },
      h('td', { class: 'num doux' }, l.rang + 1),
      h('td', {}, MOIS_NOMS[l.mois - 1] + ' ' + l.annee),
      h('td', {}, l.adherent ? nomComplet(l.adherent)
        : h('span', { class: 'doux' }, 'adhérent retiré')),
      h('td', { class: 'num' }, l.recu
        ? fmtNombre(l.recu.montant)
        : h('span', { class: 'doux' }, l.cagnotte ? fmtNombre(l.cagnotte) : '—')),
      h('td', {}, etiquette,
        l.recu?.date ? h('div', { class: 'doux' }, fmtDate(l.recu.date)) : null),
      admin ? h('td', { style: 'text-align:right;white-space:nowrap' },
        l.recu
          ? h('button', { onClick: () => annulerRemise(l) }, 'Annuler')
          : h('button', { class: l.etat === 'a-remettre' ? 'primaire' : '',
              onClick: () => remettre(l) }, 'Remettre'),
        ' ',
        h('button', { title: 'Monter dans l’ordre', onClick: () => deplacer(l.rang, -1) }, '↑'),
        h('button', { title: 'Descendre dans l’ordre', onClick: () => deplacer(l.rang, 1) }, '↓'),
        ' ',
        l.recu ? null : h('button', { class: 'danger', title: 'Retirer du tour',
          onClick: () => retirer(l) }, '✕')) : null);
  });

  return h('div', {},
    h('div', { class: 'barre' },
      h('h1', {}, 'Tour de rôle'),
      h('span', { class: 'doux pousse' },
        `${nbRecus} tour${nbRecus > 1 ? 's' : ''} sur ${calendrier.length}`)),

    prochain ? h('div', { class: 'carte',
      style: 'background:var(--accent-clair);border-color:transparent' },
      h('div', { style: 'font-size:.78rem;text-transform:uppercase;letter-spacing:.04em;color:var(--accent)' },
        prochain.etat === 'a-remettre' ? 'À remettre maintenant' : 'Prochain tour'),
      h('div', { style: 'font-size:1.35rem;font-weight:700;color:var(--accent);margin-top:.2rem' },
        prochain.adherent ? nomComplet(prochain.adherent) : 'adhérent retiré'),
      h('div', { class: 'doux' },
        MOIS_NOMS[prochain.mois - 1] + ' ' + prochain.annee
        + (prochain.cagnotte ? ' — ' + fmtMontant(prochain.cagnotte, dev) + ' déjà versés ce mois-là' : '')))
      : h('div', { class: 'carte' }, h('p', { class: 'vide' },
          'Le tour est complet : chacun a reçu une fois.')),

    h('div', { class: 'carte' },
      h('div', { class: 'defilable' }, h('table', { class: 'tour' },
        h('thead', {}, h('tr', {},
          h('th', { class: 'num' }, 'N°'), h('th', {}, 'Période'), h('th', {}, 'Bénéficiaire'),
          h('th', { class: 'num' }, 'Somme'), h('th', {}, 'État'),
          admin ? h('th', {}, '') : null)),
        h('tbody', {}, lignes),
        h('tfoot', {}, h('tr', { class: 'total' },
          h('td', { colspan: 3 }, 'Déjà remis'),
          h('td', { class: 'num' }, fmtMontant(totalRemis, dev)),
          h('td', { colspan: admin ? 2 : 1 }, ''))))),
      h('p', { class: 'doux', style: 'margin:.7rem 0 0' },
        'La somme affichée en gris est ce qui a été versé ce mois-là : c’est la prévision. Celle en noir est ce qui a réellement été remis, et elle est inscrite au débit de la caisse.'),
      admin ? h('div', { class: 'barre', style: 'margin-top:.8rem' },
        h('button', { onClick: ajouter }, 'Ajouter un adhérent au tour'),
        h('button', { onClick: changerDebut }, 'Changer le mois de départ'),
        h('button', { class: 'danger', onClick: arreter }, 'Arrêter le tour')) : null));
}

/* ----------------------------------------------- rappel sur le tableau --- */

/** Une ligne discrète sur le tableau de bord : à qui revient ce mois-ci. */
export function bandeauTour(ctx) {
  const { etat } = ctx;
  if (!DB.tour(etat)) return null;
  const prochain = DB.prochainTour(etat);
  if (!prochain) return null;
  const dev = etat.association.devise;
  return h('div', { class: 'carte' },
    h('div', { class: 'barre', style: 'margin:0' },
      h('div', {},
        h('div', { style: 'font-size:.78rem;text-transform:uppercase;letter-spacing:.04em;color:var(--doux)' },
          prochain.etat === 'a-remettre' ? 'Tour de rôle — à remettre' : 'Tour de rôle — prochain'),
        h('div', { style: 'font-size:1.1rem;font-weight:700;margin-top:.15rem' },
          (prochain.adherent ? nomComplet(prochain.adherent) : 'adhérent retiré')
          + ' — ' + MOIS_NOMS[prochain.mois - 1] + ' ' + prochain.annee)),
      h('span', { class: 'pousse doux' },
        prochain.cagnotte ? fmtMontant(prochain.cagnotte, dev) + ' versés ce mois-là' : '')));
}
