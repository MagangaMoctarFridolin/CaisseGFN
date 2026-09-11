# Caisse GFN — Application de gestion de la tontine

*La Grande Famille Nielili*

Guide d'installation et d'utilisation. Gardez-le sous la main la première
fois ; ensuite vous n'en aurez plus besoin.

---

## 1. Comment tout s'articule

Trois endroits, chacun avec son rôle :

| Où | Rôle |
|---|---|
| **Supabase** (base en ligne) | Le canal entre les appareils. C'est lui qui décide qui a le droit d'écrire. |
| **OneDrive** (dossier sur le PC) | La copie complète et lisible : sauvegarde et archive. |
| **Chaque appareil** | Un cache local, pour continuer à travailler sans réseau. |

Une saisie faite sur le PC part vers Supabase, d'où le téléphone la reçoit ;
le PC en dépose en même temps une copie dans OneDrive. Une saisie faite sur
le téléphone part vers Supabase, et le PC la recopiera dans OneDrive à sa
prochaine ouverture.

Rien n'est jamais écrasé : chaque modification est un **événement** ajouté à
un journal. L'état courant se reconstruit en rejouant ces événements. Deux
personnes qui corrigent la même cotisation au même moment ne se détruisent
pas mutuellement : la saisie la plus récente s'affiche, l'autre reste dans
l'historique.

---

## 2. Créer votre compte

**Tout se fait depuis l'application. Vous n'avez plus rien à faire dans le
tableau de bord Supabase.**

1. Ouvrez **https://magangamoctarfridolin.github.io/CaisseGFN/**
2. Cliquez sur **« Première fois ici — créer mon compte »**
3. Saisissez votre nom, votre adresse e-mail et un mot de passe
   (six caractères minimum)
4. **Créer mon compte**

Le tout premier compte créé devient **administrateur** et a accès
immédiatement. C'est donc à vous de le créer en premier.

### Le code d'accès de l'association

C'est ce qui permet aux adhérents de s'inscrire **sans que vous ayez à
intervenir**.

Dans **Réglages → Code d'accès de l'association**, définissez un code — par
exemple `GFN2026` — et communiquez-le aux adhérents sur WhatsApp. À
l'inscription, celui qui le saisit entre immédiatement, en consultation.

Le code est vérifié par le serveur, pas par la page : il n'est écrit nulle
part dans l'application, et personne ne peut le lire depuis son navigateur.
Vous pouvez le changer quand vous voulez — les comptes déjà créés ne sont pas
affectés.

Quelqu'un qui s'inscrit **sans** le code, ou avec un mauvais code, reste en
attente et ne voit rien. Il apparaît alors dans **Réglages → Comptes** avec un
bouton **Approuver** : les deux voies coexistent.

---

## 3. Le PC

1. Placez le dossier `Tontine-App` **dans votre OneDrive**
   (`OneDrive › cours de transit › Documents › Nielili`).
2. Double-cliquez sur **`Lancer-la-Tontine.bat`**. Une fenêtre noire s'ouvre —
   laissez-la ouverte — puis l'application apparaît dans Edge.
   *Si un message dit qu'aucun moteur n'a été trouvé* : installez **Python 3**
   depuis le Microsoft Store (gratuit) et relancez.
3. Dans Edge, cliquez sur **⊕ Installer** dans la barre d'adresse. L'application
   rejoint le menu Démarrer et s'ouvre dans sa propre fenêtre.
4. Connectez-vous avec votre adresse e-mail et votre mot de passe.
5. **Réglages → Relier le dossier OneDrive (PC)** et désignez `Tontine-App`.
   À faire une seule fois par PC : c'est ce qui active la sauvegarde OneDrive.

---

## 4. Le téléphone

Ouvrez **https://magangamoctarfridolin.github.io/CaisseGFN/** dans Chrome ou
Safari, puis « Ajouter à l'écran d'accueil ». Connectez-vous avec votre
adresse e-mail. C'est tout : pas de compte Microsoft, pas d'installation.

