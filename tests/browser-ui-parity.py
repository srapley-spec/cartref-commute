"""Native Chromium regression checks for the supported UI parity contract.

Run after npm run build: python tests/browser-ui-parity.py.
The real application uses controlled transport observations; no live keys.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys
from playwright.sync_api import sync_playwright

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
ART = Path(os.environ.get('UI_PARITY_ARTIFACT_DIR', '/workspace/scratch'))
ART.mkdir(parents=True, exist_ok=True)
DESIGNS = json.loads((ROOT / 'config/ui-parity.json').read_text())['designs']


def module(name, file):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'tests' / file)
    loaded = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(loaded)
    return loaded


compact = module('compact', 'browser-signal-compact.py')
clarity = module('clarity', 'browser-signal-journey-clarity.py')


def design_setting(page, design):
    page.locator('#settingsBtn').click()
    for setting, value in design['settings'].items():
        control = page.locator('#s_' + setting)
        if isinstance(value, bool):
            control.set_checked(value)
        else:
            control.select_option(str(value))
    page.locator('#saveBtn').click()
    page.wait_for_function("!document.querySelector('#settings').open")
    assert page.locator('html').get_attribute('data-design') == design['id']


def expected_facts(page):
    """Independent raw itinerary intervals; the renderer's fact helper is not called."""
    return page.evaluate('''() => {
      const c=__commute;
      const key=t=>[t.from,t.to,t.std,t.operator].join('|');
      const unknown=t=>t.cancelled||t.depUnknown||t.arrUnknown||t.arr==null;
      const out={};
      for(const board of Object.values(c.state.boards||{}))for(const t of board?.services||[])
        out[key(t)]={trainMs:unknown(t)?null:t.arr-t.dep,totalMs:null,first:[]};
      for(const o of c.ranked(Date.now()).flatMap(o=>[o,...(o.alts||[])]))out[key(o.train)]={
        trainMs:unknown(o.train)?null:o.train.arr-o.train.dep,
        totalMs:unknown(o.train)?null:o.arrive-o.leave,
        first:o.flags.filter(f=>f.txt.startsWith('Arrives first')).map(f=>f.txt),
        service:o.train.serviceId,std:o.train.std,arrive:o.arrive,leave:o.leave
      };
      return out;
    }''')


def displayed_facts(page, scope='#list'):
    return page.evaluate('''scope => {
      const visible=e=>{if(!e||!e.checkVisibility())return false;for(let p=e;p;p=p.parentElement){
        if(p.tagName==='DETAILS'&&!p.open&&!p.querySelector(':scope>summary')?.contains(e))return false;
      }return true;};
      const target=document.querySelector(scope);
      const roots=[...(target?.matches('[data-journey-service]')?[target]:[]),...document.querySelectorAll(scope+' [data-journey-service]')].filter(node=>
        node.querySelector('[data-fact="train-duration"],[data-fact="total-duration"]'));
      return roots.map(node=>({key:node.dataset.journeyService,shown:visible(node),text:node.innerText,
        facts:[...node.querySelectorAll('[data-fact="train-duration"],[data-fact="total-duration"]')]
          .filter(f=>f.closest('[data-journey-service]')===node)
          .map(f=>({kind:f.dataset.fact,ms:f.dataset.ms??null,text:f.innerText,shown:visible(f)})),
        first:[...node.querySelectorAll('.pill')].filter(visible).map(f=>f.innerText).filter(text=>text.startsWith('Arrives first'))
      })).filter(node=>node.facts.length);
    }''', scope)


def assert_option_facts(page, label, scope='#list', require_fastest=True):
    expected = expected_facts(page)
    actual = displayed_facts(page, scope)
    shown = [row for row in actual if row['shown']]
    assert shown, (label, 'No visible semantic journey facts', scope, actual)
    for row in shown:
        assert row['key'] in expected, (label, 'Displayed service has no canonical itinerary/board observation', row)
        fact = expected[row['key']]
        for kind, field in [('train-duration', 'trainMs'), ('total-duration', 'totalMs')]:
            matches = [value for value in row['facts'] if value['kind'] == kind]
            assert matches, (label, row['key'], 'Missing duration', kind)
            for value in matches:
                assert value['shown'], (label, row['key'], 'Duration exists only in hidden detail', value)
                expected_ms = fact[field]
                assert (None if value['ms'] in ['', None] else float(value['ms'])) == expected_ms, (label, row['key'], kind, value, fact)
                assert value['text'].strip(), (label, row['key'], 'An empty numeric data attribute is not readable duration')
                if expected_ms is not None:
                    text = page.evaluate('ms=>CommuteCore.dur(ms)', expected_ms)
                    assert text in value['text'], (label, row['key'], 'Visible duration differs from canonical interval', value, text)
                else:
                    assert '0 min' not in value['text'].lower(), (label, 'Unknown duration became zero', value)
        if require_fastest:
            assert row['first'] == fact['first'], (label, row['key'], 'Earliest-arrival flags differ between views', row['first'], fact['first'])
    return shown


