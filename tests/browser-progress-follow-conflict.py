"""Replay the reported different-Follow progress bug through real Chromium controls."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ART = Path(os.environ.get('PROGRESS_ARTIFACT_DIR', '/workspace/scratch/progress-browser'))
ART.mkdir(parents=True, exist_ok=True)
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('clarity', ROOT / 'tests/browser-signal-journey-clarity.py')
clarity = importlib.util.module_from_spec(spec)
spec.loader.exec_module(clarity)


def check(page):
    actual = page.evaluate('__commute.readSimulationActual()')
    assert actual['train']['serviceId'] == 'SIM-GN-0905', actual
    assert actual['follow']['serviceId'] == 'SIM-GN-LATER-0917', actual
    assert actual['railProgress']['kind'] == 'rail', actual
    assert all(code in actual['railProgress']['displayedReports'] for code in ['HIT', 'SVG']), actual
    assert page.locator('.jp-leg[aria-current=step] .jp-leg-name').inner_text() == 'Train'
    assert page.locator('.jp-leg[aria-current=step] .jp-leg-state').inner_text() == 'Now'
    assert page.locator('.jp-leg[data-state=complete] .jp-leg-state').inner_text() == 'Done'
    assert 'Reported' in page.locator('.jp-stop[data-code=HIT]').inner_text()
    states = page.locator('.jp-leg').evaluate_all('''legs => legs.map(leg => {
      const bar=leg.querySelector('.jp-leg-bar'),fill=bar.querySelector('i'),caption=leg.querySelector('.jp-leg-caption');
      return {state:leg.dataset.state,color:getComputedStyle(fill).backgroundColor,
        fraction:fill.getBoundingClientRect().width/bar.getBoundingClientRect().width,
        bottom:caption.getBoundingClientRect().bottom};
    })''')
    assert states[0]['color'] != states[1]['color'], states
    assert 0 < states[1]['fraction'] < 1, states
    top = page.locator('.jp-current').evaluate('(e)=>e.getBoundingClientRect().top')
    assert max(s['bottom'] for s in states) <= top, states
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
    assert page.evaluate('__commute.simulator.getView().verification.current.assertions.find(a=>a.id==="rail-calling-reports").status') == 'PASS'
    return states


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), args=['--no-sandbox'])
    results = []
    build_hash = hashlib.sha256((ROOT / 'index.html').read_bytes()).hexdigest()
    for theme in ['light', 'dark']:
        for width in [320, 393, 1280]:
            server, context, page, errors = clarity.compact.boot(browser, ROOT, theme, width)
            try:
                page.locator('#journeySimulatorBtn').click()
                page.locator('#journeyAdvancedButton').click()
                page.locator('#simDate').fill('2026-11-03T06:30')
                page.locator('#journeyModeButton').click()
                page.locator('#journeyStart').click()
                clarity.settle(page)
                key = page.evaluate('''[...__commute.followChoices].find(([,o])=>o.train.serviceId==='SIM-GN-LATER-0917')[0]''')
                page.locator(f'#list [data-follow={json.dumps(key)}]').click()
                clarity.settle(page)
                for _ in range(4):
                    clarity.next_checkpoint(page)
                normal = check(page)
                clarity.assert_accessible(page, f'{theme}-{width}')
                page.locator('#hero .journey-progress').screenshot(path=str(ART / f'progress-{theme}-{width}.png'))
                page.evaluate('''() => {
                  const sizes=[...document.querySelectorAll('body,body *')].filter(e=>e.checkVisibility()).map(e=>[e,parseFloat(getComputedStyle(e).fontSize)]);
                  for(const [e,size] of sizes)e.style.setProperty('font-size',size*2+'px','important');
                }''')
                enlarged = check(page)
                page.locator('#hero .journey-progress').screenshot(path=str(ART / f'progress-{theme}-{width}-200.png'))
                assert not errors, errors
                results.append({'theme':theme,'width':width,'normal':normal,'enlarged':enlarged})
                print(f'PASS {theme} {width}px, normal and enlarged text', flush=True)
            finally:
                context.close()
                server.shutdown()
    assert hashlib.sha256((ROOT / 'index.html').read_bytes()).hexdigest() == build_hash
    (ART / 'results.json').write_text(json.dumps({'buildSha256':build_hash,'cases':results}, indent=2))
    browser.close()
