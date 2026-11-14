-- Row Level Security
-- Public food catalogue is readable by everyone; all personal records are
-- restricted to their authenticated owner.

alter table public.profiles enable row level security;
alter table public.foods enable row level security;
alter table public.food_servings enable row level security;
alter table public.custom_foods enable row level security;
alter table public.meals enable row level security;
alter table public.food_logs enable row level security;
alter table public.saved_meals enable row level security;
alter table public.saved_meal_items enable row level security;
alter table public.weight_logs enable row level security;
alter table public.daily_goals enable row level security;

-- Profiles ------------------------------------------------------------------
drop policy if exists "profiles_owner_all" on public.profiles;
create policy "profiles_owner_all" on public.profiles
  for all
  using (id = auth.uid())
  with check (id = auth.uid());

-- Shared foods --------------------------------------------------------------
drop policy if exists "foods_read_visible" on public.foods;
create policy "foods_read_visible" on public.foods
  for select
  using (is_public or user_id = auth.uid());

drop policy if exists "foods_owner_insert" on public.foods;
create policy "foods_owner_insert" on public.foods
  for insert
  with check (user_id = auth.uid() and is_public = false);

drop policy if exists "foods_owner_update" on public.foods;
create policy "foods_owner_update" on public.foods
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and is_public = false);

drop policy if exists "foods_owner_delete" on public.foods;
create policy "foods_owner_delete" on public.foods
  for delete
  using (user_id = auth.uid());

-- Servings follow their parent food ----------------------------------------
drop policy if exists "food_servings_read_visible" on public.food_servings;
create policy "food_servings_read_visible" on public.food_servings
  for select
  using (
    exists (
      select 1 from public.foods f
      where f.id = food_id and (f.is_public or f.user_id = auth.uid())
    )
  );

drop policy if exists "food_servings_owner_write" on public.food_servings;
create policy "food_servings_owner_write" on public.food_servings
  for all
  using (
    exists (
      select 1 from public.foods f
      where f.id = food_id and f.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.foods f
      where f.id = food_id and f.user_id = auth.uid()
    )
  );

-- User-created foods --------------------------------------------------------
drop policy if exists "custom_foods_owner_all" on public.custom_foods;
create policy "custom_foods_owner_all" on public.custom_foods
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Meals ---------------------------------------------------------------------
drop policy if exists "meals_owner_all" on public.meals;
create policy "meals_owner_all" on public.meals
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Food logs ----------------------------------------------------------------
drop policy if exists "food_logs_owner_all" on public.food_logs;
create policy "food_logs_owner_all" on public.food_logs
  for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (
      food_id is null
      or exists (
        select 1 from public.foods f
        where f.id = food_id and (f.is_public or f.user_id = auth.uid())
      )
    )
    and (
      custom_food_id is null
      or exists (
        select 1 from public.custom_foods c
        where c.id = custom_food_id and c.user_id = auth.uid()
      )
    )
  );

-- Saved meals --------------------------------------------------------------
drop policy if exists "saved_meals_owner_all" on public.saved_meals;
create policy "saved_meals_owner_all" on public.saved_meals
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "saved_meal_items_owner_all" on public.saved_meal_items;
create policy "saved_meal_items_owner_all" on public.saved_meal_items
  for all
  using (
    exists (
      select 1 from public.saved_meals sm
      where sm.id = saved_meal_id and sm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.saved_meals sm
      where sm.id = saved_meal_id and sm.user_id = auth.uid()
    )
  );

-- Weight -------------------------------------------------------------------
drop policy if exists "weight_logs_owner_all" on public.weight_logs;
create policy "weight_logs_owner_all" on public.weight_logs
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Daily goals --------------------------------------------------------------
drop policy if exists "daily_goals_owner_all" on public.daily_goals;
create policy "daily_goals_owner_all" on public.daily_goals
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
