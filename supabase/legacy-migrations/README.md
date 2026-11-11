# Archived incremental migrations

`20261111120000_remote_schema_baseline.sql` is the active local-development
baseline. The deployed project predated tracked Supabase migration history, so
replaying these later hand-applied changes against that baseline caused local
bootstrap failures.

These files are preserved for audit and historical reference only. Supabase
CLI reads only `supabase/migrations/*.sql`, so do not move them back unless the
migration history is deliberately reconstructed and tested end to end.
