"""Documentation-only regression assertions; no services or credentials used."""
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
# How to run: python3 validate.py current|history|links
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[3]
MODE = sys.argv[1]

def check_current() -> None:
    index = (ROOT / 'docs/plan/README.md').read_text()
    assert 'This is a proposed implementation plan, not shipped functionality.' not in index, 'current: production index still describes implemented zone feature as proposed-only'
    roadmap = ROOT / 'docs/plan/current-state.md'
    assert roadmap.is_file(), 'current: current-state roadmap is missing'
    text = roadmap.read_text()
    for marker in ('MOB-29', 'QA-07', 'WEB-28', 'WEB-29', 'SYNC-01', '2026-10-15'):
        assert marker in text, f'current: roadmap lacks {marker}'
    assert 'backend/WEB-FLOW-PLAN.md' in text, 'current: roadmap must distinguish backend web-flow plan'

def check_history() -> None:
    paths = sorted((ROOT / 'docs/reviews').glob('zone-boundaries-2026-10-*/*.md'))
    paths += [ROOT / 'docs/reviews/ci-and-hosted-data-2026-10-14.md']
    for path in paths:
        text = path.read_text()
        assert 'historical' in text[:1800].lower(), f'history: {path.relative_to(ROOT)} lacks historical notice'
        assert 'current-state.md' in text[:1800], f'history: {path.relative_to(ROOT)} lacks current roadmap link'

def check_links() -> None:
    tracked = subprocess.check_output(['git', 'diff', '--name-only', '--', '*.md'], cwd=ROOT, text=True).splitlines()
    untracked = subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard', '--', '*.md'], cwd=ROOT, text=True).splitlines()
    errors = []
    from urllib.parse import unquote
    for name in sorted(set(tracked + untracked)):
        path = ROOT / name
        if not path.is_file():
            continue
        prose = re.sub(r'```.*?```|`[^`\n]+`', '', path.read_text(), flags=re.S)
        for target in re.findall(r'(?<!!)\[[^\]\n]+\]\(([^)\n]+)\)', prose):
            target = re.sub(r':\d+$', '', target.split('#', 1)[0].strip('<>'))
            if not target or re.match(r'^[a-zA-Z][a-zA-Z0-9+.-]*:', target):
                continue
            resolved = path.parent / unquote(target)
            if not resolved.exists():
                errors.append(f'{name}: {target}')
    assert not errors, 'links: missing local targets:\n' + '\n'.join(errors)

{'current': check_current, 'history': check_history, 'links': check_links}[MODE]()
print(f'PASS {MODE}: documentation assertions hold')
