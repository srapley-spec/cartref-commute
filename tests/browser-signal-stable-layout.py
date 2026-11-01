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
        const owner=times.closest('.opt');
        items.push({owner,times:[...times.querySelectorAll('.optbig')],facts:owner.querySelector('.journey-facts'),kind:owner.classList.contains('signal-alternative')?'next-best':'primary'});
      }
      for(const owner of document.querySelectorAll('#list .row[data-journey-service]')){
        if(owner.checkVisibility())items.push({owner,times:[...owner.querySelectorAll(':scope>.leave>.t,:scope>.arrive>.t,:scope>.exp>.t,:scope>.exp>.word')],facts:owner.querySelector('.journey-facts'),kind:'row'});
      }
      return items.map(({owner,times,facts,kind})=>{
        const total=facts?.querySelector('.journey-total-time'),train=facts?.querySelector('.journey-train-time');
        if(!total?.checkVisibility()||!train?.checkVisibility())throw Error('Duration not visible: '+owner.textContent);
        const timeBottom=Math.max(...times.map(e=>box(e).bottom)),badge=box(total);
        return {kind,key:owner.dataset.journeyService||owner.closest('[data-journey-service]')?.dataset.journeyService,
          x:badge.x,center:(badge.x+badge.right)/2,gap:badge.y-timeBottom,badge,train:box(train),text:total.innerText,
          trainMs:train.querySelector('[data-fact]')?.dataset.ms??null,totalMs:total.querySelector('[data-fact]')?.dataset.ms??null};
      });
    }''')


def full_recommendations(page, label):
    cards = page.locator('#hero>.opt')
    assert cards.count() == 2, (label, 'Both recommendations must remain present')
    sizes = []
    for card in cards.all():
        for selector in ['.optrow', '.journey-facts', '.optroute', '.journey-service', '.journey-countdown', '.steps>summary', '[data-follow]']:
            assert card.locator(selector).is_visible(), (label, 'A recommendation hides '+selector)
        assert card.locator('.journey-facts').count() == 1, (label, 'Duplicated duration facts')
        assert card.evaluate("e=>e.closest('details')===null"), (label, 'A recommendation is collapsed')
        sizes.append(card.locator('.optrow .optbig').evaluate_all("nodes=>nodes.map(e=>getComputedStyle(e).fontSize)"))
    assert sizes[0] == sizes[1], (label, 'The second recommendation uses smaller time text', sizes)
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'), (label, 'Page overflows')


def check(page, label, aligned=True, planning=True):
    rows = anchors(page)
    if planning:
        assert any(r['kind'] == 'primary' for r in rows), (label, 'Missing primary answer')
        assert any(r['kind'] == 'next-best' for r in rows), (label, 'Missing Next best')
        full_recommendations(page, label)
    assert len([r for r in rows if r['kind'] == 'row']) >= 5, (label, 'A loaded train disappeared')
    assert all(r['gap'] >= 3 for r in rows), (label, 'Duration is not below the time values', rows)
    center = page.viewport_size['width'] / 2
    assert all(abs(r['center']-center)<=1.5 for r in rows), (label, 'Total journey is not centred below the times', rows)
    assert all(r['text'].startswith('Total journey') for r in rows), (label, 'Total could be mistaken for time remaining', rows)
    assert all(abs((r['train']['x']+r['train']['right'])/2-center)<=1.5 and r['train']['y']>=r['badge']['bottom'] for r in rows), (label, 'Train duration competes with the total row', rows)
    if aligned:
        assert max(r['gap'] for r in rows) - min(r['gap'] for r in rows) <= 2.1, (label, 'Routes/actions displace duration', rows)
    expected_centers = page.evaluate('''()=>[...document.querySelectorAll('#hero .optrow.board>div:nth-child(2),#list .row>.exp')]
      .filter(e=>e.checkVisibility()).map(e=>{const r=document.createRange();r.selectNodeContents(e.querySelector('small'));const b=r.getBoundingClientRect();return (b.left+b.right)/2;})''')
    if aligned:
        assert all(abs(x-center)<=1.5 for x in expected_centers), (label, 'Expected departure moved from its centre column', expected_centers)
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'), (label, 'Page overflows')
    compact.assert_time_legibility(page, label)
    assert page.evaluate('''()=>[...document.querySelectorAll('[data-follow]')].filter(e=>e.checkVisibility()).every(e=>{
      const r=e.getBoundingClientRect();return r.width>=44&&r.height>=44;
    })'''), (label, 'Follow target is too small')
    for r in rows:
        if 'unavailable' in r['text'].lower():
            assert r['totalMs'] is None, (label, 'Unknown duration has an invented numeric value', r)
    return rows


def stress(page, label, planning=True, full_only=False):
    page.evaluate('''()=>{
      window.durationFonts=[...document.querySelectorAll('body,body *')].filter(e=>e.checkVisibility())
        .map(e=>({e,size:parseFloat(getComputedStyle(e).fontSize),prior:e.style.fontSize,priority:e.style.getPropertyPriority('font-size')}));
      for(const {e,size} of durationFonts)e.style.setProperty('font-size',size*2+'px','important');
    }''')
    try:
        result = full_recommendations(page, label + '-200') if full_only else check(page, label + '-200', aligned=False, planning=planning)
        page.screenshot(path=str(ART / f'signal-stable-{label}-200.png'), full_page=True)
        return result
    finally:
        page.evaluate('''()=>{for(const {e,prior,priority} of durationFonts){
          if(prior)e.style.setProperty('font-size',prior,priority);else e.style.removeProperty('font-size');
        }delete window.durationFonts;}''')


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
                assert [(r['kind'],r['key'],r['center'],r['gap'],r['totalMs'],r['trainMs']) for r in before] == [
                    (r['kind'],r['key'],r['center'],r['gap'],r['totalMs'],r['trainMs']) for r in changed
                ], (label, 'Platform text changed the duration anchor or value')
                assert page.locator('#hero .signal-alternative [data-follow]').is_visible()
                summary = page.locator('#hero .signal-alternative .steps>summary')
                summary.click()
                expanded = check(page, label + '-expanded')
                assert before[1]['center'] == expanded[1]['center'] and before[1]['gap'] == expanded[1]['gap'], (label, 'Opening Next best journey steps moves duration')
                assert page.locator('#hero .signal-alternative [data-follow]').is_visible()
                assert page.locator('#hero .signal-alternative .legs').is_visible()
                page.evaluate('__commute.render()')
                assert page.locator('#hero .signal-alternative .steps').get_attribute('open') is not None
                check(page, label + '-refreshed')
                summary.click()
                enlarged = stress(page, label)
                page.locator('[data-journey-view="live"]').click()
                live = check(page, label + '-live', planning=False)
                page.screenshot(path=str(ART / f'signal-stable-{label}-live.png'), full_page=True)
                live_enlarged = stress(page, label + '-live', planning=False)
                # Normal location evidence enters the real station-board layout.
                page.locator('[data-journey-view="auto"]').click()
                page.evaluate('''()=>{
                  const s=__commute.state,now=Date.now();
                  Object.assign(s,{here:[51.9799,-.2290],locAcc:12,locStatus:'ok',lastFixAt:now,lastFixRecvAt:now,onLine:false,atHub:null});
                  __commute.render();
                }''')
                station = check(page, label + '-station')
                assert page.locator('#hero .optrow.board').count(), (label, 'Station times were not reached')
                station_enlarged = stress(page, label + '-station')
                page.locator('#list [data-follow]:not([disabled])').first.click()
                follow = page.locator('#followPanel .journey-total-time').first
                assert follow.is_visible() and follow.inner_text().startswith('Total journey')
                bounds=follow.bounding_box()
                assert abs(bounds['x']+bounds['width']/2-width/2)<=1.5, (label, 'Follow total lost its centre anchor')
                # The user's earlier Thameslink is a full alternative to the latest-leaving Great Northern.
                page.evaluate('''()=>{
                  const c=__commute,s=c.state,T=h=>Date.parse('2026-11-04T'+h+':00Z');
                  const train=(to,std,arr,operator,id)=>({from:'LET',to,std,dep:T(std),arr:T(arr),operator,serviceId:id,
                    platform:'',timetable:true,depLate:0,arrLate:0,cancelled:false,depUnknown:false,arrUnknown:false,reason:''});
                  s.saved.followRoute=null;s.saved.viewOverride=null;s.saved.view='by';s.saved.pace='fast';
                  s.here=s.saved.home.slice();s.onLine=false;s.atHub=null;
                  s.by={T:T('08:30'),live:false,failed:{},boards:{
                    'LET-KGX':{services:[train('KGX','07:30','08:03','Great Northern','gn0730')],msgs:[]},
                    'LET-STP':{services:[train('STP','07:20','07:59','Thameslink','tl0720')],msgs:[]},
                    'LET-ZFD':{services:[train('ZFD','07:20','08:04','Thameslink','tl0720')],msgs:[]}}};
                  document.querySelector('#byDate').value='2026-11-04';document.querySelector('#byTime').value='08:30';c.render();
                }''')
                full_recommendations(page, label + '-tomorrow')
                assert '07:20' in page.locator('#hero .signal-alternative .journey-service').inner_text()
                compact.assert_time_legibility(page, label + '-tomorrow')
                page.screenshot(path=str(ART / f'signal-full-recommendations-{label}.png'), full_page=True)
                stress(page, label + '-tomorrow', full_only=True)
                assert not errors, (label, errors)
                results.append({'label':label,'normal':before,'platforms':changed,'enlarged':enlarged,
                    'live':live,'liveEnlarged':live_enlarged,'station':station,'stationEnlarged':station_enlarged})
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
                'checks':'centred Total journey, separate train duration, unchanged Expected column, Plan/Live/station/Follow, long/absent platforms, unknown durations, expansion, refresh, 200% text, touch targets'}, indent=2))
        finally:
            browser.close()
