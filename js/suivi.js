/* ============================================================================
   suivi.js — Qui n'a pas payé ce mois, et comment le lui dire.

   La question qu'un président de tontine se pose le 25 du mois n'est pas
   « combien avons-nous ? » mais « qui manque ? ». Elle n'avait pas de réponse
   dans l'application : la grille des cotisations montrait des cases vides,
   sans dire si le mois était en retard ou simplement pas encore arrivé.

   Il faut pour cela une chose que l'application ne savait pas : ce que chacun
   s'est engagé à verser. Elle vit sur la fiche de l'adhérent — les
   engagements ne sont pas égaux — avec un montant de référence pour ceux qui
   n'ont rien de particulier. Tant que personne n'a d'engagement chiffré, cet
   écran se tait : réclamer à tort abîme plus qu'il ne rapporte.
   ========================================================================== */

import * as DB from './db.js';
import { h, toast, confirmer } from './ui.js';

const { fmtMontant, fmtNombre, nomComplet, MOIS_NOMS } = DB;

/* ------------------------------------------------------------- WhatsApp --- */

/** Indicatif du Gabon. Les numéros saisis sans indicatif sont complétés. */
const INDICATIF = '241';

/**
 * Transforme « 077 99 79 57 » en « 24177997957 », la forme qu'attend wa.me.
 * Renvoie une chaîne vide si le numéro ne ressemble à rien d'exploitable :
 * mieux vaut proposer de copier le message que d'ouvrir une conversation
 * avec un inconnu.
 */
export function numeroWhatsApp(telephone) {
  let n = String(telephone || '').replace(/[^\d+]/g, '');
  if (!n) return '';
  if (n.startsWith('+')) return n.slice(1);
  if (n.startsWith('00')) return n.slice(2);
  // Numéro national gabonais : on retire le zéro de tête et on préfixe.
  if (n.startsWith('0')) n = n.slice(1);
  if (n.startsWith(INDICATIF) && n.length > 10) return n;
  if (n.length < 7) return '';
  return INDICATIF + n;
}

export function lienWhatsApp(telephone, texte) {
  const n = numeroWhatsApp(telephone);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(texte)}` : '';
}

/** « Airtel Money au 077 99 79 57, ou en espèces au trésorier » */
function ouVerser(etat) {
  const liste = DB.canaux(etat);
  if (!liste.length) return '';
  const morceaux = liste.map((c) => {
    const coord = c.type === 'especes' ? (c.detail || '') : (c.numero || c.detail || '');
    if (c.type === 'especes') return coord ? c.nom + ' (' + coord + ')' : c.nom;
    return coord ? c.nom + ' au ' + coord : c.nom;
  });
  return morceaux.join(', ou ');
}

/**
 * Le message de relance. Il est volontairement court, poli, et il dit le
 * montant exact : une relance qu'il faut décrypter ne sert à rien.
 */
export function messageRelance(etat, ligne, annee, mois) {
  const { adherent, attendu, verse, manque } = ligne;
  const periode = MOIS_NOMS[mois - 1] + ' ' + annee;
  const dev = etat.association.devise;
  const nom = adherent.prenom || nomComplet(adherent);
  const lignes = [
    `Bonjour ${nom},`,
    verse > 0
      ? `Pour ${periode}, nous avons bien reçu ${fmtMontant(verse, dev)} sur les ${fmtMontant(attendu, dev)} attendus : il reste ${fmtMontant(manque, dev)}.`
      : `Pour ${periode}, votre cotisation de ${fmtMontant(attendu, dev)} n'est pas encore enregistrée.`
  ];
  const ou = ouVerser(etat);
  if (ou) lignes.push(`Vous pouvez verser par ${ou}.`);
  lignes.push(`Merci — ${etat.association.nom}.`);
  return lignes.join('\n\n');
}

/** Le même message, pour le groupe WhatsApp de la famille. */
export function messageGroupe(etat, impayes, annee, mois) {
  const dev = etat.association.devise;
  const periode = MOIS_NOMS[mois - 1] + ' ' + annee;
  const lignes = [`${etat.association.nom} — cotisations de ${periode}`, ''];
  for (const l of impayes) {
    lignes.push(`• ${nomComplet(l.adherent)} : reste ${fmtMontant(l.manque, dev)}`
      + (l.verse > 0 ? ` (déjà versé ${fmtNombre(l.verse)})` : ''));
  }
  const total = impayes.reduce((s, l) => s + l.manque, 0);
  lignes.push('', `Total attendu : ${fmtMontant(total, dev)}.`);
  const ou = ouVerser(etat);
  if (ou) lignes.push(`Versements par ${ou}.`);
  lignes.push('Merci à chacun.');
  return lignes.join('\n');
}

async function copier(texte, message) {
  try {
    await navigator.clipboard.writeText(texte);
    toast(message || 'Message copié.');
  } catch {
    // Le presse-papiers refuse parfois hors HTTPS : on montre alors le texte
    // pour qu'il reste sélectionnable à la main.
    await confirmer('Copie impossible sur cet appareil. Le message est affiché ci-dessous.', texte);
  }
}

