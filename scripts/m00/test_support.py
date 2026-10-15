"""Evidence assertions shared by synthetic and explicitly isolated CI tests."""
import csv
import hashlib
import json
from pathlib import Path
import re
import stat

MEMBERSHIP_FIELDS = [
    'granted_role', 'member', 'grantor', 'admin_option',
    'inherit_option', 'set_option',
]


def read_memberships(path):
    """Read psql CSV, tolerating only its optional row-count footer."""
    with Path(path).open(newline='') as source:
        rows = list(csv.reader(source))
    if not rows or rows[0] != MEMBERSHIP_FIELDS:
        raise AssertionError(f'Unexpected membership CSV header: {rows[:1]!r}')
    records = rows[1:]
    if records and len(records[-1]) == 1 and re.fullmatch(r'\(\d+ rows?\)', records[-1][0]):
        records.pop()
    if any(len(row) != len(MEMBERSHIP_FIELDS) for row in records):
        raise AssertionError('Malformed membership CSV record')
    return [dict(zip(MEMBERSHIP_FIELDS, row)) for row in records]


def verify_dossier(dossier):
    """Require a complete manifest, byte counts and hashes, and an open M00 gate."""
    dossier = Path(dossier)
    if stat.S_IMODE(dossier.stat().st_mode) != 0o700:
        raise AssertionError('Dossier must have mode 0700')
    entries = json.loads((dossier / 'checksums.json').read_text())
    manifest = {item['path']: item for item in entries}
    actual = {path.name for path in dossier.iterdir()
              if path.is_file() and path.name != 'checksums.json'}
    if len(entries) != len(manifest) or set(manifest) != actual:
        raise AssertionError('Manifest must cover every dossier file exactly once')
    for name, item in manifest.items():
        data = (dossier / name).read_bytes()
        if item['bytes'] != len(data) or item['sha256'] != hashlib.sha256(data).hexdigest():
            raise AssertionError(f'Invalid evidence checksum or byte count: {name}')
    if 'gate_M00=OPEN\n' not in (dossier / 'run.txt').read_text():
        raise AssertionError('Offline/CI evidence must not close the operational M00 gate')
    return manifest
