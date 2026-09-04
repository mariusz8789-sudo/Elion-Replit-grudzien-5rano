#!/usr/bin/env python3
"""Read-only, real-data worker for a bounded DepMap 24Q2 experiment.

The worker intentionally supports one preregistered descriptive panel. It never
requests patient data, makes clinical predictions, or generates a surrogate
result if the version-pinned data artefacts cannot be verified.
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

DATA_ENV = 'GENESIS_DEPMAP_24Q2_DATA_DIR'
DATASET_VERSION = 'DepMap 24Q2 Public'
DATASET_DOI = '10.25452/figshare.plus.25880521'
PANEL_ID = 'senescence-cell-cycle-axis-v1'
PANEL = ('CDKN1A', 'CDKN2A', 'TP53', 'RB1', 'CDK4', 'CDK6', 'MDM2')
EXPECTED_FILES = {
    'CRISPRGeneEffect.csv': 'd155149181308f8e16b6a4677cde3e5af1ddef68ada1947486ae8c0bcb231452',
    'Model.csv': 'a4cac376131b41aa10b60a075b11c80264bfa860a5509d22cde259c5e85867f8',
    'AchillesCommonEssentialControls.csv': '496c5ec9eaa2f4c13dc00fd15a8e24df253afcc5a969d3956b7dd3d987640084',
    'AchillesNonessentialControls.csv': '2aacca44b6a79e7240518e6adbd89c70d7d895da91cd4c8b4d380529bc5b8e5e',
}


def emit(payload: dict[str, object]) -> None:
    sys.stdout.write(json.dumps(payload, sort_keys=True) + '\n')


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def data_dir() -> Path | None:
    configured = os.environ.get(DATA_ENV)
    return Path(configured).expanduser().resolve() if configured else None


def verify_dataset() -> tuple[bool, str | None, Path | None]:
    directory = data_dir()
    if directory is None:
        return False, f'{DATA_ENV} is not configured', None
    if not directory.is_dir():
        return False, f'{DATA_ENV} is not a readable directory', None
    for name, expected in EXPECTED_FILES.items():
        path = directory / name
        if not path.is_file():
            return False, f'missing_required_file:{name}', None
        actual = sha256(path)
        if actual != expected:
            return False, f'checksum_mismatch:{name}', None
    return True, None, directory


def gene_symbol(value: str) -> str:
    return value.split(' (', 1)[0].strip()


def load_controls(path: Path) -> set[str]:
    with path.open(newline='', encoding='utf-8') as handle:
        reader = csv.DictReader(handle)
        return {gene_symbol(row['Gene']) for row in reader if row.get('Gene')}


def quantile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    position = (len(ordered) - 1) * fraction
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)


def gene_summary(values: list[float]) -> dict[str, float | int]:
    return {
        'n': len(values),
        'median': statistics.median(values),
        'q1': quantile(values, 0.25),
        'q3': quantile(values, 0.75),
        'share_lt_minus_0_5': sum(value < -0.5 for value in values) / len(values),
        'share_lt_minus_1_0': sum(value < -1.0 for value in values) / len(values),
    }


def execute(directory: Path) -> dict[str, object]:
    effect_path = directory / 'CRISPRGeneEffect.csv'
    essential = load_controls(directory / 'AchillesCommonEssentialControls.csv')
    nonessential = load_controls(directory / 'AchillesNonessentialControls.csv')

    with effect_path.open(newline='', encoding='utf-8') as handle:
        reader = csv.reader(handle)
        header = next(reader)
        symbols = [gene_symbol(value) for value in header]
        by_symbol = {value: index for index, value in enumerate(symbols) if value}
        selected = tuple(PANEL) + tuple(sorted(essential)) + tuple(sorted(nonessential))
        indexes = {gene: by_symbol[gene] for gene in selected if gene in by_symbol}
        values: dict[str, list[float]] = {gene: [] for gene in indexes}
        cell_line_count = 0
        for row in reader:
            cell_line_count += 1
            for gene, index in indexes.items():
                if index >= len(row) or not row[index]:
                    continue
                try:
                    values[gene].append(float(row[index]))
                except ValueError:
                    continue

    missing_panel = [gene for gene in PANEL if gene not in values or not values[gene]]
    if missing_panel:
        raise RuntimeError('missing_panel_genes:' + ','.join(missing_panel))

    panel = {gene: gene_summary(values[gene]) for gene in PANEL}
    common_medians = [statistics.median(values[gene]) for gene in essential if gene in values and values[gene]]
    nonessential_medians = [statistics.median(values[gene]) for gene in nonessential if gene in values and values[gene]]
    common_median = statistics.median(common_medians)
    nonessential_median = statistics.median(nonessential_medians)
    separation = common_median - nonessential_median
    calibration_pass = common_median < nonessential_median - 0.5

    return {
        'datasetVersion': DATASET_VERSION,
        'datasetDoi': DATASET_DOI,
        'panelId': PANEL_ID,
        'panelGenes': list(PANEL),
        'cellLineCount': cell_line_count,
        'matrixGeneCount': len(header) - 1,
        'control': {
            'commonEssentialGeneCount': len(common_medians),
            'nonessentialGeneCount': len(nonessential_medians),
            'commonEssentialMedian': common_median,
            'nonessentialMedian': nonessential_median,
            'medianSeparation': separation,
            'predeclaredPass': calibration_pass,
            'criterion': 'common-essential median must be at least 0.5 lower than nonessential median',
        },
        'panel': panel,
        'artefacts': {name: EXPECTED_FILES[name] for name in sorted(EXPECTED_FILES)},
        'interpretationBoundary': [
            'Corrected CERES CRISPR gene-effect scores in cancer cell models; not patient observations.',
            'Descriptive panel analysis only; it does not establish causal senescence biology, target suitability, drug efficacy, safety, or clinical benefit.',
            'Results require independent replication and biological expert review before any follow-up experiment.',
        ],
    }


def main() -> None:
    try:
        request = json.loads(sys.stdin.read() or '{}')
    except json.JSONDecodeError as error:
        emit({'ok': False, 'error': f'bad_request:{error}'})
        return
    ok, reason, directory = verify_dataset()
    if request.get('cmd') == 'detect':
        emit({
            'ok': ok,
            'version': DATASET_VERSION if ok else None,
            'engine': 'DepMap 24Q2 CRISPR Gene Effect (Chronos/CERES)',
            'datasetDoi': DATASET_DOI,
            **({} if ok else {'error': reason}),
        })
        return
    if request.get('cmd') != 'senescence_panel':
        emit({'ok': False, 'error': 'unknown_command'})
        return
    if not ok or directory is None:
        emit({'ok': False, 'error': 'DATA_REQUIRED', 'reason': reason})
        return
    try:
        result = execute(directory)
        emit({'ok': True, 'data': result})
    except Exception as error:  # noqa: BLE001
        emit({'ok': False, 'error': 'execution_failed', 'reason': str(error)[:300]})


if __name__ == '__main__':
    main()