def layout(page, label, design, enlarged=False):
    result = page.evaluate('''() => {
      const visible=e=>e&&e.checkVisibility();
      const collisions=[];
      for(const row of document.querySelectorAll('#hero .optrow,#list .row')){
        const fields=[...row.querySelectorAll('.optbig,.leave>.t,.exp>.t,.exp>.word,.arrive>.t,.follow-btn')].filter(visible);
        for(let i=0;i<fields.length;i++)for(let j=i+1;j<fields.length;j++){
          if(fields[i].contains(fields[j])||fields[j].contains(fields[i]))continue;
          const a=fields[i].getBoundingClientRect(),b=fields[j].getBoundingClientRect();
          if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1)
            collisions.push([fields[i].innerText,fields[j].innerText]);
        }
      }
      const controls=[...document.querySelectorAll('#journeyViewControl button,[data-follow],[data-follow-action]')].filter(visible)
        .map(node=>{const r=node.getBoundingClientRect();return {text:node.innerText,width:r.width,height:r.height};});
      const tight=e=>{if(!visible(e))return null;const r=document.createRange();r.selectNodeContents(e);const box=r.getBoundingClientRect();return {left:box.left,center:(box.left+box.right)/2,right:box.right};};
      const anchors={left:[],center:[],right:[]};
      for(const row of document.querySelectorAll('#list .row')){
        for(const [slot,selector] of [['left',':scope>.leave>.t'],['center',':scope>.exp>.t,:scope>.exp>.word'],['right',':scope>.arrive>.t']]){
          const value=tight(row.querySelector(selector));if(value)anchors[slot].push(value[slot]);
        }
      }
      return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,collisions,controls,anchors};
    }''')
    assert result['scrollWidth'] <= result['width'] + 1, (label, 'Horizontal page overflow', result)
    assert not result['collisions'], (label, 'Time/action overlap', result['collisions'])
    assert all(control['width'] >= 43.9 and control['height'] >= 43.9 for control in result['controls']), (label, 'Small affected control', result['controls'])
    if design == 'signal' and not enlarged:
        for slot, values in result['anchors'].items():
            if values:
                assert max(values) - min(values) <= 1.5, (label, 'Time-column anchors differ', slot, values)
        for center in result['anchors']['center']:
            assert abs(center - result['width'] / 2) <= 1.5, (label, 'Expected is not centred', center)
    return result


def enlarge(page):
    page.evaluate('''()=>{
      window.parityFonts=[...document.querySelectorAll('body,body *')].filter(e=>e.checkVisibility())
        .map(e=>({e,size:parseFloat(getComputedStyle(e).fontSize),prior:e.style.fontSize,priority:e.style.getPropertyPriority('font-size')}));
      for(const {e,size} of parityFonts)e.style.setProperty('font-size',(size*2)+'px','important');
    }''')


def restore_fonts(page):
    page.evaluate('''()=>{for(const {e,prior,priority} of parityFonts){
      if(prior)e.style.setProperty('font-size',prior,priority);else e.style.removeProperty('font-size');
    }delete window.parityFonts;}''')


def scene(page, label, design, mode):
    facts = assert_option_facts(page, label)
    measured = layout(page, label, design)
    if mode == 'live' and '-home-live' in label:
        text = page.locator('#hero .live-note').inner_text()
        assert text == 'Auto shows when to leave.', (label, 'Live explanatory copy is not the concise shared sentence', text)
    if mode in ['auto', 'plan']:
        assert_option_facts(page, label + '-hero', '#hero', require_fastest=True)
        if design == 'signal':
            summaries = page.locator('#hero .signal-alternative>summary')
            for summary in summaries.all():
                assert summary.locator('[data-fact="total-duration"]').is_visible(), (label, 'Collapsed Next best hides duration')
    page.evaluate('scrollTo(0,0)')
    page.screenshot(path=str(ART / f'ui-parity-{label}.png'), full_page=True)
    enlarge(page)
    try:
        page.screenshot(path=str(ART / f'ui-parity-{label}-200.png'), full_page=True)
        enlarged = layout(page, label + '-200', design, enlarged=True)
        again = assert_option_facts(page, label + '-200')
        assert [(row['key'], row['facts'], row['first']) for row in again] == [(row['key'], row['facts'], row['first']) for row in facts], (label, 'Text enlargement lost facts')
    finally:
        restore_fonts(page)
    return {'facts': facts, 'layout': measured, 'enlargedLayout': enlarged}


