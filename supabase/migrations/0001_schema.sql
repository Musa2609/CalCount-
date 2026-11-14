-- CalCount core schema
-- Run with: supabase db push (or apply in the Supabase SQL editor in order).

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Profiles: one row per authenticated user
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  email text,
  age integer check (age is null or (age between 13 and 100)),
  gender text check (gender is null or gender in ('male', 'female', 'other')),
  height_cm numeric(5, 2) check (height_cm is null or (height_cm between 100 and 250)),
  current_weight_kg numeric(5, 2) check (current_weight_kg is null or (current_weight_kg between 30 and 300)),
  target_weight_kg numeric(5, 2) check (target_weight_kg is null or (target_weight_kg between 30 and 300)),
  activity_level text not null default 'moderate'
    check (activity_level in ('sedentary', 'light', 'moderate', 'active', 'very_active')),
  goal text not null default 'maintain'
    check (goal in ('lose', 'maintain', 'gain', 'muscle')),
  unit_system text not null default 'metric'
    check (unit_system in ('metric', 'imperial')),
  calorie_target integer not null default 2000
    check (calorie_target between 800 and 10000),
  protein_target_g integer not null default 120
    check (protein_target_g between 0 and 1000),
  carbs_target_g integer not null default 250
    check (carbs_target_g between 0 and 1000),
  fat_target_g integer not null default 65
    check (fat_target_g between 0 and 1000),
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Shared food catalogue. user_id is null for public reference foods.
-- ---------------------------------------------------------------------------
create table if not exists public.foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  name text not null,
  brand text,
  category text not null default 'Other',
  description text,
  serving_name text not null default '1 serving',
  serving_grams numeric(7, 2) not null default 100 check (serving_grams > 0),
  calories_per_100g numeric(7, 2) not null check (calories_per_100g >= 0),
  protein_per_100g numeric(6, 2) not null default 0 check (protein_per_100g >= 0),
  carbs_per_100g numeric(6, 2) not null default 0 check (carbs_per_100g >= 0),
  fat_per_100g numeric(6, 2) not null default 0 check (fat_per_100g >= 0),
  fiber_per_100g numeric(6, 2) check (fiber_per_100g is null or fiber_per_100g >= 0),
  sugar_per_100g numeric(6, 2) check (sugar_per_100g is null or sugar_per_100g >= 0),
  sodium_per_100g numeric(8, 2) check (sodium_per_100g is null or sodium_per_100g >= 0),
  source text not null default 'Unspecified',
  source_url text,
  data_quality text not null default 'estimated'
    check (data_quality in ('sourced', 'estimated', 'user', 'openfoodfacts')),
  cuisine text check (cuisine is null or cuisine in ('indian', 'international', 'packaged')),
  barcode text,
  image_url text,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint foods_public_or_owned check (is_public or user_id is not null)
);

create table if not exists public.food_servings (
  id uuid primary key default gen_random_uuid(),
  food_id uuid not null references public.foods (id) on delete cascade,
  label text not null,
  grams numeric(7, 2) not null check (grams > 0),
  is_default boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- User-created foods
-- ---------------------------------------------------------------------------
create table if not exists public.custom_foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  brand text,
  category text not null default 'My foods',
  description text,
  serving_name text not null default '1 serving',
  serving_grams numeric(7, 2) not null default 100 check (serving_grams > 0),
  calories_per_100g numeric(7, 2) not null check (calories_per_100g >= 0),
  protein_per_100g numeric(6, 2) not null default 0 check (protein_per_100g >= 0),
  carbs_per_100g numeric(6, 2) not null default 0 check (carbs_per_100g >= 0),
  fat_per_100g numeric(6, 2) not null default 0 check (fat_per_100g >= 0),
  fiber_per_100g numeric(6, 2) check (fiber_per_100g is null or fiber_per_100g >= 0),
  sugar_per_100g numeric(6, 2) check (sugar_per_100g is null or sugar_per_100g >= 0),
  sodium_per_100g numeric(8, 2) check (sodium_per_100g is null or sodium_per_100g >= 0),
  source text not null default 'User entered',
  data_quality text not null default 'user'
    check (data_quality in ('sourced', 'estimated', 'user', 'openfoodfacts')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Meals: one container per user / day / meal_type
-- ---------------------------------------------------------------------------
create table if not exists public.meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  log_date date not null,
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'snacks')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, log_date, meal_type)
);

