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

## 6. Le bureau : qui est qui

Dans **Réglages → Bureau de l'association**, vous nommez le président, le
trésorier, le secrétaire et le commissaire aux comptes. Une fonction, un nom ;
nommer quelqu'un libère automatiquement celui qui occupait la place.

**C'est un titre, pas un droit** — et la distinction compte. Nommer quelqu'un
trésorier ne lui donne pas le droit de saisir : ça se règle séparément, dans
**Réglages → Comptes → Modifier → Rôle**. Les deux sont volontairement
distincts, parce que la base de données ne sait appliquer que deux niveaux,
administrateur ou consultation. Un droit « trésorier » qu'elle n'appliquerait
pas serait du décor : il rassurerait sans protéger.

La conséquence pratique est utile : votre commissaire aux comptes peut porter
son titre tout en restant en consultation, et une personne sans adresse e-mail
— donc sans compte — peut parfaitement figurer au bureau.

Une fois le bureau nommé, la fonction s'affiche en face du nom dans l'onglet
Adhérents, la fiche individuelle imprimée se termine par *« Signature du
trésorier : Untel »* au lieu d'une ligne vide, le rapport annuel porte les
cases de signature de chacun, et le fichier envoyé par WhatsApp rappelle en
bas qui occupe quelle fonction.

---

## 7. Les moyens de versement

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
vide quand le moyen n'est pas connu. La légende sous le tableau rappelle les
couleurs.

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

## 8. « J'ai versé » — les déclarations des adhérents

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

## 9. Qui n'a pas payé ce mois

C'est la question qu'on se pose le 25 du mois. Pour que l'application sache y
répondre, il lui faut une chose qu'elle n'avait pas : **ce que chacun s'est
engagé à verser.**

Deux endroits, selon les cas :

- **Adhérents → Modifier → Cotisation mensuelle** : le montant propre à cette
  personne. C'est ce qu'il faut renseigner ici, où les engagements vont de
  2 000 à 50 000 FCFA.
- **Réglages → Association → Cotisation mensuelle de référence** : le montant
  qui s'applique à ceux qui n'ont rien de particulier. Un astérisque dans la
  colonne « attendu / mois » signale que le montant vient de là.

Tant que personne n'a d'engagement chiffré, l'application se tait : elle ne
réclame rien à personne. Dès qu'un montant existe, le **tableau de bord**
affiche la carte « Cotisations du mois » :

- la jauge : ce qui est rentré sur ce qui est attendu ;
- la liste de ceux à relancer, avec ce qui manque à chacun ;
- un bouton **Relancer** par personne. Il ouvre WhatsApp sur sa conversation,
  message déjà écrit : son nom, le mois, le montant manquant, et par où verser.
  Vous relisez, vous envoyez. Rien ne part sans vous.
- **Copier le récapitulatif pour le groupe** : la même chose en une liste, à
  coller dans le groupe WhatsApp de la famille.

Sans numéro de téléphone sur la fiche, le bouton devient « Copier le message » :
l'application n'ouvre pas une conversation avec un numéro qu'elle n'a pas.

Le sélecteur de mois, en haut de la carte, permet de revenir sur un mois passé.

---

## 10. Le tour de rôle

L'autre façon de faire tourner une tontine : tout le monde verse, et la totalité
du mois revient à une seule personne, différente à chaque tour, jusqu'à ce que
chacun ait reçu une fois.

Les deux régimes coexistent dans l'application. La caisse d'épargne et de prêts
continue de fonctionner comme avant ; le tour s'y ajoute.

**Onglet Tour de rôle → Mettre en place le tour de rôle.** Deux choses à dire :
l'ordre convenu entre vous, et le mois du premier tour. Le calendrier se
déduit — un mois par personne, dans l'ordre. Les flèches ↑ ↓ ajustent l'ordre,
et « Changer le mois de départ » décale tout le monde d'un coup.

Quand vous remettez la somme à celui dont c'est le tour : **Remettre**. Vous
indiquez la somme réellement remise et la date. L'application inscrit alors
**deux choses** : la remise dans le calendrier, et une sortie de caisse au
débit. Sans cette seconde écriture, le solde affiché mentirait dès le premier
tour.

La colonne « Somme » se lit ainsi : en gris, ce qui a été versé ce mois-là,
c'est-à-dire la prévision ; en noir, ce qui a réellement été remis.

**Annuler** retire les deux écritures. Rien n'est perdu pour autant : le journal
en garde la trace, comme de tout le reste.

---

## 11. Les prêts : échéancier et engagement

Dans le formulaire d'un prêt, un champ compte plus que les autres : **le nombre
de mensualités**. Laissez 0 si le prêt se rembourse en une fois — l'application
s'en tiendra alors à la date limite.

