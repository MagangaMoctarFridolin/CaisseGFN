# Application Tontine — La Grande Famille Nielili

Guide d'installation et d'utilisation. Gardez ce document à portée de main
la première fois ; ensuite vous n'en aurez plus besoin.

---

## 1. Ce que contient le dossier

```
Tontine-App/
├── Lancer-la-Tontine.bat      ← à double-cliquer sur le PC
├── index.html, app.css, js/   ← l'application
├── config.js                  ← seul fichier à modifier (pour le téléphone)
└── donnees/
    ├── snapshot.json          ← copie lisible de toutes les données
    └── journal/               ← LA BASE : l'historique des écritures
        └── ev-reprise-excel.jsonl   ← vos 402 000 FCFA repris du classeur
```

**Ne supprimez jamais le dossier `journal/`.** C'est la base de données.
`snapshot.json` n'est qu'une copie de secours, reconstruite automatiquement.

---

## 2. Installation sur le PC

1. Placez le dossier `Tontine-App` **dans votre OneDrive**, par exemple dans
   `OneDrive › cours de transit › Documents › Nielili` (là où se trouve déjà le classeur).
2. Double-cliquez sur **`Lancer-la-Tontine.bat`**.
   Une fenêtre noire s'ouvre — c'est normal, laissez-la ouverte — puis
   l'application apparaît dans Edge.
   *Si un message dit qu'aucun moteur n'a été trouvé* : installez **Python 3**
   depuis le Microsoft Store (gratuit), puis relancez le fichier.