Le téléphone lit et écrit dans la base en ligne. Il ne touche pas directement
à OneDrive — c'est le PC qui y recopie tout.

---

## 5. Les comptes

- **Administrateur** (deux) — saisit les cotisations, les prêts, la
  comptabilité, gère les adhérents et les comptes. En pratique : vous, qui
  tenez l'outil, et le trésorier, qui vérifie les encaissements et valide les
  versements déclarés. Le trésorier crée son compte comme tout le monde, puis
  vous lui donnez le rôle *administrateur* dans **Réglages → Comptes →
  Modifier**.
- **Adhérent approuvé** — consulte, **imprime et exporte** : tableau de bord,
  cotisations, prêts, comptabilité, rapport annuel, fiche individuelle, export
  CSV pour Excel, et le fichier de consultation à partager. Il ne saisit rien.

Ce que « consultation » veut dire ici, et c'est le point important : le refus
vient de la base de données, pas de l'application. Un adhérent qui modifierait
la page dans son navigateur pour faire réapparaître les champs de saisie se
verrait quand même opposer un refus par le serveur. C'est une vraie barrière,
pas un simple masquage.

Un adhérent ne peut pas davantage se promouvoir administrateur, approuver
quelqu'un, ni suspendre un compte.

### Ce que vous pouvez faire sur chaque compte

Dans **Réglages → Comptes**, en face de chaque nom :

| Bouton | Effet |
|---|---|
| **Approuver** | Donne l'accès à quelqu'un qui s'est inscrit sans le code. |
| **Bloquer** | Retire l'accès sans effacer le compte. La personne voit *« Accès suspendu »* et plus aucun montant. Le code d'accès ne la fait pas rentrer : vous seul pouvez rouvrir. |
| **Débloquer** | Rend l'accès à un compte bloqué. |
| **Modifier** | Change le nom affiché, le rôle (consultation ↔ administrateur) et la fiche adhérent associée. |
| **Supprimer** | Efface définitivement le compte et son mot de passe. Les saisies déjà faites restent dans l'historique. |

Deux protections sont posées dans la base elle-même, pas seulement à l'écran :
vous ne pouvez pas supprimer **votre propre compte**, ni le **dernier
administrateur** — sans quoi plus personne ne pourrait rien saisir.

Un compte bloqué ou supprimé perd la main dans la minute et demie qui suit,
même si l'application était déjà ouverte sur son téléphone.

Pour faire de quelqu'un le second administrateur : **Modifier**, puis changez
le rôle.

---

## 6. Les moyens de versement

Deux canaux sont en place au départ :

| Moyen | Ce qui s'affiche aux adhérents |
|---|---|
| **Airtel Money** | 077 99 79 57 |
| **Espèces** | Remises au trésorier |

Ils apparaissent en évidence sur le tableau de bord et sur le fichier envoyé
par WhatsApp, pour que chacun les ait sous les yeux au moment de payer.

Pour en ajouter un (Moov Money, un virement bancaire…), en changer le numéro
ou en retirer un devenu inutile : **Réglages → Moyens de versement**. Un moyen
mis en « ancien moyen » disparaît de la liste proposée à la saisie, mais les
cotisations déjà enregistrées avec lui gardent leur trace.

### Noter par où chaque cotisation est arrivée

Dans l'onglet **Cotisations**, un sélecteur **« Moyen : … »** est posé en haut
de la grille. Tout ce que vous tapez ensuite est enregistré avec ce moyen-là —
vous n'avez donc rien à redire tant que vous saisissez une série de versements
Airtel.

Dès qu'un montant est inscrit, une **petite pastille de couleur** apparaît dans
le coin de la case : verte pour Airtel Money, bleue pour les espèces, un cercle
vide quand le moyen n'est pas connu (c'est le cas des données reprises du
classeur de 2023). La légende sous le tableau rappelle les couleurs.