def follow_scene(page, label, design):
    page.locator('[data-journey-view="plan"]').click()
    button = page.locator('#list [data-follow]:not([disabled])').first
    assert button.is_visible()
    button.click()
    panel = page.locator('#followPanel')
    assert panel.is_visible()
    facts = displayed_facts(page, '#followPanel')
    assert facts and all(row['shown'] for row in facts), (label, 'Follow has no visible duration facts', facts)
    route = page.evaluate('''()=>{
      const r=__commute.state.followUpdate.route,t=r.lastTrain;
      return {id:r.id,key:[t.from,t.to,t.std,t.operator].join('|'),
        trainMs:t.cancelled||t.depUnknown||t.arrUnknown||t.arr==null?null:t.arr-t.dep,
        totalMs:r.status==='cancelled'||r.status==='missed'||r.expectedArrival==null?null:r.expectedArrival-r.option.leave};
    }''')
    for row in facts:
        assert row['key'] == route['key']
        for value in row['facts']:
            expected = route['trainMs' if value['kind'] == 'train-duration' else 'totalMs']
            assert (None if value['ms'] in ['', None] else float(value['ms'])) == expected, (label, value, route)
            assert value['shown']
    layout(page, label, design)
    page.locator('[data-journey-view="plan"]').click()
    assert panel.is_visible()
    assert page.evaluate('__commute.state.followUpdate.route.id') == route['id']
    page.locator('[data-follow-action="stop"]').click()
    assert not panel.is_visible()
    return {'route': route, 'facts': facts}


def active_rail_scenes(browser):
    results = {}
    for definition in DESIGNS:
        design = definition['id']
        for width in [393, 320]:
            server, context, page, errors = compact.boot(browser, ROOT, 'dark', width)
            try:
                compact.inject(page)
                design_setting(page, definition)
                clarity.start_journey(page)
                for _ in range(4):
                    clarity.next_checkpoint(page)
                expected = page.evaluate('''()=>{
                  const p=__commute.state.rendered.progress,t=p?.train,o=p?.option;
                  if(!t||!o)return null;
                  return {key:[t.from,t.to,t.std,t.operator].join('|'),trainMs:p.expectedArrival-t.dep,
                    totalMs:o.arrive+(p.expectedArrival-t.arr)-o.leave};
                }''')
                assert expected, (design, width, 'The actual guided train did not establish its existing itinerary')
                facts = displayed_facts(page, '#hero')
                assert facts and all(row['shown'] for row in facts), (design, width, 'On-train facts are hidden')
                for row in facts:
                    assert row['key'] == expected['key']
                    for value in row['facts']:
                        field = 'trainMs' if value['kind'] == 'train-duration' else 'totalMs'
                        assert value['shown'] and float(value['ms']) == expected[field], (design, width, value, expected)
                label = f'{design}-dark-{width}-on-train'
                normal = layout(page, label, design)
                page.screenshot(path=str(ART / f'ui-parity-{label}.png'), full_page=True)
                enlarge(page)
                try:
                    page.screenshot(path=str(ART / f'ui-parity-{label}-200.png'), full_page=True)
                    large = layout(page, label + '-200', design, enlarged=True)
                    assert all(value['shown'] for row in displayed_facts(page, '#hero') for value in row['facts'])
                finally:
                    restore_fonts(page)
                assert not errors, errors
                results[f'{design}-{width}'] = {'facts': facts, 'expected': expected, 'layout': normal, 'enlargedLayout': large}
            finally:
                context.close()
                server.shutdown()
    return results


