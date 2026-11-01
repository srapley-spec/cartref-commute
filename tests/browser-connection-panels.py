"""Production journey/connection geometry at 320/393 px, light/dark and 200% text.

Run after npm run build. Uses the real controller and deterministic existing transport fixtures.
Optional CONNECTION_BASELINE points to a directory containing the previous index.html for Live comparison.
"""
import hashlib
import importlib.util
import json
import os
import subprocess
from pathlib import Path
import sys
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ART = Path(os.environ.get('CONNECTION_ARTIFACT_DIR', '/workspace/scratch/journey-connection-panels'))
ART.mkdir(parents=True, exist_ok=True)
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('compact', ROOT / 'tests/browser-signal-compact.py')
compact = importlib.util.module_from_spec(spec)
spec.loader.exec_module(compact)


def inspect(page, label):
    result = page.evaluate('''() => {
      const shown=e=>e.checkVisibility()&&![...function*(n){for(;n;n=n.parentElement)yield n;}(e)]
        .some(n=>n.tagName==='DETAILS'&&!n.open&&!n.querySelector(':scope>summary')?.contains(e));
      const box=e=>{const b=e.getBoundingClientRect();return {x:b.x,y:b.y,right:b.right,bottom:b.bottom};};
      const owners=[...document.querySelectorAll('#hero>.opt,#list>.journey-row,#followPanel,.follow-alternative,#tripResults .trip-row,.trip-follow-connections,#tripResults .trip-headline')].filter(shown);
      const collisions=[];
      const panels=owners.flatMap(owner=>[...owner.querySelectorAll('.journey-connection')].filter(shown).map(panel=>{
        const leaves=[...panel.querySelectorAll('.connection-heading,[data-connection-time],.connection-clock>small,.connection-operator,.connection-destination,.plat,.connection-status')].filter(shown);
        for(let i=0;i<leaves.length;i++)for(let k=i+1;k<leaves.length;k++){
          const a=box(leaves[i]),b=box(leaves[k]);
          if(Math.min(a.right,b.right)-Math.max(a.x,b.x)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>1)
            collisions.push([leaves[i].innerText,leaves[k].innerText]);
        }
        const bounds=box(panel);
        for(const leaf of leaves){const b=box(leaf);if(b.x<bounds.x-1||b.right>bounds.right+1)throw Error('Connection detail escapes panel: '+leaf.innerText);}
        const scheduled=panel.querySelector('[data-connection-time="scheduled"]'),expected=panel.querySelector('[data-connection-time="expected"]');
        if(!scheduled||!shown(scheduled)||!scheduled.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}))throw Error('Scheduled connection clock is concealed');
        if(expected&&(!shown(expected)||!expected.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})))throw Error('Expected connection clock is concealed');
        const scale=window.connectionFonts?2:1,minSize=(panel.closest('.journey-row')?30:36)*scale;
        if(parseFloat(getComputedStyle(scheduled).fontSize)<minSize-.1)throw Error('Connection clock lost prominence: '+getComputedStyle(scheduled).fontSize+' < '+minSize+'px');
        if(expected&&getComputedStyle(scheduled).fontSize!==getComputedStyle(expected).fontSize)throw Error('Expected and Scheduled use different sizes');
        return {text:panel.innerText,size:getComputedStyle(scheduled).fontSize};
      }));
      const headlines=owners.map(owner=>owner.querySelector('.journey-heading')).filter(Boolean);
      for(const heading of headlines){
        if(!shown(heading))throw Error('Journey headline is concealed');
        const values=[...heading.querySelectorAll('.optbig')];
        if(values.some(e=>!shown(e)))throw Error('Hidden journey clock');
        if(heading.hasAttribute('data-fact')){
          if(Number(heading.querySelector('[data-cd]').dataset.cd)!==Number(heading.dataset.ms))throw Error('Leave countdown differs from Leave by');
        }
        const [a,b]=values.map(box);
        if(a&&b&&Math.min(a.right,b.right)-Math.max(a.x,b.x)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>1)throw Error('Journey clocks overlap');
      }
      const controls=[...document.querySelectorAll('[data-follow],[data-follow-action],.steps>summary,[data-trip-follow],[data-trip-stop],.trip-steps>summary')].filter(shown);
      for(const e of controls){const b=e.getBoundingClientRect();if(b.width<43.9||b.height<43.9)throw Error('Action below 44 px: '+e.innerText);}
      if(document.documentElement.scrollWidth>innerWidth+1)throw Error('Horizontal overflow');
      return {panels,headlines:headlines.length,collisions,width:innerWidth};
    }''')
    assert result['panels'], (label, 'No connection panels')
    assert not result['collisions'], (label, result['collisions'])
    return result


def enlarge(page, enabled):
    if enabled:
        page.evaluate('''()=>{
          window.connectionFonts=[...document.querySelectorAll('body,body *')].filter(e=>e.checkVisibility())
            .map(e=>({e,size:parseFloat(getComputedStyle(e).fontSize),prior:e.style.fontSize,priority:e.style.getPropertyPriority('font-size')}));
          for(const {e,size} of connectionFonts)e.style.setProperty('font-size',size*2+'px','important');
        }''')
    else:
        page.evaluate('''()=>{for(const {e,prior,priority} of connectionFonts){if(prior)e.style.setProperty('font-size',prior,priority);else e.style.removeProperty('font-size');}delete window.connectionFonts;}''')


