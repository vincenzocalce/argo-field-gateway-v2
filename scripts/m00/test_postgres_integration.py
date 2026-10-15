"""Opt-in integration against this workflow's disposable PostgreSQL service only.

Never runs from unittest discovery or with ambient PG* configuration. It creates
synthetic roles/table in the disposable service; it is not a DEV/TEST inventory
acquisition or a migration, and it cannot close operational gate M00.
"""
import argparse
import csv
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

from test_support import read_memberships, verify_dossier

SCRIPT_DIR = Path(__file__).resolve().parent
REPOSITORY = SCRIPT_DIR.parents[1]
SERVICE = 'm00_ci_disposable'
DATABASE = USER = 'm00_ci'
PASSWORD = 'm00_ci_disposable_only'
ROLE_OPTIONS = {'tt': ('t', 't'), 'tf': ('t', 'f'),
                'ft': ('f', 't'), 'ff': ('f', 'f')}


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def checked(command, env, **kwargs):
    result = subprocess.run(command, env=env, text=True, capture_output=True, **kwargs)
    if result.returncode:
        raise AssertionError(f'{command[0]} exited {result.returncode}\n'
                             f'{result.stdout}\n{result.stderr}')
    return result.stdout


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--isolated-ci', action='store_true',
                        help='Explicitly authorize only the disposable service created by CI')
    parser.add_argument('--port', type=int, required=True,
                        help='Loopback port assigned to this job service by GitHub Actions')
    parser.add_argument('--expected-major', type=int, choices=(12, 15, 16, 17), required=True)
    parser.add_argument('--evidence-root', type=Path, required=True,
                        help='New private directory outside the repository for synthetic CI evidence')
    args = parser.parse_args()
    # All guards run before any psql/pg_dump invocation. No arbitrary host, user,
    # database, password or inherited libpq options are accepted by this script.
    require(args.isolated_ci, 'Refusing connection: --isolated-ci is required')
    require(os.environ.get('GITHUB_ACTIONS') == 'true', 'Only GitHub Actions disposable services are supported')
    require(os.environ.get('M00_CI_ISOLATED_RESOURCE') == 'm00-memberships-disposable',
            'Missing explicit disposable CI resource marker')
    require(1 <= args.port <= 65535, 'Invalid service port')
    evidence_root = args.evidence_root
    require(evidence_root.is_absolute(), '--evidence-root must be absolute')
    evidence_root = evidence_root.resolve()
    require(REPOSITORY != evidence_root and REPOSITORY not in evidence_root.parents,
            'Evidence directory must be outside the repository')
    require(not evidence_root.exists(), 'Evidence directory must be new for this run')
    require(shutil.which('psql') and shutil.which('pg_dump'), 'psql and pg_dump are required')
    evidence_root.mkdir(mode=0o700, parents=True)
    os.chmod(evidence_root, 0o700)

    with tempfile.TemporaryDirectory(prefix='m00-ci-config-') as config:
        config = Path(config)
        service_file, pass_file = config / 'pg_service.conf', config / 'pgpass'
        service_file.write_text(f'[{SERVICE}]\nhost=127.0.0.1\nport={args.port}\n'
                                f'dbname={DATABASE}\nuser={USER}\nsslmode=disable\n')
        pass_file.write_text(f'127.0.0.1:{args.port}:{DATABASE}:{USER}:{PASSWORD}\n')
        service_file.chmod(0o600)
        pass_file.chmod(0o600)
        env = {key: value for key, value in os.environ.items()
               if not key.startswith(('PG', 'M00_', 'ARGO_'))}
        env.update(PGSERVICE=SERVICE, PGSERVICEFILE=str(service_file),
                   PGPASSFILE=str(pass_file), PGCONNECT_TIMEOUT='5',
                   PGAPPNAME='m00_disposable_ci_test')
        psql = ['psql', '-X', '-w', '-v', 'ON_ERROR_STOP=1']
        # Inspect identity read-only before fixture DDL. Fixed synthetic names and
        # expected major are independent of the operational TEST configuration.
        identity = checked(psql + ['-Atq', '-c',
            "BEGIN READ ONLY; SELECT current_database(),session_user,"
            "current_setting('server_version_num'),inet_server_addr(); COMMIT;"], env).strip()
        fields = identity.split('|')
        require(len(fields) == 4 and fields[:2] == [DATABASE, USER],
                'Unexpected disposable service identity')
        version = int(fields[2])
        require(version // 10000 == args.expected_major, 'Unexpected server major')
        fixture_count = checked(psql + ['-Atq', '-c',
            "SELECT count(*) FROM pg_roles WHERE rolname LIKE 'm00_ci_role_%' "
            "OR rolname='m00_ci_member';"], env).strip()
        require(fixture_count == '0', 'Existing fixtures: this must be a fresh disposable service')
        statements = ['BEGIN;', 'CREATE ROLE m00_ci_member NOLOGIN;']
        for suffix, (inherit, set_role) in ROLE_OPTIONS.items():
            role = 'm00_ci_role_' + suffix
            statements.append(f'CREATE ROLE {role} NOLOGIN;')
            if version >= 160000:
                statements.append(f'GRANT {role} TO m00_ci_member WITH '
                                  f'INHERIT {"TRUE" if inherit == "t" else "FALSE"}, '
                                  f'SET {"TRUE" if set_role == "t" else "FALSE"}, '
                                  f'ADMIN {"TRUE" if suffix == "tt" else "FALSE"};')
            else:
                statements.append(f'GRANT {role} TO m00_ci_member' +
                                  (' WITH ADMIN OPTION;' if suffix == 'tt' else ';'))
        statements.extend(['CREATE TABLE public.m00_ci_fixture (id integer PRIMARY KEY);', 'COMMIT;'])
        checked(psql, env, input='\n'.join(statements))
        runner_env = dict(env, ARGO_ENV='TEST', M00_AUTHORIZED='TEST',
                          M00_OUTPUT_ROOT=str(evidence_root))
        checked(['bash', str(SCRIPT_DIR / 'run_m00.sh')], runner_env, input='CONFERMATO\n')
        dossiers = list(evidence_root.glob('M00_TEST_*'))
        require(len(dossiers) == 1, 'Expected one complete synthetic CI dossier')
        dossier = dossiers[0]
        manifest = verify_dossier(dossier)
        require('memberships.csv' in manifest, 'Membership CSV missing from evidence manifest')
        require('identity.csv' in manifest, 'Server identity missing from evidence manifest')
        with (dossier / 'identity.csv').open(newline='') as identity_source:
            captured_identity = next(csv.DictReader(identity_source))
        require(captured_identity['server_version_num'] == str(version),
                'Dossier server version differs from the verified service version')
        for source_name in ('inventory.sql', 'run_m00.sh'):
            require((dossier / source_name).read_bytes() == (SCRIPT_DIR / source_name).read_bytes(),
                    f'Dossier must preserve the exact executed source: {source_name}')
        run_record = (dossier / 'run.txt').read_text()
        for success in ('runner_exit_code=0\n', 'dump_exit_code=0\n', 'inventory_exit_code=0\n'):
            require(success in run_record, 'Runner acquisition was not successful')
        rows = read_memberships(dossier / 'memberships.csv')
        fixtures = {row['granted_role']: row for row in rows if row['member'] == 'm00_ci_member'}
        require(set(fixtures) == {'m00_ci_role_' + suffix for suffix in ROLE_OPTIONS},
                'Fixture memberships missing or duplicated')
        require(sum(row['member'] == 'm00_ci_member' for row in rows) == len(ROLE_OPTIONS),
                'Unexpected duplicate fixture membership')
        for suffix, expected in ROLE_OPTIONS.items():
            row = fixtures['m00_ci_role_' + suffix]
            require(row['grantor'] == USER, 'Grantor changed during acquisition')
            require(row['admin_option'] == ('t' if suffix == 'tt' else 'f'),
                    'Existing admin_option field changed')
            require((row['inherit_option'], row['set_option']) ==
                    (expected if version >= 160000 else ('', '')),
                    f'Incorrect membership options for {suffix} on PostgreSQL {args.expected_major}')
        # Exercise the exact membership SELECT with an empty result, without
        # changing built-in roles or operational SQL just to manufacture emptiness.
        inventory = (SCRIPT_DIR / 'inventory.sql').read_text()
        match = re.search(r'\\o memberships\.csv\s*\n(.*?)\n\\o ', inventory, re.S)
        require(match is not None, 'Cannot find memberships SELECT')
        membership_query = match.group(1).strip().rstrip(';')
        empty_csv = evidence_root / 'memberships_empty.csv'
        checked(psql, env, cwd=evidence_root, input='\n'.join([
            '\\pset format csv', '\\pset footer off', 'BEGIN READ ONLY;',
            '\\o memberships_empty.csv',
            f'SELECT * FROM ({membership_query}) AS m00_empty_memberships WHERE false;',
            '\\o', 'COMMIT;',
        ]))
        require(read_memberships(empty_csv) == [], 'Empty results must preserve all CSV fields')
        (evidence_root / 'evidence_scope.json').write_text(json.dumps({
            'scope': 'synthetic disposable GitHub Actions PostgreSQL service only',
            'server_major': args.expected_major,
            'fixture_memberships': 4,
            'operational_dev_test_acquired': False,
            'migration_executed': False,
            'gate_M00': 'OPEN',
        }, indent=2) + '\n')
    print(f'PASS: PostgreSQL {args.expected_major}; full runner dossier, four membership '
          'fixtures, empty CSV header, manifest bytes/SHA-256. Operational gate M00 OPEN.')


if __name__ == '__main__':
    main()
