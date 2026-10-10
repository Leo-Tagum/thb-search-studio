-- Server-side service role may use the tables; anon/authenticated get nothing (and RLS has no policies).
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
revoke all on all tables in schema public from anon, authenticated;