def live_snapshot(browser, root):
    server, context, page, errors = compact.boot(browser, root)
    try:
        compact.inject(page)
        page.locator('[data-journey-view="live"]').click()
        assert page.locator('#hero .journey-connection,#list .journey-connection').count() == 0
        assert page.locator('#list .row.board .exp').count() > 0
        assert not errors, errors
        return page.evaluate("({hero:document.querySelector('#hero').innerHTML,list:document.querySelector('#list').innerHTML})")
    finally:
        context.close()
        server.shutdown()


def trip_scene(browser, theme, width):
    server, context, page, errors = compact.boot(browser, ROOT, theme, width, epoch='2026-11-03T10:00:00Z')
    try:
        # Compare actual computed production styles, not a second set of Trip CSS.
        style_probe = '''s=>{
          const row=document.querySelector(s),rules={card:'',leave:'.journey-times>div:first-child .optbig',arrival:'.journey-times>div:last-child .optbig',
            total:'.journey-total-time',caption:'.journey-train-time',panel:'.journey-connection',clock:'[data-connection-time="scheduled"]',button:'.follow-btn'};
          return Object.fromEntries(Object.entries(rules).map(([key,selector])=>{
            const e=selector?row.querySelector(selector):row,c=getComputedStyle(e);
            return [key,Object.fromEntries(['display','fontSize','fontWeight','lineHeight','padding','borderRadius','backgroundColor','rowGap','columnGap','gridColumn'].map(p=>[p,c[p]]))];
          }));
        }'''
        commute_card = page.evaluate(style_probe, '#hero>.journey-option')
        commute_row = page.evaluate(style_probe, '#list>.journey-row.best')
        stub = json.loads(subprocess.check_output(['node', '--input-type=module', '-e',
            "import {stubGoogle,TRIP_PLACES,TRIP_REPLY_WITH_NEXT_BEST} from './tests/trip-fixtures.mjs';console.log(JSON.stringify({fn:stubGoogle.toString(),places:TRIP_PLACES,fixture:TRIP_REPLY_WITH_NEXT_BEST}));"], cwd=ROOT, text=True))
        fixture = stub['fixture']
        page.evaluate("s=>{window.TRIP_PLACES=s.places;(0,eval)('('+s.fn+')(window)');}", stub)
        def planner(route):
            good = '/90000899/to/1001160' in route.request.url
            route.fulfill(status=200 if good else 404, content_type='application/json', body=json.dumps(fixture if good else {'message':'No journey found'}))
        page.route('**/JourneyResults/**', planner)
        page.evaluate("()=>{Object.assign(__commute.state.saved.settings,{trip:true,googleKey:'fixture-only',tflKey:'fixture-only'});__commute.render();}")
        page.locator('#signalAdjustments>summary').click()
        page.locator('#tripModeBtn').click()
        for end, text, name in [('from', 'brighton station', 'Brighton Station'), ('to', 'canterbury cath', 'Canterbury Cathedral')]:
            field = page.locator('#tripInput-' + end)
            field.fill(text)
            page.locator('#tripList-' + end + ' [role=option]').filter(has_text=name).first.wait_for(state='visible')
            field.press('ArrowDown')
            field.press('Enter')
        try:
            page.locator('#tripResults .trip-row').first.wait_for(state='visible', timeout=10000)
        except Exception:
            print(json.dumps({'tripResults':page.locator('#tripResults').inner_text(),'stage':page.locator('#tripStage').inner_text(),'errors':errors}), flush=True)
            raise
        label = f'trip-{theme}-{width}'
        normal = inspect(page, label)
        assert page.locator('.trip-recommendations>.journey-option').count() == 2
        assert page.evaluate(style_probe, '.trip-recommendations>.journey-option') == commute_card, 'Trip recommendation styles diverged from Auto/Plan'
        trip_row = page.evaluate(style_probe, '.trip-list>.journey-row.best')
        assert trip_row == commute_row, ('Trip list styles diverged from Auto/Plan', {k:(commute_row[k],trip_row[k]) for k in commute_row if commute_row[k] != trip_row[k]})
        sizes = page.locator('.trip-recommendations>.journey-option').evaluate_all("rows=>rows.map(row=>[...row.querySelectorAll('.optbig,[data-connection-time]')].map(e=>getComputedStyle(e).fontSize))")
        assert sizes[0] == sizes[1], 'Next best lost equal clock prominence'
        assert page.locator('#tripResults>.trip-headline').count() == 0, 'Trip repeats the planning headline'
        for card in page.locator('.trip-recommendations>.journey-option').all():
            positions = card.evaluate("e=>{const a=e.querySelector('.steps>summary').getBoundingClientRect(),b=e.querySelector('.follow-btn').getBoundingClientRect();return {stepsRight:a.right,buttonLeft:b.left,stepsMiddle:(a.top+a.bottom)/2,buttonMiddle:(b.top+b.bottom)/2};}")
            assert positions['stepsRight'] <= positions['buttonLeft'], 'Trip Follow competes with Journey steps'
            assert abs(positions['stepsMiddle'] - positions['buttonMiddle']) < 1, 'Trip action alignment diverged'
        row = page.locator('#tripResults .trip-row').filter(has_text='3 changes').first
        page.locator('.trip-recommendations').screenshot(path=str(ART / f'implemented-trip-{theme}-{width}.png'))
        if theme == 'dark' and width == 393:
            row.screenshot(path=str(ART / 'implemented-multiple-connections.png'))
        enlarge(page, True)
        try:
            large = inspect(page, label + '-200')
        finally:
            enlarge(page, False)
        row.locator('.steps>summary').click()
        page.locator('#refreshBtn').click()
        assert row.locator('.steps').evaluate('e=>e.open'), 'Refresh closed the Trip itinerary being read'
        inspect(page, label + '-expanded')
        row.locator('[data-trip-follow]').click()
        page.locator('[data-trip-stop]').wait_for(state='visible')
        following = inspect(page, label + '-follow')
        enlarge(page, True)
        try:
            inspect(page, label + '-follow-200')
        finally:
            enlarge(page, False)
        assert page.evaluate("Date.now()===Date.parse('2026-11-03T10:00:00Z')"), 'Trip fixture clock changed after source/session setup'
        assert page.locator('#tripResults .journey-heading [data-cd]').first.inner_text().startswith('leave in 2m'), 'Trip fixture countdown uses the wrong clock'
        assert page.locator('.trip-follow-connections .journey-connection').count() == 4
        assert not errors, errors
        return {'state': label, 'normal': normal, 'enlarged': large, 'following': following}
    finally:
        context.close()
        server.shutdown()


