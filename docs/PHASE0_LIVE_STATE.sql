-- ============================================================
-- Phase 0 -- dump the REAL production state
-- ============================================================
--
-- Run in the SQL editor of the CLIENT project (GetDraft Org ->
-- GetDraft), which is now the system of record: 24 tables, 0 users,
-- 034 helpers already present.
--
-- Why this exists: every RLS and privilege claim in
-- docs/SUPABASE_ONLY_MIGRATION_AUDIT.md was read out of the migration
-- FILES, never out of a database. Neither project has a
-- supabase_migrations ledger -- the SQL was applied by hand -- so the
-- shape of the schema is the ONLY evidence of what is actually applied.
--
-- Returns one row per finding rather than a single JSON document: the
-- results grid truncates long cells, and this has to be copyable.
--
-- Read-only. Touches no data.

SELECT 'A. rls DISABLED (client-reachable, no RLS at all)' AS section,
       COALESCE(string_agg(c.relname, ', ' ORDER BY c.relname), '(none)') AS detail
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = false

UNION ALL
-- Deny-all today. The audit expects outreach, outreach_messages,
-- guardian_links, kyc_sessions, conversations and direct_messages here
-- -- every write path for those must be authored from zero.
SELECT 'B. rls ON but NO policies (deny-all; write paths need authoring)',
       COALESCE(string_agg(c.relname, ', ' ORDER BY c.relname), '(none)')
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = true
  AND NOT EXISTS (SELECT 1 FROM pg_policies p
                  WHERE p.schemaname = 'public' AND p.tablename = c.relname)

UNION ALL
-- The three latent escalations from 007: unreachable today only because
-- service_role is the sole writer. They activate the moment a client
-- writes directly.
SELECT 'C. policies MISSING with_check (latent escalation)',
       COALESCE(string_agg(tablename || '.' || policyname || ' [' || cmd || ']',
                ', ' ORDER BY tablename, policyname), '(none)')
FROM pg_policies
WHERE schemaname = 'public' AND cmd IN ('ALL','UPDATE','INSERT')
  AND with_check IS NULL

UNION ALL
-- Non-empty => 031 has NOT been applied to this project.
SELECT 'D. client-WRITABLE tables (031 not applied if non-empty)',
       COALESCE(string_agg(DISTINCT c.relname, ', ' ORDER BY c.relname), '(none)')
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN (VALUES ('anon'),('authenticated')) r(rolname)
CROSS JOIN (VALUES ('INSERT'),('UPDATE'),('DELETE')) p(priv)
WHERE n.nspname = 'public' AND c.relkind = 'r'
  AND has_table_privilege(r.rolname, c.oid, p.priv)

UNION ALL
-- Non-empty => 032 has NOT been applied to this project.
SELECT 'E. client-READABLE tables (032 not applied if non-empty)',
       COALESCE(string_agg(DISTINCT c.relname, ', ' ORDER BY c.relname), '(none)')
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN (VALUES ('anon'),('authenticated')) r(rolname)
WHERE n.nspname = 'public' AND c.relkind = 'r'
  AND has_table_privilege(r.rolname, c.oid, 'SELECT')

UNION ALL
-- Never read by the audit. A public bucket with no MIME or size limit
-- is a direct exposure, and admin video review depends on policy shape.
SELECT 'F. storage buckets (id | public | size | mime)',
       COALESCE(string_agg(id || ' | pub=' || public::text || ' | ' ||
                COALESCE(file_size_limit::text, 'no-limit') || ' | ' ||
                COALESCE(array_to_string(allowed_mime_types, '/'), 'any'),
                '   //   ' ORDER BY id), '(none)')
FROM storage.buckets

UNION ALL
SELECT 'G. storage.objects policies',
       COALESCE(string_agg(policyname || ' [' || cmd || ']',
                ', ' ORDER BY policyname), '(none)')
FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'

UNION ALL
-- SECURITY DEFINER functions a client can call are effectively extra
-- API endpoints. The five from 034 are expected here.
SELECT 'H. client-EXECUTABLE security-definer functions',
       COALESCE(string_agg(p.proname, ', ' ORDER BY p.proname), '(none)')
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosecdef
  AND (has_function_privilege('anon', p.oid, 'EXECUTE')
    OR has_function_privilege('authenticated', p.oid, 'EXECUTE'));
