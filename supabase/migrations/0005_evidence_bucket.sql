-- Private bucket for Evidence Library uploads (never public).
insert into storage.buckets (id, name, public) values ('evidence', 'evidence', false)
on conflict (id) do update set public = false;
