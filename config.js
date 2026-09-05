/* ============================================================================
   config.js — Le seul fichier à modifier après l'installation.
   ========================================================================== */

export const CONFIG = {

  /* --- Base partagée en ligne (téléphone + PC) ---------------------------
     Les deux valeurs se trouvent dans Supabase, menu
     Project Settings → API. Elles sont faites pour être publiques : ce sont
     les règles de sécurité définies dans supabase.sql qui protègent les
     données, pas le secret de ces valeurs.
     N'inscrivez JAMAIS ici la clé « service_role ».                        */
  supabase: {
    url: 'https://dcxjtgibedlbtjtvkvdk.supabase.co',
    anonKey: 'sb_publishable_gpTHLz8QjUEFh44JUhwCow_Nu8CYutR'
  },

  /* --- OneDrive par l'API Microsoft (facultatif) -------------------------
     Demande une inscription d'application Microsoft, qui n'est pas
     disponible dans tous les pays. Laissez vide si vous ne l'utilisez pas :
     sur le PC, l'application écrit de toute façon directement dans le
     dossier OneDrive synchronisé, sans avoir besoin de ceci.               */
  graph: {
    clientId: '',
    cheminOneDrive: 'cours de transit/Documents/Nielili/Tontine-App'
  }
};