def run(browser):
    build_hash = hashlib.sha256((ROOT / 'index.html').read_bytes()).hexdigest()
    results = []
    for theme in ['light', 'dark']:
        for width in [320, 393]:
            server, context, page, errors = compact.boot(browser, ROOT, theme, width)
            try:
                compact.inject(page)
                for mode in ['auto', 'plan']:
                    page.locator(f'[data-journey-view="{mode}"]').click()
                    for status in ['on-time', 'delayed', 'timetable', 'unknown']:
                        page.evaluate('''status=>{
                          const s=__commute.state,t=s.boards['LET-KGX'].services[0],T=h=>Date.parse('2026-11-03T'+h+':00Z');
                          Object.assign(t,{dep:T('04:55'),arr:T('05:46'),depLate:0,arrLate:0,timetable:false,depUnknown:false});
                          if(status==='delayed'){t.dep+=5*60000;t.arr+=5*60000;t.depLate=t.arrLate=5;}
                          if(status==='timetable')t.timetable=true;
                          if(status==='unknown')t.depUnknown=true;
                          __commute.render();
                        }''', status)
                        label = f'{theme}-{width}-{mode}-{status}'
                        normal = inspect(page, label)
                        if theme == 'dark' and width == 393 and mode == 'auto' and status in ['on-time', 'delayed']:
                            page.locator('#hero').screenshot(path=str(ART / f'implemented-{status}.png'))
                        enlarge(page, True)
                        try:
                            large = inspect(page, label + '-200')
                        finally:
                            enlarge(page, False)
                        results.append({'state': label, 'normal': normal, 'enlarged': large})
                page.locator('[data-journey-view="auto"]').click()
                page.locator('#hero [data-follow]:not([disabled])').first.click()
                inspect(page, f'{theme}-{width}-follow')
                page.locator('[data-journey-view="plan"]').click()
                page.locator('#hero .signal-alternative .steps>summary').click()
                page.evaluate('__commute.render()')
                assert page.locator('#hero .signal-alternative .steps').evaluate('e=>e.open')
                inspect(page, f'{theme}-{width}-expanded-refresh')
                assert not errors, errors
            finally:
                context.close()
                server.shutdown()
    trips = [trip_scene(browser, theme, width) for theme in ['light', 'dark'] for width in [320, 393]]
    baseline = os.environ.get('CONNECTION_BASELINE')
    if baseline:
        assert live_snapshot(browser, Path(baseline)) == live_snapshot(browser, ROOT), 'Explicit Live changed from the approved previous build'
    assert hashlib.sha256((ROOT / 'index.html').read_bytes()).hexdigest() == build_hash, 'Build changed during browser checks'
    report = {'buildSha256': build_hash, 'states': results, 'tripScenes': trips, 'liveMatchesBaseline': bool(baseline)}
    (ART / 'browser-results.json').write_text(json.dumps(report, indent=2))
    print(json.dumps({'states': len(results), 'enlargedStates': len(results), 'followAndRefreshScenes': 8, 'tripScenes': len(trips), 'liveMatchesBaseline': bool(baseline)}))


if __name__ == '__main__':
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), args=['--no-sandbox'])
        try:
            run(browser)
        finally:
            browser.close()