def tube_connection_scenes(browser):
    results = {}
    start = '2026-11-03T17:30:00Z'
    for definition in DESIGNS:
        design = definition['id']
        server = compact.server_for(ROOT)
        context = browser.new_context(viewport={'width': 393, 'height': 852}, color_scheme='dark',
            geolocation={'latitude': 51.5139, 'longitude': -.071, 'accuracy': 10}, permissions=['geolocation'])
        settings = {'provider': 'demo', 'followRoute': True, **definition['settings']}
        saved = {'mode': 'commute', 'dirMode': 'home', 'pace': 'avg', 'settings': settings}
        context.add_init_script('''(()=>{const D=Date,t=D.parse(''' + json.dumps(start) + ''');
          window.Date=class extends D{constructor(...x){super(...(x.length?x:[t]));}static now(){return t;}};
          localStorage.setItem('cartrefCommute.v1',JSON.stringify(''' + json.dumps(saved) + '''));})();''')
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))

        def network(route):
            url = route.request.url
            if url.startswith('http://127.0.0.1:'):
                route.continue_()
            elif '940GZZLUALD/Arrivals' in url:
                departures = [{'vehicleId': 'parity-circle-' + str(index), 'lineId': 'circle',
                    'platformName': 'Westbound - Platform 1', 'destinationName': 'Edgware Road (Circle Line) Underground Station',
                    'timeToStation': minutes * 60, 'expectedArrival': '2026-11-03T17:' + str(30 + minutes) + ':00Z'}
                    for index, minutes in enumerate([3, 9, 15])]
                route.fulfill(status=200, content_type='application/json', body=json.dumps(departures))
            else:
                route.fulfill(status=200, content_type='application/json', body='[]' if '/Line/' in url else '{}')

        page.route('**/*', network)
        try:
            page.goto(f'http://127.0.0.1:{server.server_port}/index.html')
            page.wait_for_function('!!window.__commute && !!__commute.state.boards && __commute.state.aldDeps?.list?.length>=3')
            expected = page.evaluate('''()=>{
              const c=__commute,now=Date.now(),s=c.S(),walk=(s.aldWalk+s.aldPlatform)*1000;
              const p=CommuteCore.planConnection({now,departures:c.state.aldDeps.list,arrivedAt:null,walkMs:walk,
                leg:d=>c.homeLegs(d.t,now),max:Infinity});
              return {winner:p.fastest.t,slower:p.next.at(-1).t,
                rows:p.next.map(t=>({departure:t.t,time:new Date(t.t).toISOString().slice(11,16),
                  trainMs:t.leg.o.train.arr-t.leg.o.train.dep,totalMs:t.arrive-(t.t-walk)}))};
            }''')
            assert len(expected['rows']) == 2 and expected['winner'] != expected['slower'], (design, expected)
            snapshots = {}
            for selected in [False, True]:
                if selected:
                    page.locator('[data-journey-view="auto"]').click()
                    page.evaluate('''time=>{const button=[...document.querySelectorAll('[data-tubepick]')]
                      .find(b=>Number(b.dataset.tubepick.split('|')[1])===time);if(!button)throw Error('Slower choice missing');button.click();}''', expected['slower'])
                    assert page.evaluate('__commute.state.saved.tubePick.t') == expected['slower']
                for mode in (['auto', 'live'] if selected else ['auto', 'plan', 'live']):
                    page.locator(f'[data-journey-view="{mode}"]').click()
                    rows = page.evaluate('''({mode,expected})=>{
                      const visible=e=>e&&e.checkVisibility();
                      return expected.rows.map(want=>{
                        const node=mode==='live'?[...document.querySelectorAll('#list .row.board')].find(n=>n.querySelector('.leave .t')?.innerText===want.time):
                          [...document.querySelectorAll('.tuberow')].find(n=>n.querySelector('b>.t')?.innerText===want.time);
                        if(!node)return null;
                        return {time:want.time,text:node.innerText,
                          train:[...node.querySelectorAll('[data-fact="train-duration"]')].filter(visible).map(n=>Number(n.dataset.ms)),
                          total:[...node.querySelectorAll('[data-fact="total-duration"]')].filter(visible).map(n=>Number(n.dataset.ms)),
                          first:[...node.querySelectorAll('[data-fact="arrives-first"]')].filter(visible).map(n=>n.innerText)};
                      });
                    }''', {'mode': mode, 'expected': expected})
                    label = f'{design}-dark-393-tube-{mode}' + ('-slower-picked' if selected else '')
                    for actual, wanted in zip(rows, expected['rows']):
                        assert actual and actual['train'] == [wanted['trainMs']] and actual['total'] == [wanted['totalMs']], (label, actual, wanted)
                        assert bool(actual['first']) == (wanted['departure'] == expected['winner']), (label, 'A slower chosen connection stole the arrival winner', actual, expected)
                    normal = layout(page, label, design)
                    page.screenshot(path=str(ART / f'ui-parity-{label}.png'), full_page=True)
                    enlarge(page)
                    try:
                        page.screenshot(path=str(ART / f'ui-parity-{label}-200.png'), full_page=True)
                        large = layout(page, label + '-200', design, enlarged=True)
                    finally:
                        restore_fonts(page)
                    snapshots[label] = {'rows': rows, 'layout': normal, 'enlargedLayout': large}
            page.evaluate('''now=>{Date.now=()=>now;const s=__commute.state;
              Object.assign(s,{here:[51.5185,-.0886],locAcc:20,lastFixAt:now,lastFixRecvAt:now,atHub:null,onLine:false});
              s.saved.viewOverride=null;__commute.render();}''', expected['slower'] + 120000)
            tube = page.locator('#hero [data-fact="tube-duration"]')
            assert tube.is_visible() and float(tube.get_attribute('data-ms')) > 0, (design, 'Current Tube leg has no qualified duration')
            assert '~' in tube.inner_text(), (design, 'Modelled Tube duration lost its qualification')
            layout(page, design + '-current-tube', design)
            assert not errors, errors
            results[design] = {'expected': expected, 'views': snapshots, 'currentTubeDuration': tube.inner_text(), 'pageErrors': errors}
        finally:
            context.close()
            server.shutdown()
    return results


