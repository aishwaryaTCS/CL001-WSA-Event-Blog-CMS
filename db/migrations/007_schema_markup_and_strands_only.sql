-- 1. Structured data (schema markup) per page: a chosen schema.org type and, for experts,
--    a full custom JSON-LD block that replaces the automatic one. Empty = automatic.
-- 2. Events get their own canonical link (their pop-up link can now be edited too).
-- 3. Filters are the main (Strand) group only: other groups such as "Grade" are removed.

alter table blog_posts
  add column seo_schema_type text not null default '' check (char_length(seo_schema_type) <= 40),
  add column seo_schema_json text not null default '' check (char_length(seo_schema_json) <= 5000);

alter table site_pages
  add column seo_schema_type text not null default '' check (char_length(seo_schema_type) <= 40),
  add column seo_schema_json text not null default '' check (char_length(seo_schema_json) <= 5000);

alter table cal_years
  add column seo_schema_type text not null default '' check (char_length(seo_schema_type) <= 40),
  add column seo_schema_json text not null default '' check (char_length(seo_schema_json) <= 5000);

alter table cal_events
  add column seo_canonical text not null default '' check (char_length(seo_canonical) <= 300),
  add column seo_schema_type text not null default '' check (char_length(seo_schema_type) <= 40),
  add column seo_schema_json text not null default '' check (char_length(seo_schema_json) <= 5000);

-- Strand only: forget extra-group ticks on events, then remove the extra groups and their options.
update cal_events set option_ids = '{}' where cardinality(option_ids) > 0;
delete from cal_filters
 where parent_id in (select id from cal_filters where parent_id is null and not is_main);
delete from cal_filters where parent_id is null and not is_main;