/* ------------------------------------------------------- carte du tableau --- */

/**
 * Le bloc « Qui n'a pas payé » du tableau de bord.
 * Le mois affiché est le mois courant si l'année choisie est l'année en
 * cours, et décembre sinon — on regarde une année passée pour la solder.
 */
export function blocImpayes(ctx) {
  const { etat, annee } = ctx;
  if (!DB.aDesEngagements(etat)) return null;

  const maintenant = new Date();
  const moisParDefaut = annee === maintenant.getFullYear() ? maintenant.getMonth() + 1 : 12;
  let mois = +localStorage.getItem('tontine:mois-suivi') || moisParDefaut;
  if (mois < 1 || mois > 12) mois = moisParDefaut;

  const carte = h('div', { class: 'carte' });

  const dessiner = () => {
    const dev = etat.association.devise;
    const lignes = DB.suiviDuMois(etat, annee, mois);
    const retard = lignes.filter((l) => l.manque > 0);
    const attendu = lignes.reduce((s, l) => s + l.attendu, 0);
    const recu = lignes.reduce((s, l) => s + Math.min(l.verse, l.attendu || l.verse), 0);
    const manquant = retard.reduce((s, l) => s + l.manque, 0);

    const selecteurMois = h('select', {
      style: 'width:auto',
      onChange: (e) => { mois = +e.target.value; localStorage.setItem('tontine:mois-suivi', mois); dessiner(); }
    }, MOIS_NOMS.map((m, i) => h('option', { value: i + 1, selected: i + 1 === mois }, m)));

    const proportion = attendu ? Math.min(100, Math.round((recu / attendu) * 100)) : 0;

    carte.replaceChildren(
      h('div', { class: 'barre' },
        h('h2', { style: 'margin:0' }, 'Cotisations du mois'),
        selecteurMois,
        h('span', { class: 'doux pousse' },
          attendu ? `${fmtNombre(recu)} reçus sur ${fmtMontant(attendu, dev)}` : '')),

      attendu ? h('div', { class: 'jauge', title: proportion + ' %' },
        h('div', { class: 'jauge-plein', style: `width:${proportion}%` })) : null,

      retard.length === 0
        ? h('p', { class: 'vide', style: 'padding:1.2rem' },
            'Tout le monde est à jour pour ' + MOIS_NOMS[mois - 1] + ' ' + annee + '.')
        : h('div', {},
            h('p', { class: 'doux', style: 'margin:.6rem 0' },
              `${retard.length} adhérent${retard.length > 1 ? 's' : ''} à relancer — ${fmtMontant(manquant, dev)} manquants.`),
            h('div', { class: 'defilable' }, h('table', { class: 'impayes' },
              h('thead', {}, h('tr', {},
                h('th', {}, 'Adhérent'), h('th', { class: 'num' }, 'Attendu'),
                h('th', { class: 'num' }, 'Versé'), h('th', { class: 'num' }, 'Manque'),
                h('th', {}, ''))),
              h('tbody', {}, retard.map((l) => {
                const texte = messageRelance(etat, l, annee, mois);
                const lien = lienWhatsApp(l.adherent.telephone, texte);
                return h('tr', {},
                  h('td', {}, nomComplet(l.adherent), ' ',
                    l.statut === 'partiel'
                      ? h('span', { class: 'etiquette attente' }, 'partiel') : null),
                  h('td', { class: 'num doux' }, fmtNombre(l.attendu)),
                  h('td', { class: 'num' }, l.verse ? fmtNombre(l.verse) : '—'),
                  h('td', { class: 'num', style: 'font-weight:650' }, fmtNombre(l.manque)),
                  h('td', { style: 'text-align:right;white-space:nowrap' },
                    lien
                      ? h('a', { class: 'bouton', href: lien, target: '_blank', rel: 'noopener' }, 'Relancer')
                      : h('button', { onClick: () => copier(texte, 'Message de relance copié.') },
                          'Copier le message'),
                    !lien ? null : ' ',
                    !lien ? null : h('button', {
                      title: 'Copier le texte sans ouvrir WhatsApp',
                      onClick: () => copier(texte, 'Message de relance copié.') }, '⧉')));
              })))),
            h('div', { class: 'barre', style: 'margin-top:.8rem' },
              h('button', {
                onClick: () => copier(messageGroupe(etat, retard, annee, mois),
                  'Récapitulatif copié — collez-le dans le groupe WhatsApp.')
              }, 'Copier le récapitulatif pour le groupe'))),

      h('p', { class: 'doux', style: 'margin-bottom:0' },
        'Les montants attendus viennent de la fiche de chaque adhérent. Réglages → Association fixe celui qui s’applique par défaut.'));
  };

  dessiner();
  return carte;
}
