drop table if exists payments cascade;
drop table if exists feed_logs cascade;
drop table if exists sales cascade;
drop table if exists entries cascade;
drop table if exists cycles cascade;
drop table if exists parties cascade;
drop table if exists ponds cascade;
drop table if exists categories cascade;
drop table if exists team cascade;
drop table if exists vehicles cascade;
drop table if exists users cascade;
drop table if exists farms cascade;

create table farms (
  id text primary key,
  name text not null,
  owner_name text not null,
  village text not null default '',
  phone text,
  area_unit text not null default 'acres',
  weight_unit text not null default 'kg',
  language text not null default 'en',
  daily boolean not null default true,
  daily_time text not null default '19:00',
  dues boolean not null default true,
  lease boolean not null default true,
  updated_at timestamptz not null default now()
);

create table users (
  id text primary key,
  username text not null unique,
  password_hash text not null,
  farm_id text not null references farms(id) on delete cascade
);

create table ponds (
  farm_id text not null references farms(id) on delete cascade,
  id text not null,
  name text not null,
  code text,
  species text not null default '',
  species_ids text[] not null default '{}',
  other_species text,
  area_acres numeric not null default 0,
  depth_ft numeric,
  water_type text not null default 'brackish',
  water_source text,
  aerators integer not null default 0,
  hdpe_lined boolean not null default false,
  leased boolean not null default false,
  lease_amount_year numeric,
  lease_end_date date,
  notes text,
  status text not null default 'idle',
  cycle_day integer,
  cycle_length integer,
  cycle_number integer,
  last_cycle_number integer,
  last_cycle_profit numeric,
  primary key (farm_id, id)
);

create table parties (
  farm_id text not null references farms(id) on delete cascade,
  id text not null,
  name text not null,
  kind text not null,
  phone text,
  place text,
  primary key (farm_id, id)
);

create table entries (
  farm_id text not null references farms(id) on delete cascade,
  id text not null,
  title text not null,
  subtitle text not null default '',
  amount numeric not null,
  kind text not null,
  category text not null,
  date date not null,
  pond_id text not null,
  cycle_id text,
  party_id text,
  payment text not null,
  note text,
  cycle_label text,
  time text,
  item text,
  qty numeric,
  unit text,
  rate numeric,
  mode text,
  added_by text,
  photo_url text,
  due_date date,
  paid_date date,
  settled_amount numeric,
  primary key (farm_id, id)
);

create table sales (
  farm_id text not null references farms(id) on delete cascade,
  id text not null,
  pond_id text not null,
  cycle_id text not null,
  date date not null,
  buyer text not null,
  qty_kg numeric not null,
  count_size text not null default '',
  rate_per_kg numeric not null,
  net_amount numeric not null,
  received_amount numeric not null default 0,
  opening_received numeric,
  due_date date,
  primary key (farm_id, id)
);

create table payments (
  farm_id text not null references farms(id) on delete cascade,
  id text not null,
  party_id text not null,
  date date not null,
  amount numeric not null,
  mode text not null,
  note text,
  entry_ids text[] not null default '{}',
  primary key (farm_id, id)
);

create table cycles (
  farm_id text not null references farms(id) on delete cascade,
  id text not null,
  pond_id text not null,
  number integer not null,
  species text not null default '',
  status text not null,
  start_date date not null,
  end_date date,
  expected_days integer not null,
  recorded_profit numeric,
  feed_vendor_id text,
  feed_brand text,
  feed_size text,
  feed_bag_weight numeric,
  feed_price_per_bag numeric,
  feed_payment text,
  primary key (farm_id, id)
);

create table feed_logs (
  farm_id text not null references farms(id) on delete cascade,
  id text not null,
  pond_id text not null,
  cycle_id text not null,
  date date not null,
  meals integer not null,
  kg numeric not null,
  cost numeric not null,
  primary key (farm_id, id)
);

create table categories (
  farm_id text not null references farms(id) on delete cascade,
  id text not null,
  name text not null,
  icon text not null,
  tint text not null,
  grp text not null,
  locked boolean not null default false,
  enabled boolean not null default true,
  sort integer not null default 0,
  primary key (farm_id, id)
);

create table team (
  farm_id text not null references farms(id) on delete cascade,
  id text not null,
  name text not null,
  phone text not null default '',
  role text not null,
  primary key (farm_id, id)
);

create table vehicles (
  farm_id text not null references farms(id) on delete cascade,
  id text not null,
  name text not null,
  number text not null default '',
  primary key (farm_id, id)
);

create index entries_farm_date_idx on entries (farm_id, date desc);
create index entries_farm_pond_idx on entries (farm_id, pond_id);
create index payments_farm_party_idx on payments (farm_id, party_id);
create index ponds_farm_idx on ponds (farm_id);
