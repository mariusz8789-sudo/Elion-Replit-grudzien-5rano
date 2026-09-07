#!/usr/bin/env python3
"""Read-only worker for CERN Open Data record 5208 (CMS Z→μμ 2011).

The worker accepts only fixed commands, verifies the source checksum before
processing, and returns descriptive statistics of a preselected educational
sample. It does not simulate a detector, reconstruct raw events, fit a physics
model, or infer a new particle claim.
"""
from __future__ import annotations

import csv
import hashlib
import json
import math
import os
import statistics
import sys
from pathlib import Path
from typing import Any

DATASET_FILENAME = 'Zmumu.csv'
EXPECTED_SHA256 = '7782778f8417d2c732f4a64efcbfceb6192c97c3bcfd21c0cf1322d38ed965d1'
DATASET_URL = 'https://opendata.cern.ch/record/5208/files/Zmumu.csv'
RECORD_URL = 'https://opendata.cern.ch/record/5208'
REQUIRED_COLUMNS = (
    'Run', 'Event', 'pt1', 'eta1', 'phi1', 'Q1', 'dxy1', 'iso1',
    'pt2', 'eta2', 'phi2', 'Q2', 'dxy2', 'iso2',
)


def emit(value: dict[str, Any]) -> None:
    print(json.dumps(value, sort_keys=True, separators=(',', ':')))


def dataset_path() -> Path:
    root = os.environ.get('GENESIS_CERN_OPEN_DATA_DIR', '').strip()
    return Path(root) / DATASET_FILENAME if root else Path('__missing_cern_open_data_dir__')


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def check_source() -> tuple[bool, str | None, Path]:
    path = dataset_path()
    if not os.environ.get('GENESIS_CERN_OPEN_DATA_DIR', '').strip():
        return False, 'GENESIS_CERN_OPEN_DATA_DIR is not configured', path
    if not path.is_file():
        return False, f'missing dataset file: {path}', path
    actual = sha256(path)
    if actual != EXPECTED_SHA256:
        return False, f'sha256 mismatch: expected {EXPECTED_SHA256}, got {actual}', path
    return True, None, path


def invariant_mass(row: dict[str, str]) -> float:
    # For ultrarelativistic muons the massless two-body relation is sufficient
    # for the dataset-level descriptive statistic; the input source is already
    # a CMS-preselected Z-enriched educational sample.
    pt1 = float(row['pt1'])
    eta1 = float(row['eta1'])
    phi1 = float(row['phi1'])
    pt2 = float(row['pt2'])
    eta2 = float(row['eta2'])
    phi2 = float(row['phi2'])
    delta_phi = math.atan2(math.sin(phi1 - phi2), math.cos(phi1 - phi2))
    mass_squared = 2.0 * pt1 * pt2 * (math.cosh(eta1 - eta2) - math.cos(delta_phi))
    return math.sqrt(max(0.0, mass_squared))


def load_rows(path: Path) -> list[dict[str, str]]:
    with path.open(newline='', encoding='utf-8') as handle:
        reader = csv.DictReader(handle)
        if tuple(reader.fieldnames or ()) != REQUIRED_COLUMNS:
            raise ValueError(f'CSV schema mismatch: expected {REQUIRED_COLUMNS}, got {reader.fieldnames}')
        rows = list(reader)
    if len(rows) != 10_000:
        raise ValueError(f'row count mismatch: expected 10000, got {len(rows)}')
    if len({(row['Run'], row['Event']) for row in rows}) != 10_000:
        raise ValueError('event uniqueness check failed')
    return rows


def stats(path: Path) -> dict[str, Any]:
    rows = load_rows(path)
    masses = [invariant_mass(row) for row in rows]
    bins = [
        {'lowerGeV': lower, 'upperGeV': lower + 5, 'eventCount': sum(lower <= mass < lower + 5 for mass in masses)}
        for lower in range(60, 120, 5)
    ]
    return {
        'dataset': {
            'recordUrl': RECORD_URL,
            'fileUrl': DATASET_URL,
            'license': 'CC0-1.0',
            'sha256': EXPECTED_SHA256,
            'sourceSelection': 'CMS educational Z-enriched dimuon sample; preselected 60–120 GeV',
            'dataLimit': 'Not suitable for a full physics analysis; no detector reconstruction or discovery claim.',
        },
        'eventCount': len(rows),
        'uniqueEventCount': len({(row['Run'], row['Event']) for row in rows}),
        'invariantMassGeV': {
            'formula': 'm² = 2 pT1 pT2 (cosh(Δη) − cos(Δφ)); ultrarelativistic approximation',
            'min': min(masses),
            'max': max(masses),
            'mean': statistics.fmean(masses),
            'median': statistics.median(masses),
            'events80To100GeV': sum(80.0 <= mass <= 100.0 for mass in masses),
            'histogram5GeV60To120': bins,
        },
    }


def main() -> None:
    try:
        request = json.load(sys.stdin)
        if not isinstance(request, dict) or request.get('cmd') not in {'detect', 'zmumu_stats'}:
            emit({'ok': False, 'error': 'unsupported_command'})
            return
        valid, reason, path = check_source()
        if not valid:
            emit({'ok': False, 'error': 'DATA_REQUIRED', 'reason': reason})
            return
        if request['cmd'] == 'detect':
            emit({
                'ok': True,
                'version': 'cms-open-data-5208@2011-published-2019',
                'engine': 'CMS Open Data Z→μμ invariant-mass descriptive analysis',
                'doi': None,
                'recordUrl': RECORD_URL,
                'sha256': EXPECTED_SHA256,
            })
            return
        emit({'ok': True, 'data': stats(path)})
    except Exception as error:  # no traceback leaks through the JSON protocol
        emit({'ok': False, 'error': 'execution_failed', 'reason': str(error)[:240]})


if __name__ == '__main__':
    main()
