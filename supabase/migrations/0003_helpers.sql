-- Optional server-side helper: atomically fetch-or-create a meal bucket.
-- The client also does this with an upsert, but this function is convenient
-- for future integrations (AI logging, barcode import, recipe builder).
create or replace function public.get_or_create_meal(
  p_log_date date,
  p_meal_type text
)
returns public.meals
language plpgsql
security invoker
set search_path = public
as $$
declare
  result public.meals;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_meal_type not in ('breakfast', 'lunch', 'dinner', 'snacks') then
    raise exception 'Invalid meal type';
  end if;

  insert into public.meals (user_id, log_date, meal_type)
  values (auth.uid(), p_log_date, p_meal_type)
  on conflict (user_id, log_date, meal_type) do nothing;

  select * into result
  from public.meals
  where user_id = auth.uid()
    and log_date = p_log_date
    and meal_type = p_meal_type;

  return result;
end;
$$;

-- Convenience view: per-log calculated nutrition. Keeps calculations in one
-- place for analytics and future reporting without storing derived totals.
create or replace view public.food_log_nutrition
with (security_invoker = true)
as
select
  fl.*,
  round(fl.calories_per_100g * fl.quantity_grams / 100)::integer as calories,
  round(fl.protein_per_100g * fl.quantity_grams / 100, 1) as protein,
  round(fl.carbs_per_100g * fl.quantity_grams / 100, 1) as carbs,
  round(fl.fat_per_100g * fl.quantity_grams / 100, 1) as fat,
  round(fl.fiber_per_100g * fl.quantity_grams / 100, 1) as fiber
from public.food_logs fl;

grant select on public.food_log_nutrition to authenticated;
