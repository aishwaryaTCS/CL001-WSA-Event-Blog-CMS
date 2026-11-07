-- A short unique id per note and per event. It goes before the title in public links
-- (/blog/<uid>-<slug>, ?event=<uid>-<slug>) so two items with the same title never share a URL.
-- Given once, never edited.

alter table blog_posts add column uid text;
update blog_posts set uid = substr(md5(random()::text || id::text), 1, 8) where uid is null;
alter table blog_posts
  alter column uid set default substr(md5(random()::text || clock_timestamp()::text), 1, 8),
  alter column uid set not null,
  add constraint blog_posts_uid_format check (uid ~ '^[a-f0-9]{8}$');
create unique index blog_posts_uid on blog_posts (uid);

alter table cal_events add column uid text;
update cal_events set uid = substr(md5(random()::text || id::text), 1, 8) where uid is null;
alter table cal_events
  alter column uid set default substr(md5(random()::text || clock_timestamp()::text), 1, 8),
  alter column uid set not null,
  add constraint cal_events_uid_format check (uid ~ '^[a-f0-9]{8}$');
create unique index cal_events_uid on cal_events (uid);