Avec un nombre de mensualités, le bouton **Échéancier** ouvre le détail :
chaque versement attendu, sa date, ce qui le couvre, et son état (réglée, en
retard, à venir). L'échéancier n'est pas stocké : il se recalcule à partir du
montant, de la date d'octroi et du nombre de mensualités, puis se confronte à ce
qui a réellement été remboursé. Corriger le prêt corrige l'échéancier.

### Les intérêts

Deux champs dans le formulaire du prêt : **Intérêts** et **Taux (%)**.

- *Une fois, sur le capital* — 10 % sur 20 000 : l'emprunteur rend 22 000.
- *Par mois, sur la durée convenue* — 5 % par mois sur quatre mensualités :
  20 000 × 5 % × 4 = 4 000 d'intérêts, donc 24 000 à rendre.
- *Sans intérêt* — le cas par défaut, celui de vos prêts actuels.

C'est le **total dû** qui se découpe en mensualités, et c'est lui qui s'affiche
en « reste dû ».

Un point que je n'ai volontairement pas fait : **un retard n'augmente pas les
intérêts tout seul.** Une somme qui gonfle pendant que personne ne regarde est
une source de querelle, pas de justice. Si le bureau décide d'une pénalité, il
la décide, et vous l'inscrivez en mouvement.

Deux chiffres à ne pas confondre, et que l'application sépare :

- **ce que doit l'adhérent** — capital et intérêts, c'est la colonne « reste dû » ;
- **ce qui manque en caisse** — le capital sorti moins tout ce qui est rentré.
  Les intérêts n'y comptent que lorsqu'ils sont réellement encaissés.

C'est pour cela que le solde de la caisse ne monte pas le jour où vous accordez
un prêt à 10 % : il monte le jour où l'argent revient.

Le bouton **Rembourser** propose d'emblée le montant de la prochaine échéance
due. Vous le modifiez si la personne a versé autre chose.

En bas de l'écran, **Engagement par adhérent** répond à la question « qui doit
combien » : le total emprunté, le total remboursé, le reste dû, et le signal
« en retard » le cas échéant. Dans la liste des adhérents, une étiquette
« doit … » rappelle ce que chacun a encore sur le dos.

---

## 12. La clôture de l'exercice

**Rapports → Clôture de l'exercice → Établir le partage.**

C'est le document de la soirée de décembre. Il ne décide rien : il pose le
calcul, ligne par ligne, avant que vous ne l'annonciez.

**Deux règles de partage**, à choisir selon votre règlement :

- *Apports rendus + part du résultat* — chacun récupère ce qu'il a versé dans
  l'année, augmenté de sa part du bénéfice. La caisse repart à zéro. C'est le
  partage le plus courant.
- *Résultat seul* — les apports restent en caisse, on ne distribue que le
  bénéfice.

**Ce que le document pose :**

1. *Le compte de l'exercice* — les apports, les intérêts encaissés sur les
   prêts, les autres entrées, les charges. La différence est le **résultat à
   partager**.
2. *Ce qui n'entre pas dans le partage* — les sommes déjà remises au titre du
   tour de rôle (elles sont déjà revenues à leurs bénéficiaires) et le capital
   encore dehors en prêts non remboursés. **Cet argent n'est pas en caisse : il
   ne peut pas être distribué.**
3. *Ce que reçoit chacun* — ses apports, sa part du résultat au prorata de ces
   apports, moins ce qu'il doit encore. On ne rend pas 50 000 à quelqu'un qui
   en doit 30 000 pour les lui redemander le lendemain.
4. *Le contrôle de caisse* — le seul chiffre qui empêche une soirée de mal
   finir : le disponible en caisse, face au total annoncé aux adhérents. Si la
   caisse ne couvre pas, l'application le dit en rouge et explique pourquoi,
   le plus souvent parce que des prêts ne sont pas rentrés.
5. *Les signatures du bureau.*

Le document se recalcule à chaque ouverture. **Rien n'est figé tant que vous
n'inscrivez pas les versements.**

Le bouton **Inscrire les versements de partage**, en bas, crée une sortie de
caisse par personne. À ne faire qu'**une fois l'argent réellement remis**.
Ces écritures passent par le journal comme les autres : elles laissent une
trace, et elles s'annulent depuis la Comptabilité si vous vous êtes trompé.

Un adhérent qui doit plus qu'il ne reçoit apparaît en rouge, avec le montant
qui lui reste à devoir.

---

## 13. Le reçu de versement

