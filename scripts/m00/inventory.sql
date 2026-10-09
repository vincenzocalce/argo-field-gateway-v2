\set ON_ERROR_STOP on
\pset pager off
\pset format csv
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';
SET LOCAL search_path = pg_catalog;
\o identity.csv
SELECT clock_timestamp() AS captured_at,version(),current_setting('server_version_num') AS server_version_num,current_database(),session_user,current_user,current_setting('transaction_read_only') AS read_only,current_setting('TimeZone') AS timezone,pg_is_in_recovery();
\o schemas.csv
SELECT oid,nspname,pg_get_userbyid(nspowner) AS owner,nspacl FROM pg_namespace ORDER BY nspname;
\o extensions.csv
SELECT e.extname,e.extversion,n.nspname,e.extrelocatable FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace ORDER BY 1;
\o relations.csv
SELECT n.nspname,c.relname,c.relkind,c.relispartition,pg_get_userbyid(c.relowner) AS owner,c.relrowsecurity,c.relforcerowsecurity,c.relacl,c.reloptions,c.reltuples AS estimated_rows FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' ORDER BY 1,2;
\o columns.csv
SELECT n.nspname,c.relname,a.attnum,a.attname,format_type(a.atttypid,a.atttypmod) AS data_type,a.attnotnull,a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid) AS default_expr,a.attacl FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attnum>0 AND NOT a.attisdropped AND n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' ORDER BY 1,2,3;
\o constraints.csv
SELECT n.nspname,co.conname,co.contype,co.conrelid::regclass AS relation,co.contypid,co.confrelid::regclass AS referenced_relation,co.convalidated,co.condeferrable,co.condeferred,pg_get_constraintdef(co.oid,true) AS definition FROM pg_constraint co JOIN pg_namespace n ON n.oid=co.connamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' ORDER BY 1,2;
\o indexes.csv
SELECT n.nspname,c.relname,i.indexrelid::regclass AS index_name,i.indisprimary,i.indisunique,i.indisvalid,i.indisready,pg_get_indexdef(i.indexrelid) AS definition FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' ORDER BY 1,2,3;
\o triggers.csv
SELECT n.nspname,c.relname,t.tgname,t.tgenabled,t.tgisinternal,t.tgfoid::regprocedure AS function_name,pg_get_triggerdef(t.oid,true) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' ORDER BY 1,2,3;
\o event_triggers.csv
SELECT evtname,evtevent,evtowner::regrole,evtfoid::regprocedure,evtenabled,evttags FROM pg_event_trigger ORDER BY 1;
\o routines.csv
SELECT n.nspname,p.proname,p.oid::regprocedure AS signature,p.prokind,p.prosecdef,p.provolatile,p.proacl,pg_get_userbyid(p.proowner) AS owner,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.prokind IN ('f','p') AND n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' ORDER BY 1,2,3;
\o roles.csv
SELECT oid,rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolconnlimit,rolvaliduntil,rolbypassrls FROM pg_roles ORDER BY rolname;
\o memberships.csv
SELECT roleid::regrole AS granted_role,member::regrole AS member,grantor::regrole AS grantor,admin_option FROM pg_auth_members ORDER BY 1,2;
\o database_acl.csv
SELECT datname,pg_get_userbyid(datdba) AS owner,datacl FROM pg_database WHERE datname=current_database();
\o default_acl.csv
SELECT defaclrole::regrole,defaclnamespace::regnamespace,defaclobjtype,defaclacl FROM pg_default_acl ORDER BY 1,2,3;
\o policies.csv
SELECT * FROM pg_policies ORDER BY schemaname,tablename,policyname;
\o views.csv
SELECT n.nspname,c.relname,c.relkind,c.reloptions,pg_get_viewdef(c.oid,true) AS definition FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('v','m') AND n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' ORDER BY 1,2;
\o view_dependencies.csv
SELECT DISTINCT n.nspname AS view_schema,v.relname AS view_name,d.deptype,d.refclassid::regclass AS referenced_catalog,pg_describe_object(d.refclassid,d.refobjid,d.refobjsubid) AS referenced_object FROM pg_rewrite r JOIN pg_class v ON v.oid=r.ev_class JOIN pg_namespace n ON n.oid=v.relnamespace JOIN pg_depend d ON d.classid='pg_rewrite'::regclass AND d.objid=r.oid WHERE v.relkind IN ('v','m') AND n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' ORDER BY 1,2,3,4,5;
\o dependencies.csv
SELECT d.classid::regclass,d.objid,d.objsubid,pg_describe_object(d.classid,d.objid,d.objsubid) AS dependent_object,d.refclassid::regclass,d.refobjid,d.refobjsubid,pg_describe_object(d.refclassid,d.refobjid,d.refobjsubid) AS referenced_object,d.deptype FROM pg_depend d ORDER BY 1,2,3,5,6,7;
\o estimated_counts.csv
SELECT n.nspname,c.relname,c.relkind,c.relispartition,c.reltuples AS estimate_not_exact,s.n_live_tup AS stats_estimate,s.last_analyze,s.last_autoanalyze FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_stat_all_tables s ON s.relid=c.oid WHERE c.relkind IN ('r','p','m','f') AND n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' ORDER BY 1,2;
\o migrations_inventory.csv
SELECT n.nspname,c.relname,c.relkind,pg_get_userbyid(c.relowner) AS owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relname='argo_schema_migrations' ORDER BY 1;
\o migrations_rows.csv
SELECT format('SELECT %L AS source_relation,to_jsonb(m) AS migration_row FROM %I.%I m ORDER BY to_jsonb(m)::text;',n.nspname||'.'||c.relname,n.nspname,c.relname)
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE c.relname='argo_schema_migrations' AND c.relkind IN ('r','p')
ORDER BY n.nspname
\gexec
\o capture_end.csv
SELECT clock_timestamp() AS captured_end_at;
COMMIT;
\o
