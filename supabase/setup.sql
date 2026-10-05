-- Run once in the Supabase dashboard: SQL Editor > New query > paste > Run.
-- Creates the private storage bucket that holds each player's save and the rules that let only the owner touch it.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('saves', 'saves', false, 52428800, array['application/gzip', 'application/octet-stream'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

-- every object lives under a folder named after its owner: {user id}/main.json.gz
drop policy if exists "saves: owner can read" on storage.objects;
create policy "saves: owner can read" on storage.objects
  for select to authenticated
  using (bucket_id = 'saves' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "saves: owner can add" on storage.objects;
create policy "saves: owner can add" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'saves' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "saves: owner can replace" on storage.objects;
create policy "saves: owner can replace" on storage.objects
  for update to authenticated
  using (bucket_id = 'saves' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'saves' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "saves: owner can delete" on storage.objects;
create policy "saves: owner can delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'saves' and (storage.foldername(name))[1] = auth.uid()::text);
