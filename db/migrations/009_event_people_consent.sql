-- Event recap photos: consent is asked only when a child's photo or name is shown.
-- includes_people defaults to true so every existing event keeps today's rule (consent needed).
-- Existing events copy their photo tick into the new name tick, so nothing already on the site changes.

alter table cal_events
  add column if not exists includes_people boolean not null default true,
  add column if not exists name_consent boolean not null default false;

update cal_events set name_consent = photo_consent;