Un adhérent qui verse par Airtel Money reçoit un SMS de l'opérateur, pas de la
tontine. Le reçu comble ce trou.

**Rapports → Reçu de versement → le nom de l'adhérent.** Ses versements de
l'année s'affichent ; pour chacun, trois boutons : **Afficher** (à l'écran, puis
Imprimer / PDF), **Télécharger** (une page HTML autonome) et **Partager…** (qui
ouvre WhatsApp sur téléphone).

Le numéro du reçu — par exemple `2026-GFN003-09` — désigne l'adhérent et le
mois, pas un compteur. Deux appareils qui éditent le reçu du même versement
écrivent donc le même numéro, même sans réseau, et un reçu réédité six mois plus
tard porte exactement le même.

---

## 14. Le journal des écritures

**Onglet Journal.** Chaque saisie faite dans l'application y ajoute une ligne, et
aucune ligne n'est jamais réécrite : corriger un montant n'efface pas l'ancien,
cela ajoute une correction au-dessus.

On y lit qui a inscrit quoi, quand, et depuis quel appareil. Les filtres —
période, type d'écriture, recherche par nom — servent à retrouver une écriture
précise. **Exporter le journal (CSV)** en sort une copie pour Excel.

C'est la mémoire de la caisse, celle qu'on ouvre le jour où deux personnes ne se
souviennent pas de la même chose. Les adhérents en consultation y ont accès
aussi : c'est le principe même de la transparence — ils ne peuvent rien y
écrire, mais ils peuvent tout y lire.

---

## 15. Partager la situation par WhatsApp

**Réglages → Créer le fichier de consultation.**

Vous obtenez une page HTML unique contenant la situation du moment. Envoyez-la
sur WhatsApp comme un document : celui qui la reçoit l'ouvre d'un clic, sans
installation, sans compte, et sans rien pouvoir modifier. Sur téléphone, le
bouton **Partager…** ouvre directement WhatsApp.

C'est la bonne solution pour les adhérents qui veulent juste voir où ils en
sont. Réservez les comptes de consultation à ceux qui ont besoin de regarder
souvent et par eux-mêmes.

---

## 16. Réseau faible ou absent

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

## 17. Sauvegardes

- `donnees/snapshot.json` dans OneDrive : photo lisible de toutes les données,
  réécrite à chaque synchronisation du PC.
- `donnees/journal/` dans OneDrive : l'historique complet. **Ne le supprimez
  jamais.**
- **Réglages → Télécharger une sauvegarde** : un fichier JSON complet.
- Supabase conserve de son côté l'intégralité du journal.
- Le classeur Excel d'origine n'est pas touché : il reste l'archive des exercices
  antérieurs, que l'application ne reprend pas (voir la section 19).

---

## 18. Dépannage

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
| Une cotisation n'a pas de moyen (cercle vide) | Le moyen n'a pas été précisé à la saisie ; cliquez sur la pastille pour le renseigner |
| Le mauvais moyen a été enregistré | Cliquez sur la pastille de la case et corrigez-le dans le détail |
| Une déclaration n'apparaît pas chez le trésorier | Elle a été retirée par son auteur, ou le tableau de bord n'a pas encore été rouvert |
| L'adhérent n'a pas le bouton « Déclarer » | Son compte n'est pas encore approuvé, ou l'application tourne sans base en ligne |
| Nommé trésorier mais il ne peut rien saisir | C'est voulu : le titre ne donne pas le droit. Réglages → Comptes → Modifier → Rôle → Administrateur |
| « Signature du trésorier : ______ » sur la fiche | Aucun trésorier n'est nommé : Réglages → Bureau de l'association |

---

## 19. Et l'historique des années passées ?

**Décision prise : il n'est pas repris dans l'application.**

Le classeur Excel reste l'archive des exercices antérieurs. Il ne bouge plus,
il ne risque rien, et il répond à qui voudra savoir ce qui s'est passé avant.

Ce que cela veut dire concrètement :

- l'application part de l'exercice en cours, à zéro ;
- le « cumul des apports » d'un adhérent ne compte que ce qui a été saisi ici ;
- la clôture ne porte que sur les exercices suivis dans l'application.

Si le solde réel de la caisse ne part pas de zéro — parce qu'il reste de
l'argent des années précédentes — inscrivez-le **une fois** en Comptabilité :
*+ Mouvement*, nature *Autre*, en crédit, objet « Report des exercices
antérieurs ». Le solde affiché correspondra alors à la caisse réelle, sans
qu'il ait fallu réécrire trois ans d'histoire.

Le fichier de reprise reste dans le dossier `donnees/journal/` : rien ne
presse, et rien n'empêche de l'importer plus tard si vous changez d'avis.
