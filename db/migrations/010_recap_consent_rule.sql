-- A recap may be public without consent ticks when no person is shown (includes_people = false).
-- The old rule from 004 always required photo_consent. Its name was given by Postgres, so it is
-- found by what it checks, not by name.
do $$
declare
  rule record;
begin
  for rule in
    select conname from pg_constraint
    where conrelid = 'cal_events'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%recap_published%'
  loop
    execute format('alter table cal_events drop constraint %I', rule.conname);
  end loop;
end $$;

alter table cal_events add constraint cal_events_recap_rule check (
  recap_published = false
  or (status = 'published' and (includes_people = false or (photo_consent and name_consent)))
);