Un clic sur cette pastille ouvre le **détail du versement** — montant, moyen,
référence de la transaction, date. C'est là qu'on note qu'untel a payé en
espèces ce mois-ci alors qu'il passe d'habitude par Airtel, ou qu'on conserve
le numéro de transaction Airtel pour pouvoir le retrouver plus tard. Un montant
mis à zéro efface le versement.

### Vérifier la caisse

Le **rapport annuel** (Rapports → Rapport annuel) comporte une section
*Répartition par moyen de versement* : tant d'entrées et tant de francs par
canal, avec la part de chacun. L'**export CSV** va plus loin — il ajoute, après
le tableau habituel, la liste de tous les versements de l'année avec leur date,
leur moyen et leur référence. C'est ce qu'il faut pour rapprocher le relevé
Airtel du cahier de caisse. Le fichier de consultation WhatsApp reprend lui
aussi la répartition.

---

## 7. « J'ai versé » — les déclarations des adhérents

L'application **n'encaisse pas d'argent**. Elle ne demande pas un montant et un
numéro pour envoyer un code de validation sur le téléphone : ce serait un
prélèvement Airtel Money, qui suppose un compte marchand et un contrat. Ici,
l'adhérent paie comme avant — Airtel Money, ou de la main à la main — puis il
**déclare** ce qu'il a versé.

**Côté adhérent**, sur son téléphone, en haut du tableau de bord : un bouton
**Déclarer un versement**. Il indique le montant, le mois, le moyen, son numéro
de téléphone et la référence de la transaction Airtel. C'est envoyé, et il voit
sa déclaration passer « en attente ». Tant qu'elle n'est pas traitée, il peut la
retirer s'il s'est trompé.

**Côté administrateur** — vous, et le trésorier dès qu'il aura son compte — la
déclaration apparaît en haut du tableau de bord, avec le nombre de
déclarations « à traiter » :

- **Valider** — vous vérifiez sur votre relevé Airtel que l'argent est bien
  arrivé, vous reliez la déclaration à la fiche de l'adhérent, et vous validez.
  C'est **cette validation** qui écrit la cotisation. Si un montant existe déjà
  pour ce mois, l'application vous propose le total des deux.
- **Refuser** — avec un motif, que l'adhérent verra sur son téléphone.

Le point qui compte : **une déclaration n'est pas une écriture**. Rien n'entre
dans les comptes tant que vous n'avez pas validé, et un adhérent qui tenterait
de valider sa propre déclaration en manipulant la page se verrait refuser par la
base de données. Ce que dit l'adhérent et ce que dit la caisse restent deux
choses séparées.

Ce que cela vous fait gagner : plus de « j'ai envoyé 15 000 mardi, tu as vu ? »
sur WhatsApp. La référence de la transaction arrive avec le montant, vous
rapprochez du relevé, vous validez.

---

## 8. Partager la situation par WhatsApp

**Réglages → Créer le fichier de consultation.**

Vous obtenez une page HTML unique contenant la situation du moment. Envoyez-la
sur WhatsApp comme un document : celui qui la reçoit l'ouvre d'un clic, sans
installation, sans compte, et sans rien pouvoir modifier. Sur téléphone, le
bouton **Partager…** ouvre directement WhatsApp.

C'est la bonne solution pour les adhérents qui veulent juste voir où ils en
sont. Réservez les comptes de consultation à ceux qui ont besoin de regarder
souvent et par eux-mêmes.

---

## 9. Réseau faible ou absent

Tout continue de fonctionner. Les saisies s'accumulent sur l'appareil et
partent dès que la connexion revient. La pastille en haut à droite dit où
l'on en est :

