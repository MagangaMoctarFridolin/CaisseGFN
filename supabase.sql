-- ===========================================================================
--  Caisse GFN — schéma de la base partagée
--
--  À coller dans Supabase : menu « SQL Editor » → New query → Run.
--  À n'exécuter qu'une seule fois.
--
--  Ce que ce fichier met en place :
--    • une table d'événements : l'historique de toutes les écritures ;
--    • une table de profils : qui est administrateur, qui est adhérent ;
--    • des règles (RLS) appliquées PAR LE SERVEUR : tout utilisateur connecté
--      peut lire, seuls les administrateurs peuvent écrire. Un adhérent ne
--      peut donc rien modifier, même en manipulant la page dans son
--      navigateur — le refus vient de la base, pas de l'application.
-- ===========================================================================

-- ---------------------------------------------------------------- profils --

create table if not exists public.profils (
  id          uuid primary key references auth.users (id) on delete cascade,
  nom         text not null,
  role        text not null default 'adherent' check (role in ('admin', 'adherent')),
  adherent_id text,                      -- fiche adhérent associée, si connue
  cree_le     timestamptz not null default now()
);

comment on table public.profils is
  'Un profil par utilisateur connecté. Le rôle décide du droit d''écriture.';

-- Fonction utilitaire : l'utilisateur courant est-il administrateur ?
-- SECURITY DEFINER pour éviter une récursion des règles sur profils.
create or replace function public.est_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profils
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ------------------------------------------------------------ evenements --

create table if not exists public.evenements (
  id        text primary key,            -- identifiant produit par l'appareil
  ts        timestamptz not null,        -- horodatage de la saisie
  appareil  text not null,               -- nom lisible de l'appareil
  type      text not null check (type in ('upsert', 'delete')),
  entite    text not null check (entite in
              ('association', 'adherent', 'cotisation', 'pret', 'mouvement', 'compte')),
  donnees   jsonb not null,
  auteur    uuid default auth.uid() references auth.users (id),
  recu_le   timestamptz not null default now()
);

comment on table public.evenements is
  'Journal des écritures. Rien n''est jamais modifié ni supprimé : ' ||
  'l''état courant se reconstruit en rejouant ces lignes.';

create index if not exists evenements_ts_idx     on public.evenements (ts);
create index if not exists evenements_recu_idx   on public.evenements (recu_le);
create index if not exists evenements_entite_idx on public.evenements (entite);

-- ------------------------------------------------------- règles d'accès --

alter table public.profils    enable row level security;
alter table public.evenements enable row level security;

-- Profils : chacun voit la liste (pour afficher « saisi par … »),
-- seul un administrateur peut la modifier.
drop policy if exists profils_lecture on public.profils;
create policy profils_lecture on public.profils
  for select to authenticated using (true);

drop policy if exists profils_ecriture on public.profils;
create policy profils_ecriture on public.profils
  for all to authenticated
  using (public.est_admin()) with check (public.est_admin());

-- Événements : tout utilisateur connecté lit ; seul un administrateur ajoute.
drop policy if exists evenements_lecture on public.evenements;
create policy evenements_lecture on public.evenements
  for select to authenticated using (true);

drop policy if exists evenements_ajout on public.evenements;
create policy evenements_ajout on public.evenements
  for insert to authenticated with check (public.est_admin());

-- Aucune politique UPDATE ni DELETE : le journal est en écriture seule.
-- Personne, pas même un administrateur, ne peut réécrire l'histoire depuis
-- l'application. Une correction se fait en ajoutant un nouvel événement.

-- --------------------------------------------- création du premier profil --
--
--  Après avoir créé vos utilisateurs dans Authentication → Users, revenez
--  ici et exécutez ces deux lignes en remplaçant les adresses e-mail.
--  La toute première doit être un administrateur, sinon plus personne ne
--  pourra écrire.
--
--  insert into public.profils (id, nom, role)
--  select id, 'Fridolin', 'admin' from auth.users where email = 'vous@exemple.com'
--  on conflict (id) do update set role = 'admin', nom = excluded.nom;
--
--  insert into public.profils (id, nom, role)
--  select id, 'Adiza', 'adherent' from auth.users where email = 'adiza@exemple.com'
--  on conflict (id) do update set role = 'adherent', nom = excluded.nom;
