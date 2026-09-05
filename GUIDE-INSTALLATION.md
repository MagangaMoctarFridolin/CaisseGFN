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

## 2. Mise en place de la base en ligne (une seule fois)

### 2.1 Créer le projet

1. **supabase.com** → *Start your project* → connexion avec **GitHub**
2. *New project* : nom `caisse-gfn`, mot de passe de base généré et **noté**,
   région **Central EU (Frankfurt)** ou **West EU (London)**
3. Attendre la fin de la création (1 à 2 minutes)

### 2.2 Créer les tables et les règles de sécurité

1. Menu **SQL Editor** → *New query*
2. Coller tout le contenu du fichier **`supabase.sql`** fourni
3. **Run**

Ce script crée le journal des écritures, la table des comptes, et surtout les
règles : *tout compte connecté peut lire, seuls les administrateurs peuvent
écrire*. Ces règles sont appliquées par le serveur.

### 2.3 Créer les comptes

Menu **Authentication → Users → Add user → Create new user**. Pour chaque
personne : son adresse e-mail, un mot de passe, et cochez **Auto Confirm
User**.

Créez d'abord le vôtre, puis exécutez ceci dans le **SQL Editor** en
remplaçant l'adresse — sans cette étape, personne n'est administrateur et
plus rien ne peut être saisi :

```sql
insert into public.profils (id, nom, role)
select id, 'Fridolin', 'admin' from auth.users where email = 'votre@adresse.com'
on conflict (id) do update set role = 'admin', nom = excluded.nom;
```

Les comptes créés ensuite apparaissent automatiquement en **consultation**
dans l'onglet Réglages de l'application, où vous pouvez passer le second
administrateur en un clic.

### 2.4 Relier l'application à la base

Dans Supabase, **Project Settings → API**, relevez :

- **Project URL** — `https://xxxxx.supabase.co`
- **anon public** — la clé publique

Reportez-les dans **`config.js`** :

```js
supabase: {
  url: 'https://xxxxx.supabase.co',
  anonKey: 'eyJhbGci...'
}
```

Ces deux valeurs sont conçues pour être publiques : ce sont les règles du
§ 2.2 qui protègent les données, pas leur secret. **N'inscrivez jamais ici la
clé `service_role`** — celle-là contourne toutes les règles.

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
  comptabilité, gère les comptes.
- **Adhérent** — ouvre l'application en lecture seule.

Ce que « lecture seule » veut dire ici, et c'est important : le refus vient de
la base de données, pas de l'application. Un adhérent qui modifierait la page
dans son navigateur pour faire réapparaître les boutons se verrait quand même
opposer un refus par le serveur. C'est une vraie barrière, pas un simple
masquage.

---

## 6. Partager la situation par WhatsApp

**Réglages → Créer le fichier de consultation.**

Vous obtenez une page HTML unique contenant la situation du moment. Envoyez-la
sur WhatsApp comme un document : celui qui la reçoit l'ouvre d'un clic, sans
installation, sans compte, et sans rien pouvoir modifier. Sur téléphone, le
bouton **Partager…** ouvre directement WhatsApp.

C'est la bonne solution pour les adhérents qui veulent juste voir où ils en
sont. Réservez les comptes de consultation à ceux qui ont besoin de regarder
souvent et par eux-mêmes.

---

## 7. Sans réseau

Tout continue de fonctionner : les saisies s'accumulent sur l'appareil et
partent dès que la connexion revient. La pastille en haut à droite indique
l'état — *à jour partout*, *n à envoyer*, *sur cet appareil* — et un clic
dessus force une synchronisation.

---

## 8. Sauvegardes

- `donnees/snapshot.json` dans OneDrive : photo lisible de toutes les données,
  réécrite à chaque synchronisation du PC.
- `donnees/journal/` dans OneDrive : l'historique complet. **Ne le supprimez
  jamais.**
- **Réglages → Télécharger une sauvegarde** : un fichier JSON complet.
- Supabase conserve de son côté l'intégralité du journal.
- Le classeur Excel d'origine n'est pas touché : il reste votre archive 2023.

---

## 9. Dépannage

| Situation | Que faire |
|---|---|
| La fenêtre noire se ferme aussitôt | Python n'est pas installé — Microsoft Store → Python 3 |
| « Connexion refusée » | Vérifiez l'adresse e-mail ; le compte existe-t-il dans Supabase → Authentication → Users ? |
| Connecté mais tout est en lecture seule | Le profil administrateur n'a pas été créé — voir § 2.3 |
| « n à envoyer » qui persiste | Pas de réseau, ou session expirée : déconnectez-vous et reconnectez-vous |
| Le PC affiche « Base en ligne à jour » sans OneDrive | Réglages → Relier le dossier OneDrive |
| Un adhérent veut modifier | C'est voulu : il lui faut un compte administrateur |

---

## 10. Un écart hérité du classeur

La feuille *Statistiques* affichait un solde final de **400 000** alors que le
total des cotisations est de **402 000** : les 2 000 FCFA de Geordi n'y
étaient pas repris. L'application part des cotisations réelles et affiche
**402 000**. Si le solde réel de la caisse diffère, inscrivez l'écart dans
l'onglet Comptabilité.