| Pastille | Ce que cela veut dire |
|---|---|
| **À jour partout** | Tout est parti, rien n'attend. |
| **Hors ligne** | L'appareil n'a plus de réseau. Rien n'est perdu. |
| **n à envoyer** | Le réseau est là mais le serveur n'a pas encore tout reçu. |
| **Synchro à refaire** | Un envoi a échoué ; un clic sur la pastille réessaie. |

Un clic sur la pastille force une synchronisation.

Trois précautions sont prises pour les connexions capricieuses. Une requête
qui reste sans réponse est **abandonnée au bout de vingt secondes** au lieu de
laisser l'application figée sur « Synchronisation… ». Une coupure brève
déclenche une **seconde tentative automatique**, mais un refus du serveur n'est
jamais rejoué — il n'y a rien à en attendre. Et surtout, **une coupure de
réseau ne vous déconnecte pas** : seule une vraie expiration de session vous
renvoie à l'écran de connexion.

Rien n'est jamais perdu pendant une coupure : la saisie est d'abord écrite sur
l'appareil, et ce n'est qu'ensuite qu'elle part. Si le téléphone s'éteint avant
le retour du réseau, elle est toujours là à la réouverture.

---

## 10. Sauvegardes

- `donnees/snapshot.json` dans OneDrive : photo lisible de toutes les données,
  réécrite à chaque synchronisation du PC.
- `donnees/journal/` dans OneDrive : l'historique complet. **Ne le supprimez
  jamais.**
- **Réglages → Télécharger une sauvegarde** : un fichier JSON complet.
- Supabase conserve de son côté l'intégralité du journal.
- Le classeur Excel d'origine n'est pas touché : il reste votre archive 2023.

---

## 11. Dépannage

| Situation | Que faire |
|---|---|
| La fenêtre noire se ferme aussitôt | Python n'est pas installé — Microsoft Store → Python 3 |
| « Connexion refusée » | Vérifiez l'adresse e-mail et le mot de passe. Jamais inscrit ? Cliquez sur « Première fois ici ». |
| « Compte en attente » | Normal : saisissez le code d'accès, ou attendez qu'un administrateur vous approuve |
| « Accès suspendu » | Un administrateur a bloqué ce compte. Lui seul peut le débloquer (Réglages → Comptes → Débloquer). |
| « Ce compte n'existe plus » | Le compte a été supprimé. Il faut en recréer un depuis « Première fois ici ». |
| Connecté mais tout est en lecture seule | Votre compte est en consultation ; un administrateur peut changer votre rôle |
| « Hors ligne » | Normal : l'appareil n'a pas de réseau. Tout repartira seul. |
| « n à envoyer » qui persiste malgré le réseau | Cliquez sur la pastille ; si cela persiste, déconnectez-vous et reconnectez-vous |
| Le PC affiche « Base en ligne à jour » sans OneDrive | Réglages → Relier le dossier OneDrive |
| Un adhérent ne peut pas saisir | C'est voulu : la saisie est réservée aux administrateurs |
| Un adhérent ne voit pas les Réglages complets | C'est voulu : la gestion des comptes est réservée aux administrateurs |
| Une cotisation n'a pas de moyen (cercle vide) | Normal pour les données reprises du classeur ; cliquez sur la pastille pour le renseigner |
| Le mauvais moyen a été enregistré | Cliquez sur la pastille de la case et corrigez-le dans le détail |
| Une déclaration n'apparaît pas chez le trésorier | Elle a été retirée par son auteur, ou le tableau de bord n'a pas encore été rouvert |
| L'adhérent n'a pas le bouton « Déclarer » | Son compte n'est pas encore approuvé, ou l'application tourne sans base en ligne |

---

## 12. Un écart hérité du classeur

La feuille *Statistiques* affichait un solde final de **400 000** alors que le
total des cotisations est de **402 000** : les 2 000 FCFA de Geordi n'y
étaient pas repris. L'application part des cotisations réelles et affiche
**402 000**. Si le solde réel de la caisse diffère, inscrivez l'écart dans
l'onglet Comptabilité.
