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

-- ===========================================================================
--  Inscription depuis l'application (ajoute apres coup)
--
--  Plus besoin de creer les comptes dans le tableau de bord : chacun s'inscrit
--  depuis l'ecran de connexion. Le TOUT PREMIER compte devient administrateur
--  et a acces immediatement ; les suivants arrivent "en attente" et ne voient
--  rien tant qu'un administrateur ne les a pas approuves d'un clic.
-- ===========================================================================

alter table public.profils add column if not exists valide boolean not null default false;

create or replace function public.est_valide()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profils where id = auth.uid() and valide);
$$;

create or replace function public.est_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profils where id = auth.uid() and role = 'admin' and valide);
$$;

create or replace function public.nouveau_profil()
returns trigger language plpgsql security definer set search_path = public as $$
declare premier boolean;
begin
  select count(*) = 0 into premier from public.profils;
  insert into public.profils (id, nom, role, valide)
  values (new.id,
          coalesce(nullif(new.raw_user_meta_data->>'nom',''), split_part(new.email, '@', 1)),
          case when premier then 'admin' else 'adherent' end,
          premier)
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists creer_profil on auth.users;
create trigger creer_profil after insert on auth.users
  for each row execute function public.nouveau_profil();

drop policy if exists profils_lecture on public.profils;
create policy profils_lecture on public.profils for select to authenticated
  using (id = auth.uid() or public.est_valide());

drop policy if exists evenements_lecture on public.evenements;
create policy evenements_lecture on public.evenements for select to authenticated
  using (public.est_valide());

-- ===========================================================================
--  Qui écrit, qui consulte
--
--  Seuls les ADMINISTRATEURS saisissent. Un adhérent approuvé consulte,
--  imprime et exporte — il n'écrit rien, et le refus vient de la base, pas
--  de l'écran.
-- ===========================================================================

drop policy if exists evenements_ajout on public.evenements;
create policy evenements_ajout on public.evenements for insert to authenticated
  with check (public.est_admin());

drop policy if exists profils_ecriture on public.profils;
create policy profils_ecriture on public.profils for all to authenticated
  using (public.est_admin()) with check (public.est_admin());

-- ===========================================================================
--  Code d'accès de l'association
--
--  L'adhérent s'inscrit seul et entre immédiatement s'il connaît le code.
--  Le code est vérifié PAR LE SERVEUR : la table qui le contient n'a aucune
--  politique RLS, donc aucun client ne peut la lire ni l'écrire. Seules les
--  fonctions ci-dessous, en SECURITY DEFINER, y accèdent.
-- ===========================================================================

create table if not exists public.parametres (
  cle    text primary key,
  valeur text not null,
  maj_le timestamptz not null default now()
);
alter table public.parametres enable row level security;

create or replace function public.rejoindre(code text)
returns boolean language plpgsql security definer set search_path = public as $$
declare attendu text;
begin
  if auth.uid() is null then return false; end if;
  select valeur into attendu from public.parametres where cle = 'code_adhesion';
  if attendu is null or btrim(attendu) = '' then return false; end if;
  if code is null or lower(btrim(code)) <> lower(btrim(attendu)) then return false; end if;
  update public.profils set valide = true where id = auth.uid();
  return true;
end; $$;

create or replace function public.lire_code_adhesion()
returns text language plpgsql security definer set search_path = public as $$
begin
  if not public.est_admin() then raise exception 'reserve aux administrateurs'; end if;
  return (select valeur from public.parametres where cle = 'code_adhesion');
end; $$;

create or replace function public.definir_code_adhesion(nouveau text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.est_admin() then raise exception 'reserve aux administrateurs'; end if;
  insert into public.parametres (cle, valeur, maj_le)
    values ('code_adhesion', btrim(nouveau), now())
  on conflict (cle) do update set valeur = excluded.valeur, maj_le = now();
end; $$;

revoke all on function public.rejoindre(text) from public, anon;
revoke all on function public.lire_code_adhesion() from public, anon;
revoke all on function public.definir_code_adhesion(text) from public, anon;
grant execute on function public.rejoindre(text) to authenticated;
grant execute on function public.lire_code_adhesion() to authenticated;
grant execute on function public.definir_code_adhesion(text) to authenticated;