-- ---------------------------------------------------------------------------
-- Food logs keep an immutable-ish nutrient snapshot so historical totals do
-- not change if a shared food is later edited.
-- ---------------------------------------------------------------------------
create table if not exists public.food_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  meal_id uuid not null references public.meals (id) on delete cascade,
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'snacks')),
  log_date date not null,
  food_id uuid references public.foods (id) on delete set null,
  custom_food_id uuid references public.custom_foods (id) on delete set null,
  food_name text not null,
  brand text,
  quantity_grams numeric(7, 2) not null check (quantity_grams > 0 and quantity_grams <= 5000),
  serving_label text,
  serving_grams numeric(7, 2) check (serving_grams is null or serving_grams > 0),
  calories_per_100g numeric(7, 2) not null check (calories_per_100g >= 0),
  protein_per_100g numeric(6, 2) not null default 0 check (protein_per_100g >= 0),
  carbs_per_100g numeric(6, 2) not null default 0 check (carbs_per_100g >= 0),
  fat_per_100g numeric(6, 2) not null default 0 check (fat_per_100g >= 0),
  fiber_per_100g numeric(6, 2) not null default 0 check (fiber_per_100g >= 0),
  sugar_per_100g numeric(6, 2) not null default 0 check (sugar_per_100g >= 0),
  sodium_per_100g numeric(8, 2) not null default 0 check (sodium_per_100g >= 0),
  source text not null default 'Unspecified',
  data_quality text not null default 'estimated'
    check (data_quality in ('sourced', 'estimated', 'user', 'openfoodfacts')),
  image_url text,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

-- ---------------------------------------------------------------------------
-- Saved meals / templates
-- ---------------------------------------------------------------------------
create table if not exists public.saved_meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'snacks')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.saved_meal_items (
  id uuid primary key default gen_random_uuid(),
  saved_meal_id uuid not null references public.saved_meals (id) on delete cascade,
  food_id uuid references public.foods (id) on delete set null,
  custom_food_id uuid references public.custom_foods (id) on delete set null,
  food_name text not null,
  brand text,
  quantity_grams numeric(7, 2) not null check (quantity_grams > 0),
  serving_label text,
  serving_grams numeric(7, 2) check (serving_grams is null or serving_grams > 0),
  calories_per_100g numeric(7, 2) not null,
  protein_per_100g numeric(6, 2) not null default 0,
  carbs_per_100g numeric(6, 2) not null default 0,
  fat_per_100g numeric(6, 2) not null default 0,
  fiber_per_100g numeric(6, 2) not null default 0,
  sugar_per_100g numeric(6, 2) not null default 0,
  sodium_per_100g numeric(8, 2) not null default 0,
  source text not null default 'Unspecified',
  data_quality text not null default 'estimated'
    check (data_quality in ('sourced', 'estimated', 'user', 'openfoodfacts')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Weight and goals
-- ---------------------------------------------------------------------------
create table if not exists public.weight_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  log_date date not null,
  weight_kg numeric(5, 2) not null check (weight_kg between 30 and 300),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, log_date)
);

create table if not exists public.daily_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  effective_date date not null,
  calorie_target integer not null check (calorie_target between 800 and 10000),
  protein_target_g integer not null check (protein_target_g between 0 and 1000),
  carbs_target_g integer not null check (carbs_target_g between 0 and 1000),
  fat_target_g integer not null check (fat_target_g between 0 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, effective_date)
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index if not exists foods_name_trgm_idx on public.foods using gin (name gin_trgm_ops);
create index if not exists foods_category_idx on public.foods (category);
create index if not exists foods_barcode_idx on public.foods (barcode) where barcode is not null;
create index if not exists foods_public_idx on public.foods (is_public) where is_public;
create index if not exists foods_user_idx on public.foods (user_id) where user_id is not null;
create index if not exists food_servings_food_idx on public.food_servings (food_id);
create index if not exists custom_foods_user_idx on public.custom_foods (user_id);
create index if not exists custom_foods_name_trgm_idx on public.custom_foods using gin (name gin_trgm_ops);
create index if not exists meals_user_date_idx on public.meals (user_id, log_date);
create index if not exists food_logs_user_date_idx on public.food_logs (user_id, log_date);
create index if not exists food_logs_meal_idx on public.food_logs (meal_id);
create index if not exists food_logs_food_idx on public.food_logs (food_id);
create index if not exists food_logs_user_created_idx on public.food_logs (user_id, created_at desc);
create index if not exists saved_meals_user_idx on public.saved_meals (user_id);
create index if not exists saved_meal_items_meal_idx on public.saved_meal_items (saved_meal_id);
create index if not exists weight_logs_user_date_idx on public.weight_logs (user_id, log_date desc);
create index if not exists daily_goals_user_date_idx on public.daily_goals (user_id, effective_date desc);

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles', 'foods', 'custom_foods', 'meals', 'food_logs',
    'saved_meals', 'weight_logs', 'daily_goals'
  ]
  loop
    execute format(
      'drop trigger if exists set_%1$s_updated_at on public.%1$s',
      table_name
    );
    execute format(
      'create trigger set_%1$s_updated_at before update on public.%1$s
       for each row execute function public.set_updated_at()',
      table_name
    );
  end loop;
end;
$$;

-- Base grants. Row Level Security still scopes every row.
grant usage on schema public to anon, authenticated;
grant select on public.foods, public.food_servings to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
