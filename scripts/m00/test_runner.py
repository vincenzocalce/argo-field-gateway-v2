"""Synthetic client tests. No PostgreSQL server is contacted."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

from test_support import read_memberships, verify_dossier

RUNNER = Path(__file__).with_name('run_m00.sh').resolve()


class RunnerTest(unittest.TestCase):
    def run_case(self, mode='', authorized=True, answer='CONFERMATO\n', membership_family='modern'):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for name in ('psql', 'pg_dump'):
                p = root / name
                p.write_text('''#!/usr/bin/env python3
import csv, os, sys
from pathlib import Path
name=Path(sys.argv[0]).name
if '--version' in sys.argv:
    print(name + ' (PostgreSQL) 16.0'); sys.exit(0)
with open(os.environ['CALL_LOG'], 'a') as f: f.write(name + '\\n')
assert 'default_transaction_read_only=on' in os.environ['PGOPTIONS']
assert '-w' in sys.argv
mode=os.environ['FAKE_MODE']
if name == 'pg_dump':
    Path('schema.sql').write_text('-- synthetic schema\\n')
    sys.exit(7 if mode == 'dump_fail' else 0)
assert '-X' in sys.argv
if '-Atc' in sys.argv:
    print('synthetic_identity'); sys.exit(3 if mode == 'connection_fail' else 0)
assert '-f' in sys.argv
Path('identity.csv').write_text('synthetic\\n')
fields = ['granted_role', 'member', 'grantor', 'admin_option', 'inherit_option', 'set_option']
family = os.environ['FAKE_MEMBERSHIP_FAMILY']
with Path('memberships.csv').open('w', newline='') as output:
    writer = csv.writer(output)
    writer.writerow(fields)
    if family != 'empty':
        writer.writerow(['synthetic_role_a', 'synthetic_member', 'synthetic_grantor', 'f',
                         't' if family == 'modern' else '', 'f' if family == 'modern' else ''])
        writer.writerow(['synthetic_role_b', 'synthetic_member', 'synthetic_grantor', 't',
                         'f' if family == 'modern' else '', 't' if family == 'modern' else ''])
sys.exit(9 if mode == 'inventory_fail' else 0)
''')
                p.chmod(0o700)
            for name in ('service', 'passfile'):
                (root / name).touch(mode=0o600)
            env = {k: v for k, v in os.environ.items() if not k.startswith(('PG', 'M00_', 'ARGO_'))}
            env.update(PATH=str(root) + os.pathsep + env['PATH'],
                       ARGO_ENV='TEST', PGSERVICE='synthetic_test',
                       PGSERVICEFILE=str(root / 'service'), PGPASSFILE=str(root / 'passfile'),
                       M00_OUTPUT_ROOT=str(root), CALL_LOG=str(root / 'calls'), FAKE_MODE=mode,
                       FAKE_MEMBERSHIP_FAMILY=membership_family)
            if authorized:
                env['M00_AUTHORIZED'] = 'TEST'
            result = subprocess.run(['bash', str(RUNNER)], env=env, cwd=root,
                                    input=answer, text=True, capture_output=True)
            dirs = list(root.glob('M00_TEST_*'))
            calls = (root / 'calls').read_text().splitlines() if (root / 'calls').exists() else []
            if dirs:
                dossier = dirs[0]
                manifest = verify_dossier(dossier)
                if calls == ['psql', 'pg_dump', 'psql']:
                    self.assertIn('memberships.csv', manifest)
                    rows = read_memberships(dossier / 'memberships.csv')
                    if membership_family == 'empty':
                        self.assertEqual(rows, [])
                    else:
                        self.assertEqual(len(rows), 2)
                        self.assertEqual([row['admin_option'] for row in rows], ['f', 't'])
                        expected = [('t', 'f'), ('f', 't')] if membership_family == 'modern' else [('', ''), ('', '')]
                        self.assertEqual([(row['inherit_option'], row['set_option']) for row in rows], expected)
            return result.returncode, calls, bool(dirs)

    def test_authorization_before_connection(self):
        self.assertEqual(self.run_case(authorized=False), (2, [], False))

    def test_connection_failure_preserves_dossier(self):
        self.assertEqual(self.run_case('connection_fail'), (3, ['psql'], True))

    def test_rejected_identity_stops_inventory(self):
        self.assertEqual(self.run_case(answer='NO\n'), (2, ['psql'], True))

    def test_success_is_only_synthetic(self):
        self.assertEqual(self.run_case(), (0, ['psql', 'pg_dump', 'psql'], True))

    def test_dump_failure_is_not_success(self):
        self.assertEqual(self.run_case('dump_fail'), (1, ['psql', 'pg_dump', 'psql'], True))

    def test_inventory_failure_is_not_success(self):
        self.assertEqual(self.run_case('inventory_fail'), (1, ['psql', 'pg_dump', 'psql'], True))

    def test_pg16_boolean_fields_survive_dossier_and_manifest(self):
        self.assertEqual(self.run_case(membership_family='modern'),
                         (0, ['psql', 'pg_dump', 'psql'], True))

    def test_pre16_null_fields_survive_dossier_and_manifest(self):
        self.assertEqual(self.run_case(membership_family='legacy'),
                         (0, ['psql', 'pg_dump', 'psql'], True))

    def test_empty_memberships_keep_complete_header(self):
        self.assertEqual(self.run_case(membership_family='empty'),
                         (0, ['psql', 'pg_dump', 'psql'], True))


if __name__ == '__main__':
    unittest.main()
