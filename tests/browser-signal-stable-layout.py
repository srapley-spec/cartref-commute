"""Check actual Signal duration anchors against route, platform and action size.

Run after npm run build: python tests/browser-signal-stable-layout.py.
Uses the production page and engine with the existing deterministic rail fixture.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ART = Path(os.environ.get('SIGNAL_LAYOUT_ARTIFACT_DIR', '/workspace/scratch'))
ART.mkdir(parents=True, exist_ok=True)
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('compact', ROOT / 'tests/browser-signal-compact.py')
compact = importlib.util.module_from_spec(spec)
spec.loader.exec_module(compact)


def anchors(page):
    return page.evaluate('''() => {
      const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};};
      const items=[];
      for(const times of document.querySelectorAll('#hero .optrow')){
        if(!times.checkVisibility())continue;
        const owner=times.closest('summary')||times.closest('.opt');
        items.push({owner,times:[...times.querySelectorAll('.optbig')],facts:owner.querySelector('.journey-facts'),kind:owner.tagName==='SUMMARY'?'next-best':'primary'});
      }
      for(const owner of document.querySelectorAll('#list .row[data-journey-service]')){
        if(owner.checkVisibility())items.push({owner,times:[...owner.querySelectorAll(':scope>.leave>.t,:scope>.arrive>.t,:scope>.exp>.t,:scope>.exp>.word')],facts:owner.querySelector('.journey-facts'),kind:'row'});
      }
      return items.map(({owner,times,facts,kind})=>{
        const total=facts?.querySelector('.journey-total-time'),train=facts?.querySelector('.journey-train-time');
        if(!total?.checkVisibility()||!train?.checkVisibility())throw Error('Duration not visible: '+owner.textContent);
        const timeBottom=Math.max(...times.map(e=>box(e).bottom)),badge=box(total);
        return {kind,key:owner.dataset.journeyService||owner.closest('[data-journey-service]')?.dataset.journeyService,
          x:badge.x,gap:badge.y-timeBottom,badge,train:box(train),text:total.innerText,
          trainMs:train.querySelector('[data-fact]')?.dataset.ms??null,totalMs:total.querySelector('[data-fact]')?.dataset.ms??null};
      });
    }''')


def check(page, label, aligned=True):
    rows = anchors(page)
    assert any(r['kind'] == 'primary' for r in rows), (label, 'Missing primary answer')
    assert any(r['kind'] == 'next-best' for r in rows), (label, 'Missing Next best')
    assert len([r for r in rows if r['kind'] == 'row']) >= 5, (label, 'A loaded train disappeared')
    assert all(r['gap'] >= 3 for r in rows), (label, 'Duration is not below the time values', rows)
    assert max(r['x'] for r in rows) - min(r['x'] for r in rows) <= 1.5, (label, 'Total has different left anchors', rows)
    if aligned:
        assert max(r['gap'] for r in rows) - min(r['gap'] for r in rows) <= 2.1, (label, 'Routes/actions displace duration', rows)
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'), (label, 'Page overflows')
    compact.assert_time_legibility(page, label)
    assert page.evaluate('''()=>[...document.querySelectorAll('[data-follow]')].filter(e=>e.checkVisibility()).every(e=>{
      const r=e.getBoundingClientRect();return r.width>=44&&r.height>=44;
    })'''), (label, 'Follow target is too small')
    for r in rows:
        if 'unavailable' in r['text'].lower():
            assert r['totalMs'] is None, (label, 'Unknown duration has an invented numeric value', r)
    return rows


def run(browser):
    build_hash = hashlib.sha256((ROOT / 'index.html').read_bytes()).hexdigest()
    results = []
    for theme in ['light', 'dark']:
        for width in [320, 393, 430]:
            server, context, page, errors = compact.boot(browser, ROOT, theme, width)
            label = f'{theme}-{width}'
            try:
                compact.inject(page)
                before = check(page, label)
                page.screenshot(path=str(ART / f'signal-stable-{label}.png'), full_page=True)
                # Change only platform evidence, not the canonical route or timings.
                page.evaluate('''()=>{
                  for(const [i,board] of Object.values(__commute.state.boards).entries())
                    for(const t of board.services)t.platform=i%2?'':'10 / 11 (check station displays)';
                  __commute.render();
                }''')
                changed = check(page, label + '-platforms')
                assert [(r['kind'],r['key'],r['x'],r['gap'],r['totalMs'],r['trainMs']) for r in before] == [
                    (r['kind'],r['key'],r['x'],r['gap'],r['totalMs'],r['trainMs']) for r in changed
                ], (label, 'Platform text changed the duration anchor or value')
                summary = page.locator('#hero .signal-alternative>summary')
                summary.click()
                expanded = check(page, label + '-expanded')
                assert before[1]['x'] == expanded[1]['x'] and before[1]['gap'] == expanded[1]['gap'], (label, 'Expanding Next best moves duration')
                assert page.locator('#hero .signal-alternative .opt [data-follow]').is_visible()
                page.locator('#hero .signal-alternative .steps>summary').click()
                assert page.locator('#hero .signal-alternative .legs').is_visible()
                page.evaluate('__commute.render()')
                assert page.locator('#hero .signal-alternative').get_attribute('open') is not None
                assert page.locator('#hero .signal-alternative .steps').get_attribute('open') is not None
                check(page, label + '-refreshed')
                summary.click()
                # Stress the actual computed sizes, including the duration labels.
                page.evaluate('''()=>{
                  const sizes=[...document.querySelectorAll('body,body *')].filter(e=>e.checkVisibility()).map(e=>[e,parseFloat(getComputedStyle(e).fontSize)]);
                  for(const [e,size] of sizes)e.style.setProperty('font-size',size*2+'px','important');
                }''')
                enlarged = check(page, label + '-200', aligned=False)
                page.screenshot(path=str(ART / f'signal-stable-{label}-200.png'), full_page=True)
                assert not errors, (label, errors)
                results.append({'label':label,'normal':before,'platforms':changed,'enlarged':enlarged})
            finally:
                context.close()
                server.shutdown()
    assert hashlib.sha256((ROOT / 'index.html').read_bytes()).hexdigest() == build_hash, 'Build changed during review'
    report = {'buildSha256':build_hash,'cases':results}
    (ART / 'signal-stable-layout-results.json').write_text(json.dumps(report, indent=2))
    return report


if __name__ == '__main__':
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), args=['--no-sandbox'])
        try:
            report = run(browser)
            print(json.dumps({'buildSha256':report['buildSha256'],'cases':len(report['cases']),
                'checks':'duration anchors, long/absent platforms, long routes, disabled Follow, unknown durations, expansion, refresh, 200% text, touch targets'}, indent=2))
        finally:
            browser.close()