3. Dans Edge, cliquez sur l'icône **⊕ Installer** dans la barre d'adresse
   (ou menu ⋯ › Applications › Installer ce site en tant qu'application).
   L'application se met alors dans le menu Démarrer et s'ouvre dans sa
   propre fenêtre, comme un vrai logiciel.
4. Au premier lancement, l'application vous demande de créer le
   **compte du premier administrateur**. Choisissez un identifiant et un code
   d'accès, et notez-les.
5. Allez dans **Réglages › Base de données sur OneDrive › Choisir le dossier
   OneDrive (PC)** et désignez le dossier `Tontine-App`.
   À partir de là, chaque saisie est écrite dans ce dossier, et c'est
   OneDrive qui la synchronise vers le nuage.

> Vous devez refaire l'étape 5 une seule fois par PC. L'autorisation est
> mémorisée pour les fois suivantes.

---

## 3. Les comptes

Deux administrateurs au maximum, autant de comptes adhérents que vous voulez.

- **Administrateur** — saisit les cotisations, les prêts, la comptabilité,
  gère les comptes.
- **Adhérent** — ouvre l'application en **lecture seule**. Aucun bouton de
  modification ne lui est proposé.

Pour créer le second administrateur ou des comptes adhérents :
**Réglages › Comptes › + Administrateur / + Compte adhérent**.

### Ce que le code d'accès protège vraiment

Le code d'accès contrôle ce que l'écran autorise. Il empêche une saisie par
erreur ; il n'empêche pas quelqu'un qui possède déjà le fichier de données de
le lire par un autre moyen.

**La vraie barrière est du côté de OneDrive.** Ne donnez le droit de
modification sur le dossier `Tontine-App` qu'aux deux administrateurs. Un
adhérent à qui vous partagez le dossier en *lecture seule* — ou à qui vous
envoyez simplement le fichier de consultation (section 4) — ne peut rien
modifier, quoi qu'il fasse.

---

## 4. Partager la situation avec les adhérents (WhatsApp)

C'est le plus simple, et c'est fait pour ça :

**Réglages › Partager avec les adhérents › Créer le fichier de consultation**

Vous obtenez un fichier `.html` unique contenant la situation du moment.
Envoyez-le sur WhatsApp comme n'importe quel document. Celui qui le reçoit
l'ouvre d'un clic : pas d'installation, pas de compte Microsoft, et rien
n'est modifiable. Refaites-en un quand vous voulez communiquer une situation
à jour.

Sur téléphone, le bouton **Partager…** ouvre directement le menu de partage
d'Android ou d'iOS, WhatsApp compris.

---

## 5. Le téléphone

### Option A — consultation seule (immédiat, rien à installer)

Envoyez le fichier de consultation, comme en section 4. C'est ce qui convient
à la quasi-totalité des adhérents.

### Option B — application complète sur le téléphone d'un administrateur

Là, le téléphone doit atteindre OneDrive tout seul, ce qui demande deux
préparations, à faire une fois.

**B.1 — Mettre l'application en ligne**

Le téléphone ne peut pas lire un dossier du PC. L'application doit être servie
depuis une adresse `https://`. Le plus simple et gratuit : GitHub Pages, Netlify
Drop, ou tout hébergement que vous avez déjà. Déposez-y le contenu du dossier
`Tontine-App` — sauf le dossier `donnees/`, qui reste sur OneDrive.

**B.2 — Autoriser l'application auprès de Microsoft**

1. Allez sur **portal.azure.com**, connectez-vous avec
   *m.m_fridolin@outlook.com*.
2. Cherchez **Inscriptions d'applications** › **Nouvelle inscription**.
3. Nom : `Tontine GFN`.
   Types de comptes pris en charge : **Comptes Microsoft personnels uniquement**.
   URI de redirection : choisissez **Application monopage (SPA)** et saisissez
   l'adresse exacte de votre application, par exemple
   `https://mon-compte.github.io/tontine/`.
4. Validez. Sur la page qui s'affiche, copiez **ID d'application (client)**.
5. Ouvrez `config.js` et collez cette valeur :

   ```js
   clientId: '00000000-0000-0000-0000-000000000000',
   cheminOneDrive: 'cours de transit/Documents/Nielili/Tontine-App'
   ```

   (`cheminOneDrive` doit correspondre exactement à l'emplacement du dossier
   tel qu'il apparaît sur onedrive.com.)
6. Republiez le fichier `config.js` modifié.

**B.3 — Sur le téléphone**

Ouvrez l'adresse dans Chrome ou Safari, puis « Ajouter à l'écran d'accueil ».
Dans l'application : **Réglages › Se connecter à OneDrive**, et connectez-vous
avec le compte Microsoft. C'est terminé.

---

## 6. Comment la synchronisation fonctionne

Chaque appareil écrit **uniquement dans son propre fichier journal**
(`ev-pc-xxxx.jsonl`, `ev-tel-xxxx.jsonl`…) et lit ceux des autres.

Conséquence : deux appareils ne modifient jamais le même fichier, donc
OneDrive n'a **jamais** de conflit à arbitrer et ne crée pas de « copie en
conflit ». Si les deux administrateurs corrigent la même cotisation en même
temps, c'est la saisie la plus récente qui l'emporte, et l'autre reste visible
dans l'historique.

Si vous saisissez sans réseau, tout est conservé sur l'appareil et envoyé dès
que la connexion revient. La pastille en haut à droite indique l'état ;
cliquez dessus pour forcer une synchronisation.

---

## 7. Sauvegardes

- `donnees/snapshot.json` est réécrit à chaque synchronisation : c'est une
  photo lisible de toutes les données.
- **Réglages › Télécharger une sauvegarde** produit un fichier JSON complet.
- Le classeur Excel d'origine n'est pas touché : il reste votre archive de 2023.

---

## 8. Petits dépannages

| Situation | Que faire |
|---|---|
| La fenêtre noire se ferme aussitôt | Python n'est pas installé — Microsoft Store › Python 3 |
| « Sur cet appareil » reste affiché | Réglages › Choisir le dossier OneDrive (PC) |
| « Synchro à refaire » | Cliquez sur la pastille ; vérifiez la connexion |
| Un adhérent veut modifier | C'est voulu : il faut un compte administrateur |
| Repartir de zéro sur un appareil | Videz les données du site dans Edge, puis relancez |

---

## 9. Un écart à corriger, hérité du classeur

La feuille *Statistiques* du classeur affichait un solde final de **400 000**
alors que le total des cotisations est de **402 000** : les 2 000 FCFA de
Geordi n'y étaient pas repris. L'application, elle, part des cotisations
réelles et affiche **402 000**. Si le solde réel de la caisse diffère,
inscrivez la différence dans l'onglet Comptabilité.