def run(browser):
    build_hash = hashlib.sha256((ROOT / 'index.html').read_bytes()).hexdigest()
    results = {}
    for definition in DESIGNS:
        design = definition['id']
        for theme in ['light', 'dark']:
            for width in [393, 320]:
                server, context, page, errors = compact.boot(browser, ROOT, theme, width)
                try:
                    compact.inject(page)
                    design_setting(page, definition)
                    variations = {}
                    for place in ['home', 'station']:
                        page.evaluate('''place=>{
                          const s=__commute.state,now=Date.now();
                          Object.assign(s,{here:place==='station'?[51.9799,-.2290]:[51.975,-.23],locAcc:12,locStatus:'ok',
                            lastFixAt:now,lastFixRecvAt:now,onLine:false,atHub:null,autoDir:'office'});
                          s.saved.viewOverride=null;__commute.render();
                        }''', place)
                        by_mode = {}
                        for mode in ['auto', 'plan', 'live']:
                            page.locator(f'[data-journey-view="{mode}"]').click()
                            label = f'{design}-{theme}-{width}-{place}-{mode}'
                            by_mode[mode] = scene(page, label, design, mode)
                        baseline = {row['key']: (row['facts'], row['first']) for row in by_mode['auto']['facts']}
                        for mode in ['plan', 'live']:
                            comparison = {row['key']: (row['facts'], row['first']) for row in by_mode[mode]['facts']}
                            for key in set(baseline).intersection(comparison):
                                assert comparison[key] == baseline[key], (design, theme, width, place, mode, 'Same option differs across views', key)
                        variations[place] = by_mode
                    follow = follow_scene(page, f'{design}-{theme}-{width}-follow', design)
                    page.locator('#settingsBtn').click()
                    page.locator('#s_followRoute').set_checked(False)
                    page.locator('#saveBtn').click()
                    page.wait_for_function("!document.querySelector('#settings').open")
                    for mode in ['auto', 'plan', 'live']:
                        control = page.locator(f'[data-journey-view="{mode}"]')
                        assert control.is_visible(), (design, 'View hidden when Follow disabled', mode)
                        control.click()
                    assert not errors, (design, theme, width, errors)
                    results[f'{design}-{theme}-{width}'] = {'views': variations, 'follow': follow, 'pageErrors': errors}
                finally:
                    context.close()
                    server.shutdown()
    active = active_rail_scenes(browser)
    tube = tube_connection_scenes(browser)
    final_hash = hashlib.sha256((ROOT / 'index.html').read_bytes()).hexdigest()
    assert final_hash == build_hash, 'The built page changed during the browser run; rerun a frozen candidate.'
    report = {'buildSha256': build_hash, 'cases': results, 'activeRailScenes': active, 'tubeConnectionScenes': tube}
    (ART / 'ui-parity-browser-results.json').write_text(json.dumps(report, indent=2))
    return report


if __name__ == '__main__':
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), args=['--no-sandbox'])
        try:
            report = run(browser)
            print(json.dumps({'browser': 'Chromium', 'buildSha256': report['buildSha256'],
                'designAppearanceWidthCases': len(report['cases']), 'viewScenes': len(report['cases']) * 6,
                'textEnlargementScenes': len(report['cases']) * 6, 'followScenes': len(report['cases']),
                'activeRailScenes': len(report['activeRailScenes']), 'enlargedActiveRailScenes': len(report['activeRailScenes']),
                'tubeConnectionFixtures': len(report['tubeConnectionScenes']),
                'followDisabledViewControls': True, 'pageErrors': []}, indent=2))
        finally:
            browser.close()
