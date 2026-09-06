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

### Ajouter quelqu'un ensuite

Donnez-lui simplement l'adresse de l'application. Il crée son compte de la
même façon, puis attend : son écran affiche « Compte en attente ». De votre
côté, **Réglages → Comptes** le fait apparaître avec un bouton **Approuver**.
Un clic, et il a accès.

Par défaut, un nouveau compte arrive en **consultation**. Pour en faire le
second administrateur, cliquez sur **Modifier** en face de son nom et changez
le rôle.

Tant qu'un compte n'est pas approuvé, il ne voit **rien** : ni les montants,
ni les noms, ni la liste des adhérents.

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

Deux niveaux, et la frontière passe par les Réglages :

- **Adhérent approuvé** — consulte ET saisit : cotisations, prêts,
  comptabilité, fiches adhérents, rapports. Tout, sauf la gestion des comptes.
- **Administrateur** — la même chose, plus : approuver les nouveaux comptes,
  changer les rôles, modifier les informations de l'association, relier le
  dossier OneDrive.

Un adhérent ne peut donc ni s'octroyer des droits, ni approuver quelqu'un, ni
suspendre un compte. Ce refus vient de la base de données, pas de l'écran : il
tient même si quelqu'un manipule la page dans son navigateur.

### Ce que cela implique

Onze personnes pouvant saisir, c'est pratique, mais les erreurs deviennent
possibles. Deux garde-fous existent :

- **Rien n'est jamais effacé.** Chaque écriture est ajoutée au journal avec
  son auteur et son horodatage. Une valeur corrigée n'écrase pas l'ancienne,
  elle s'ajoute par-dessus — et l'historique reste consultable.
- **Le retour en arrière est immédiat.** Si un adhérent saisit de travers,
  **Réglages → Comptes → Modifier → Accès : Suspendu** lui retire tout droit
  sur-le-champ. Vous pouvez aussi le remettre en consultation seule.

Si les erreurs se multiplient, revenez à la règle d'origine : seuls les deux
administrateurs saisissent, les autres consultent.

---

## 6. Le numéro Airtel Money

Le numéro pour les cotisations — **077 99 79 57** — s'affiche en évidence sur
le tableau de bord et sur le fichier de consultation envoyé par WhatsApp,
pour que chacun l'ait sous les yeux au moment de payer.

Pour le changer : **Réglages → Association → Modifier**.

---

## 7. Partager la situation par WhatsApp

**Réglages → Créer le fichier de consultation.**

Vous obtenez une page HTML unique contenant la situation du moment. Envoyez-la
sur WhatsApp comme un document : celui qui la reçoit l'ouvre d'un clic, sans
installation, sans compte, et sans rien pouvoir modifier. Sur téléphone, le
bouton **Partager…** ouvre directement WhatsApp.

C'est la bonne solution pour les adhérents qui veulent juste voir où ils en
sont. Réservez les comptes de consultation à ceux qui ont besoin de regarder
souvent et par eux-mêmes.

---

## 8. Sans réseau

Tout continue de fonctionner : les saisies s'accumulent sur l'appareil et
partent dès que la connexion revient. La pastille en haut à droite indique
l'état — *à jour partout*, *n à envoyer*, *sur cet appareil* — et un clic
dessus force une synchronisation.

---

## 9. Sauvegardes

- `donnees/snapshot.json` dans OneDrive : photo lisible de toutes les données,
  réécrite à chaque synchronisation du PC.
- `donnees/journal/` dans OneDrive : l'historique complet. **Ne le supprimez
  jamais.**
- **Réglages → Télécharger une sauvegarde** : un fichier JSON complet.
- Supabase conserve de son côté l'intégralité du journal.
- Le classeur Excel d'origine n'est pas touché : il reste votre archive 2023.

---

## 10. Dépannage

| Situation | Que faire |
|---|---|
| La fenêtre noire se ferme aussitôt | Python n'est pas installé — Microsoft Store → Python 3 |
| « Connexion refusée » | Vérifiez l'adresse e-mail et le mot de passe. Jamais inscrit ? Cliquez sur « Première fois ici ». |
| « Compte en attente » | Normal : un administrateur doit vous approuver (Réglages → Comptes) |
| Connecté mais tout est en lecture seule | Votre compte est en consultation ; un administrateur peut changer votre rôle |
| « n à envoyer » qui persiste | Pas de réseau, ou session expirée : déconnectez-vous et reconnectez-vous |
| Le PC affiche « Base en ligne à jour » sans OneDrive | Réglages → Relier le dossier OneDrive |
| Un adhérent ne peut pas saisir | Son compte n'est pas encore approuvé, ou il a été suspendu |
| Un adhérent ne voit pas les Réglages complets | C'est voulu : la gestion des comptes est réservée aux administrateurs |

---

## 11. Un écart hérité du classeur

La feuille *Statistiques* affichait un solde final de **400 000** alors que le
total des cotisations est de **402 000** : les 2 000 FCFA de Geordi n'y
étaient pas repris. L'application part des cotisations réelles et affiche
**402 000**. Si le solde réel de la caisse diffère, inscrivez l'écart dans
l'onglet Comptabilité.
