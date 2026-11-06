-- Search and sharing details for whole public pages (not single notes or events).
-- One row per page. Starts with the blog list page, filled with the wording the website used before.
create table site_pages (
  key text primary key check (key in ('blog')),
  seo_title text not null check (char_length(seo_title) between 1 and 200),
  seo_description text not null check (char_length(seo_description) between 1 and 300),
  share_title text not null default '' check (char_length(share_title) <= 200),
  share_description text not null default '' check (char_length(share_description) <= 300),
  share_image text check (share_image is null or share_image ~ '^/api/uploads/[a-f0-9]{32}\.webp$'),
  share_image_alt text not null default '' check (char_length(share_image_alt) <= 160),
  updated_at timestamptz not null default now()
);

insert into site_pages (key, seo_title, seo_description, share_title, share_description)
values (
  'blog',
  'Notes from school — The Wellsprings blog | Wellsprings Academy',
  'Short, honest notes from inside the classroom — what children thought, built and belonged to this week. Written by teachers at Wellsprings.',
  'Notes from school — Wellsprings Academy',
  'Honest, three-beat notes from teachers at Wellsprings. Think · Build · Belong.'
)
on conflict (key) do nothing;
