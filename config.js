/* ============================================================================
   config.js — Le seul fichier à modifier après l'installation.
   ========================================================================== */

export const CONFIG = {
  graph: {
    /* Identifiant d'application Microsoft (Application (client) ID).
       Nécessaire UNIQUEMENT pour que le téléphone atteigne OneDrive.
       Sur le PC, l'application écrit directement dans le dossier synchronisé
       et n'a pas besoin de cette valeur.
       Voir GUIDE-INSTALLATION.md, section « Relier le téléphone à OneDrive ». */
    clientId: '',

    /* Emplacement du dossier de l'application dans votre OneDrive,
       tel qu'il apparaît sur onedrive.com. */
    cheminOneDrive: 'cours de transit/Documents/Nielili/Tontine-App'
  }
};
