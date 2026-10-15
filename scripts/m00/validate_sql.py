"""Offline PostgreSQL grammar check; no connections or statement execution."""
from pathlib import Path
from pglast import parse_sql

source = Path(__file__).with_name('inventory.sql').read_text()
sql = []
allowed = {'\\set', '\\pset', '\\o', '\\gexec'}
for line in source.splitlines():
    if line.startswith('\\'):
        command = line.split()[0]
        assert command in allowed, command
        if command == '\\gexec':
            sql.append(';')
    else:
        sql.append(line)
statements = parse_sql('\n'.join(sql))
# Parse the generated migration-row query template separately.
parse_sql('SELECT \'public.argo_schema_migrations\' AS source_relation, '
          'to_jsonb(m) AS migration_row FROM "public"."argo_schema_migrations" m '
          'ORDER BY to_jsonb(m)::text;')
assert all(type(s.stmt).__name__ in {'SelectStmt', 'VariableSetStmt', 'TransactionStmt'}
           for s in statements)
print(f'PASS: {len(statements)} SQL statements + dynamic SELECT template; offline only')
