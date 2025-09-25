-- Types
create type if not exists user_role as enum ('staff','admin');
create type if not exists report_status as enum ('Complete','Pending','In-Progress');

-- Tables
create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique not null, -- maps to auth.users.id
  email text unique not null,
  name text not null,
  designation text,
  department text,
  role user_role not null default 'staff',
  created_at timestamptz default now()
);

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  work_date date not null,
  task_description text not null,
  start_time timestamptz not null,
  end_time timestamptz not null,
  status report_status not null default 'Pending',
  work_for_party text,
  related_department text,
  assigned_by text,
  remarks text,
  created_at timestamptz default now()
);

create table if not exists departments (
  name text primary key
);
insert into departments(name) values
  ('HR'),('Accounts'),('Engineering'),('Production'),
  ('Sales'),('Marketing'),('Export'),('Purchase')
  on conflict do nothing;

-- Helpful view is NOT required anymore (we'll compute duration in app)

-- RLS + Policies
alter table profiles enable row level security;
alter table reports enable row level security;
alter table departments enable row level security;

-- anyone can read departments to populate dropdowns
create policy if not exists departments_read on departments for select using (true);

-- admin helper
create or replace function is_admin() returns boolean language plpgsql stable as $$
begin
  return exists (
    select 1 from profiles p where p.auth_user_id = auth.uid() and p.role = 'admin'
  );
end;
$$;

-- profiles policies
create policy if not exists profiles_self_read on profiles for select
  using (auth.uid() = auth_user_id or is_admin());
create policy if not exists profiles_admin_write on profiles for all
  using (is_admin()) with check (is_admin());

-- reports policies
-- staff can read their own, admin can read all
create policy if not exists reports_read on reports for select
  using (
    exists (select 1 from profiles p where p.id = reports.user_id and p.auth_user_id = auth.uid())
    or is_admin()
  );
-- staff can insert for themselves
create policy if not exists reports_insert on reports for insert
  with check (
    exists (select 1 from profiles p where p.id = reports.user_id and p.auth_user_id = auth.uid())
  );
-- staff can update their own; admin can update all
create policy if not exists reports_update on reports for update
  using (
    exists (select 1 from profiles p where p.id = reports.user_id and p.auth_user_id = auth.uid())
    or is_admin()
  )
  with check (
    exists (select 1 from profiles p where p.id = reports.user_id and p.auth_user_id = auth.uid())
    or is_admin()
  );

-- Trigger to auto-create a profile row when a new auth user is created
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (auth_user_id, email, name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)))
  on conflict (auth_user_id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute procedure handle_new_user();
