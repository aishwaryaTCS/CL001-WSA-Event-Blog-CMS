-- Extra search fields: keywords, canonical link, "hide from Google" (robots) and author.
-- Empty text means "automatic": the website fills in a sensible value.

alter table blog_posts
  add column seo_keywords text not null default '' check (char_length(seo_keywords) <= 200),
  add column seo_canonical text not null default '' check (char_length(seo_canonical) <= 300),
  add column seo_noindex boolean not null default false;

alter table site_pages
  add column seo_keywords text not null default '' check (char_length(seo_keywords) <= 200),
  add column seo_canonical text not null default '' check (char_length(seo_canonical) <= 300),
  add column seo_noindex boolean not null default false,
  add column seo_author text not null default '' check (char_length(seo_author) <= 100);

alter table cal_years
  add column seo_keywords text not null default '' check (char_length(seo_keywords) <= 200),
  add column seo_canonical text not null default '' check (char_length(seo_canonical) <= 300),
  add column seo_noindex boolean not null default false,
  add column seo_author text not null default '' check (char_length(seo_author) <= 100);

alter table cal_events
  add column seo_keywords text not null default '' check (char_length(seo_keywords) <= 200),
  add column seo_noindex boolean not null default false;
