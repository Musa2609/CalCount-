-- Recipes and recipe ingredients
create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  servings integer not null default 1 check (servings > 0),
  serving_weight_g numeric(7, 2) check (serving_weight_g is null or serving_weight_g > 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  food_id uuid references public.foods (id) on delete set null,
  custom_food_id uuid references public.custom_foods (id) on delete set null,
  food_name text not null,
  brand text,
  quantity_grams numeric(7, 2) not null check (quantity_grams > 0),
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
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- RLS
alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;

drop policy if exists "recipes_owner_all" on public.recipes;
create policy "recipes_owner_all" on public.recipes
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "recipe_ingredients_owner_all" on public.recipe_ingredients;
create policy "recipe_ingredients_owner_all" on public.recipe_ingredients
  for all
  using (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_id and r.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_id and r.user_id = auth.uid()
    )
  );

-- Indexes
create index if not exists recipes_user_idx on public.recipes (user_id);
create index if not exists recipe_ingredients_recipe_idx on public.recipe_ingredients (recipe_id);

-- updated_at trigger
create trigger set_recipes_updated_at before update on public.recipes
  for each row execute function public.set_updated_at();