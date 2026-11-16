-- Registrierung ohne Mindestalter und ohne Zustimmung der Eltern
-- Von Hand in Supabase ausführen: SQL Editor, einfügen, Run.
-- Ohne diese Änderung weist die Datenbank Registrierungen unter 14 Jahren ab
-- und verlangt unter 17 Jahren eine Elternzustimmung, die die App nicht mehr abfragt.
-- Die Prüfung von Geburtsjahr und Einwilligung bleibt.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  by_ int;
  cons boolean;
begin
  by_ := nullif(new.raw_user_meta_data->>'birth_year','')::int;
  cons := coalesce((new.raw_user_meta_data->>'consent')::boolean, false);
  if by_ is null or by_ < 1900 or by_ > extract(year from now())::int then
    raise exception 'Geburtsjahr fehlt oder ist ungültig';
  end if;
  if not cons then raise exception 'Einwilligung fehlt'; end if;
  insert into public.profiles (user_id, birth_year, guardian_consent) values (new.id, by_, false);
  insert into public.user_state (user_id) values (new.id);
  return new;
end $function$;
