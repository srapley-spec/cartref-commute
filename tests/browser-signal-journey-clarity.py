"""Production Chromium checks for Signal's disruption, location and journey hierarchy.

Run after npm run build: python tests/browser-signal-journey-clarity.py.
Uses the real coordinated simulator and normalized feed observations; no live keys.
--baseline-only records the immutable pre-change page saved in the artifact directory.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys
from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
ART = Path(os.environ.get('SIGNAL_CLARITY_ARTIFACT_DIR', '/workspace/scratch'))
ART.mkdir(parents=True, exist_ok=True)
BASE = ART / 'signal-journey-clarity-baseline'
spec = importlib.util.spec_from_file_location('signal_compact', ROOT / 'tests/browser-signal-compact.py')
compact = importlib.util.module_from_spec(spec)
sys.dont_write_bytecode = True
spec.loader.exec_module(compact)


def settle(page):
    page.wait_for_function('''() => {
      const v=__commute.simulator.getView();
      return !v.stepping && !v.verification.pending &&
        (!v.active || v.verification.current?.index===v.index);
    }''', timeout=60000)


def start_journey(page, direction='outbound', corridor='kgx', scenario='normal'):
    page.locator('#journeySimulatorBtn').click()
    page.select_option('#journeyDirection', direction)
    page.select_option('#journeyRoute', corridor)
    page.select_option('#journeyScenario', scenario)
    page.locator('#journeyStart').click()
    page.wait_for_function('__commute.simulator.sim.active && document.querySelector("#simPanel").hidden')
    settle(page)


def platform_choice(page, view):
    point = view['checkpoints'][view['index']]
    if 'Walk to Underground platforms' not in point['label'] and 'At Aldgate westbound platforms' not in point['label']:
        return
    target = view['startTime'] + view['checkpoints'][view['index'] + 1]['at'] * 60000
    page.evaluate('''target => {
      const b=[...document.querySelectorAll('[data-tubepick]')]
        .find(b=>Math.abs(Number(b.dataset.tubepick.split('|')[1])-target)<1000);
      if(!b)throw Error('The actual simulator platform choice is missing');
      b.click();
    }''', target)
    settle(page)


def next_checkpoint(page):
    index = page.evaluate('__commute.simulator.getView().index')
    page.locator('#journeyNext').click(timeout=25000)
    page.wait_for_function('index=>__commute.simulator.getView().index===index+1', arg=index, timeout=60000)
    settle(page)


def layout_metrics(page):
    """Measure glyph anchors; a full-width span box alone does not prove alignment."""
    return page.evaluate('''() => {
      const shown=e=>!!e&&e.checkVisibility();
      const box=e=>{if(!shown(e))return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
      const tight=e=>{if(!shown(e))return null;const range=document.createRange();range.selectNodeContents(e);const r=range.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,center:(r.left+r.right)/2,width:r.width,height:r.height,text:e.textContent.trim()};};
      const item=(node,slot)=>{const value=node?.querySelector('.optbig,.t,.word')||node;return value?{slot,label:node.querySelector('small')?.textContent.trim()||'',labelBox:tight(node.querySelector('small')),valueBox:box(value),value:tight(value)}:null;};
      const hero=[...document.querySelectorAll('#hero .optrow')].filter(shown).map((node,index)=>{
        const cells=[...node.children].filter(e=>!e.matches('.optarrow,.optroute'));
        return {source:index?'fallback':'primary',board:node.classList.contains('board'),box:box(node),cells:cells.map((e,i)=>item(e,node.classList.contains('board')?['left','center','right'][i]:i===0?'left':'right'))};
      });
      const rows=[...document.querySelectorAll('#list>.row')].filter(shown).map((node,index)=>{
        const journey=node.querySelector('.journey-times');
        const cells=journey?[...journey.children].filter(e=>!e.matches('.optarrow')).map((e,i)=>item(e,i===0?'left':'right')):
          [['.leave','left'],['.exp','center'],['.arrive','right']].flatMap(([s,slot])=>{const e=node.querySelector(':scope>'+s);return e?[item(e,slot)]:[];});
        return {source:'row-'+index,board:node.classList.contains('board'),box:box(node),cells};
      });
      return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,pageHeight:document.documentElement.scrollHeight,
        hero,rows,nextBestLabel:box(document.querySelector('#hero .signal-alt-label')),
        location:box(document.querySelector('#dirNote')),progress:box(document.querySelector('.journey-progress')),
        text:document.querySelector('#hero').innerText};
    }''')


def assert_column_alignment(page, label):
    measured = layout_metrics(page)
    groups = measured['hero'] + measured['rows']
    assert groups, (label, 'No actual time rows were found')
    anchors = {'left': [], 'center': [], 'right': []}
    for row in groups:
        bottoms = [cell['valueBox']['bottom'] for cell in row['cells'] if cell and cell['valueBox']]
        assert max(bottoms) - min(bottoms) <= 1.5, (label, row['source'], 'Time fields do not share their value row', bottoms)
        for cell in row['cells']:
            if cell and cell['value']:
                slot = cell['slot']
                value = cell['value']
                anchors[slot].append((row['source'], value['x' if slot == 'left' else 'center' if slot == 'center' else 'right']))
                if cell['labelBox']:
                    value = cell['labelBox']
                    anchors[slot].append((row['source'] + '-label', value['x' if slot == 'left' else 'center' if slot == 'center' else 'right']))
    for slot, values in anchors.items():
        if values:
            spread = max(v for _, v in values) - min(v for _, v in values)
            assert spread <= 1.5, (label, slot, 'Semantic time columns do not align', values)
    for source, center in anchors['center']:
        assert abs(center - measured['width'] / 2) <= 1.5, (label, source, 'Expected is not centered on the screen', center)
    fallback = next((row for row in measured['hero'] if row['source'] == 'fallback'), None)
    if fallback:
        heading = measured['nextBestLabel']
        top = min(cell['value']['y'] for cell in fallback['cells'] if cell and cell['value'])
        assert heading and heading['bottom'] <= top + 1, (label, 'Next best takes space beside the time columns', heading, top)
    assert measured['scrollWidth'] <= measured['width'] + 1, (label, 'Horizontal overflow', measured)
    return measured


def capture_journey(page, prefix, assert_current=False):
    start_journey(page)
    captures = {}
    names = {1: 'walking-board', 2: 'station', 4: 'on-train', 9: 'on-tube', 13: 'planning'}
    total = page.evaluate('__commute.simulator.getView().checkpoints.length')
    for index in range(total):
        view = page.evaluate('__commute.simulator.getView()')
        assert view['index'] == index
        if index in names:
            name = names[index]
            page.evaluate('scrollTo(0,0)')
            page.screenshot(path=str(ART / f'{prefix}-{name}.png'), full_page=True)
            captures[name] = layout_metrics(page)
            if assert_current and name in ['walking-board', 'station', 'planning']:
                assert_column_alignment(page, prefix + '-' + name)
            if assert_current:
                assert_location(page, prefix + '-' + name)
                location = page.locator('#dirNote').inner_text().lower()
                if name == 'on-train':
                    assert any(word in location for word in ['train', 'rail', 'stevenage']), (prefix, 'Location still describes the old direction origin while on the train', location)
                elif name == 'on-tube':
                    assert any(word in location for word in ['tube', 'met', 'barbican']), (prefix, 'Location omits the inferred current Tube leg', location)
                elif name == 'planning':
                    assert 'office' in location or 'mansfield' in location, (prefix, 'Location does not reflect arrival at the office', location)
                assert_accessible(page, prefix + '-' + name)
                if name in ['on-train', 'on-tube']:
                    assert_progress(page, prefix + '-' + name, name)
                enlarge_and_check(page, prefix + '-' + name)
        if index < total - 1:
            platform_choice(page, view)
            next_checkpoint(page)
    if assert_current:
        summary = page.evaluate('__commute.simulator.getView().summary')
        assert summary['failedAssertions'] == 0, (prefix, 'A normal real-controller journey acquired runtime failures', summary)
    return captures


def assert_location(page, label, expected=None):
    location = page.locator('#dirNote')
    assert location.is_visible(), (label, 'The current location diagnostic is concealed')
    text = location.inner_text()
    assert 'location' in text.lower(), (label, text)
    assert len(text.strip()) > len('Location:'), (label, 'Location label has no diagnostic value')
    if expected:
        assert expected.lower() in text.lower(), (label, expected, text)


def assert_accessible(page, label):
    measured = compact.metrics(page)
    assert measured['scrollWidth'] <= measured['width'] + 1, (label, 'Horizontal overflow', measured)
    assert all(c['height'] >= 43.9 and c['width'] >= 43.9 for c in measured['controlHeights']), (label, 'An action is smaller than44×44', measured['controlHeights'])
    assert all(c['ratio'] >= 4.5 for c in measured['contrast']), (label, 'Text contrast below4.5', measured['contrast'])
    added = page.evaluate('''() => {
      const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');canvas.width=canvas.height=1;
      const rgba=c=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=c;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].map((x,i)=>i===3?x/255:x);};
      const composite=(a,b)=>a.slice(0,3).map((v,i)=>v*a[3]+b[i]*(1-a[3]));
      const background=e=>{const colors=[];for(let n=e;n;n=n.parentElement)colors.push(rgba(getComputedStyle(n).backgroundColor));let b=[255,255,255];for(const c of colors.reverse())b=composite(c,b);return b;};
      const luminance=a=>{a=a.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return a[0]*.2126+a[1]*.7152+a[2]*.0722;};
      return [...document.querySelectorAll('#dirNote,.signal-disruption-title,.signal-disruption-detail,.signal-disruption-qualifier,.signal-disruption a,.jp-status,.jp-evidence,.jp-stop-name,.jp-stop-status,.jp-stop-plan,.jp-stop-time,.jp-leg-name,.jp-current-title')]
        .filter(e=>e.checkVisibility()).map(e=>{const b=background(e),f=composite(rgba(getComputedStyle(e).color),b),a=luminance(f),z=luminance(b);return {text:e.textContent.trim().slice(0,50),ratio:(Math.max(a,z)+.05)/(Math.min(a,z)+.05)};});
    }''')
    assert all(sample['ratio'] >= 4.5 for sample in added), (label, 'New disruption/progress/location text contrast below4.5', added)
    compact.assert_time_legibility(page, label)
    diagram = page.evaluate('''() => {
      const section=document.querySelector('#hero .journey-progress');if(!section)return null;
      const bars=[...section.querySelectorAll('.jp-leg-bar')].map(e=>e.getBoundingClientRect().height);
      const names=[...section.querySelectorAll('.jp-leg-name')].map(e=>e.getBoundingClientRect().bottom);
      const title=section.querySelector('.jp-current-title')?.getBoundingClientRect().top;
      const calls=[...section.querySelectorAll('.jp-stops')].map(list=>({
        label:list.getAttribute('aria-label'),tabIndex:list.tabIndex,
        times:[...list.querySelectorAll('.jp-stop-time')].map(e=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom};})
      }));
      return {bars,labelBottom:Math.max(...names),titleTop:title,calls};
    }''')
    if diagram:
        assert all(height >= 3.9 for height in diagram['bars']), (label, 'Overall journey bars collapse or disappear', diagram)
        assert diagram['labelBottom'] <= diagram['titleTop'] + .5, (label, 'Overall leg labels overlap the current leg', diagram)
        for calls in diagram['calls']:
            assert calls['label'] and calls['tabIndex'] >= 0, (label, 'Calling points cannot be reached to scroll', calls)
            for edge in ['top', 'bottom']:
                positions = [time[edge] for time in calls['times']]
                assert max(positions) - min(positions) <= 1.5, (label, 'Calling-point times do not share their row', calls)
    return measured


def assert_progress(page, label, phase):
    progress = page.locator('#hero .journey-progress')
    assert progress.count() == 1 and progress.is_visible(), (label, 'Live inferred journey has no visible progress')
    assert progress.locator('.jp-overall').is_visible(), (label, 'Overall journey legs are absent')
    assert progress.locator('.jp-leg').count() >= 2, (label, 'The full journey is reduced to only its current service')
    assert progress.locator('.jp-leg[data-state="current"]').count() == 1, (label, 'Current leg is ambiguous')
    current = progress.locator('.jp-current-track[role="progressbar"]')
    assert current.is_visible(), (label, 'Current-leg progress is absent')
    assert current.get_attribute('aria-label') or current.get_attribute('aria-labelledby'), (label, 'Progress has no accessible label')
    value = current.get_attribute('aria-valuenow')
    if value is not None:
        assert 0 <= float(value) <= 100, (label, 'Progress outside its bounds', value)
    evidence = progress.locator('.jp-evidence')
    assert evidence.count() and all(node.is_visible() for node in evidence.all()), (label, 'Progress hides its evidence source')
    calls = progress.locator('.jp-stops .jp-stop')
    assert calls.count() >= 2, (label, 'Known current-leg stops are absent')
    if phase == 'on-train':
        text = progress.inner_text()
        assert 'Stevenage' in text and 'King' in text, (label, 'Actual known rail calling points are missing', text)
        assert progress.locator('.jp-stop[data-state="reported"]').count() >= 1, (label, 'Fresh actual rail report is not distinguished')
    else:
        source_text = evidence_text(progress)
        assert any(word in source_text for word in ['estimated', 'modelled', 'estimate', 'position']), (label, 'Tube position is presented as an exact live report', source_text)


def evidence_text(progress):
    return '\n'.join(progress.locator('.jp-evidence').all_inner_texts()).lower()


def inject_disruption(page, delay=0, *, cancelled=False, unknown=False, notices='none', tube='good'):
    """Change normalized observations, leaving the actual engine to grade them."""
    page.evaluate('''() => {if(__commute.simulator.sim.active)__commute.simulator.simStop({resume:false});}''')
    expected = compact.inject(page, False)
    page.evaluate('''input => {
      const c=__commute,s=c.state;
      for(const board of Object.values(s.boards)){
        board.msgs=[];
        for(const t of board.services){t.cancelled=false;t.depUnknown=false;t.arrUnknown=false;t.depLate=0;t.arrLate=0;}
      }
      const t=s.boards['LET-KGX'].services[0];
      t.cancelled=input.cancelled;t.depUnknown=input.unknown;t.depLate=t.arrLate=input.delay;
      t.dep+=input.delay*60000;t.arr+=input.delay*60000;
      t.reason=input.delay||input.cancelled||input.unknown?'Signalling failure affecting trains between Letchworth and London.':'';
      const text={
        onRoute:'Engineering work between Letchworth and London. Check https://www.nationalrail.co.uk/service-disruptions for details.',
        other:'Trains near Cardiff Central are disrupted by a signalling failure.',
        facility:'The toilets at Letchworth Garden City are currently closed.',
        mixed:'The lift at Letchworth is unavailable and trains are delayed by a signalling failure.'
      }[input.notices];
      if(text)s.boards['LET-KGX'].msgs=[text];
      const line=(id,name,sev=10,desc='Good Service')=>({id,name,statuses:[{sev,desc,reason:name+' service is affected by a signalling failure.'}]});
      s.status=[line('circle','Circle'),line('metropolitan','Metropolitan'),line('hammersmith-city','Hammersmith & City')];
      if(input.tube==='minor')s.status[0]=line('circle','Circle',9,'Minor Delays');
      if(input.tube==='severe')s.status[0]=line('circle','Circle',6,'Severe Delays');
      if(input.tube==='unused')s.status[2]=line('hammersmith-city','Hammersmith & City',6,'Severe Delays');
      if(input.tube==='closed'){
        s.status[0]=line('circle','Circle',20,'Service Closed');s.status[1]=line('metropolitan','Metropolitan',20,'Service Closed');
      }
      s.autoSrc="you're near Letchworth (±12 m)";
      c.render();
    }''', {'delay': delay, 'cancelled': cancelled, 'unknown': unknown, 'notices': notices, 'tube': tube})
    return expected


def disruption_cases(page, prefix):
    results = []
    quiet = [(0, 'onRoute', 'good'), (4, 'none', 'good'), (0, 'other', 'good'), (0, 'facility', 'good'), (0, 'none', 'minor'), (0, 'none', 'unused')]
    for delay, notices, tube in quiet:
        inject_disruption(page, delay, notices=notices, tube=tube)
        label = f'{prefix}-quiet-{delay}-{notices}-{tube}'
        assert not page.locator('#signalDisruptions').is_visible(), (label, 'Background or minor disruption was promoted')
        assert not page.locator('#signalNotices').evaluate('e=>e.open'), (label, 'Background alerts start expanded')
        assert_location(page, label, 'Letchworth')
        assert_accessible(page, label)
        results.append(label)
    important = [({'delay': 5}, '5 min', 'warn'), ({'delay': 14}, '14 min', 'warn'), ({'delay': 15}, '15 min', 'bad'),
                 ({'cancelled': True}, 'cancelled', 'bad'), ({'unknown': True}, 'no estimate', 'bad'),
                 ({'tube': 'severe'}, 'Circle', 'warn'), ({'tube': 'closed'}, 'closed', 'bad'),
                 ({'delay': 15, 'notices': 'mixed'}, 'signalling failure', 'bad')]
    for inputs, expected, level in important:
        inject_disruption(page, **inputs)
        label = prefix + '-important-' + '-'.join(str(value) for value in inputs.values())
        region = page.locator('#signalDisruptions')
        assert region.is_visible(), (label, 'Significant route disruption is concealed')
        assert expected.lower() in region.inner_text().lower(), (label, expected, region.inner_text())
        assert region.locator('.' + level).count() or region.get_attribute('data-level') == level, (label, 'Agreed severity is not represented', level)
        assert not page.locator('#signalNotices').evaluate('e=>e.open'), (label, 'Reading a significant alert must not require expanding all background notices')
        assert region.bounding_box()['y'] < page.locator('#hero').bounding_box()['y'], (label, 'Significant impact is after the journey it changes')
        assert_accessible(page, label)
        results.append(label)
    page.evaluate('scrollTo(0,0)')
    page.screenshot(path=str(ART / (prefix + '-significant-alert.png')), full_page=True)
    inject_disruption(page, 15, notices='onRoute', tube='severe')
    page.evaluate('''() => {
      const c=__commute,s=c.state,T=Date.parse('2026-11-04T11:00:00Z');
      s.saved.view='by';s.by={T,boards:s.boards,failed:{},live:false};
      document.querySelector('#byDate').value='2026-11-04';document.querySelector('#byTime').value='11:00';c.render();
    }''')
    later = page.locator('#signalDisruptions').inner_text().lower()
    assert 'now' in later or 'current' in later, (prefix, 'Later plan disruption is presented as a forecast', later)
    assert 'not your' in later or 'not a forecast' in later, (prefix, 'Later plan warning lacks its scope qualifier', later)
    full = page.locator('#signalDisruptions [data-scope="rail"] details')
    assert full.count(), (prefix, 'Complete route explanation is unavailable')
    full.first.locator('summary').click()
    link = page.locator('#signalDisruptions a').first
    assert link.is_visible() and link.get_attribute('href').startswith('https://www.nationalrail.co.uk/'), (prefix, 'Disruption link is hidden or malformed')
    assert_accessible(page, prefix + '-expanded-impact-with-link')
    full.first.locator('summary').click()
    results.append(prefix + '-later-plan-qualifier')
    return results


def location_cases(page, prefix):
    result = []
    for direction in ['office', 'auto']:
        for status, diagnostic in [('ok', "you're near Letchworth (±12 m)"), ('pending', 'finding your location'), ('denied', 'location is off for this app'), ('unavailable', "can't get your location right now")]:
            inject_disruption(page)
            before = page.evaluate('__commute.state.watchId')
            page.evaluate('''input => {const c=__commute,s=c.state;s.saved.dirMode=input.direction;s.locStatus=input.status;s.autoSrc=input.text;if(input.status!=='ok'){s.here=null;s.lastFixAt=0;s.lastFixRecvAt=0;}c.render();}''', {'direction': direction, 'status': status, 'text': diagnostic})
            label = f'{prefix}-location-{direction}-{status}'
            assert_location(page, label, diagnostic)
            assert page.evaluate('__commute.state.watchId') == before, (label, 'Restoring the location label restarted permission/location watching')
            assert_accessible(page, label)
            result.append(label)
    inject_disruption(page)
    page.evaluate('''() => {const c=__commute;c.state.lastFixAt=Date.now()-2*60000;c.render();}''')
    assert_location(page, prefix + '-stale-location', 'stale')
    result.append(prefix + '-stale-location')
    return result


def enlarge_and_check(page, prefix):
    page.evaluate('''() => {
      window.clarityFontSnapshot=[...document.querySelectorAll('body,body *')]
        .filter(e=>e.checkVisibility()).map(e=>({e,size:parseFloat(getComputedStyle(e).fontSize),prior:e.style.fontSize}));
      for(const {e,size} of clarityFontSnapshot)e.style.setProperty('font-size',(size*2)+'px','important');
    }''')
    try:
        page.evaluate('scrollTo(0,0)')
        page.screenshot(path=str(ART / (prefix + '-200-percent.png')), full_page=True)
        assert_accessible(page, prefix + '-200-percent')
    finally:
        page.evaluate('''() => {for(const {e,prior} of clarityFontSnapshot){if(prior)e.style.fontSize=prior;else e.style.removeProperty('font-size');}delete window.clarityFontSnapshot;}''')


def set_reported_rail(page, target='09:38', *, stale=False):
    """Parse transport-shaped facts; never manufacture a derived last.late field."""
    return page.evaluate('''input => {
      const c=__commute,s=c.state,now=c.simClock.now(),match=c.whichTrain(now),t=match?.t;
      if(!t?.serviceId)throw Error('No genuinely inferred rail service for the progress fixture');
      const raw={locationName:'Letchworth Garden City',crs:'LET',std:'09:05',atd:'09:05',
        subsequentCallingPoints:[{callingPoint:[
          {locationName:'Stevenage',crs:'SVG',st:'09:16',...(input.stale?{et:'09:16'}:{at:'09:14'})},
          {locationName:'Finsbury Park',crs:'FPK',st:'09:34',et:input.target==='09:48'?'09:41':'09:31'},
          {locationName:'London Kings Cross',crs:'KGX',st:'09:41',et:input.target}
        ]}]};
      s.progressById[t.serviceId]={id:t.serviceId,at:input.stale?now-4*60000:now,data:window.CommuteCore.parseServiceDetails(raw,now),err:null};
      if(input.stale)s.boardsAt=now-4*60000;
      c.render();return t.serviceId;
    }''', {'target': target, 'stale': stale})


def rail_progress_cases(page, prefix):
    set_reported_rail(page, '09:38')
    progress = page.locator('#hero .journey-progress')
    assert '3 min ahead' in progress.locator('.jp-status').inner_text(), (prefix, 'Live early prediction not reflected', progress.inner_text())
    assert progress.locator('.jp-stop[data-state="reported"]').filter(has_text='Stevenage').count() == 1
    set_reported_rail(page, '09:48')
    assert '7 min behind' in progress.locator('.jp-status').inner_text(), (prefix, 'Live late prediction not reflected', progress.inner_text())
    significant_rail = page.locator('#signalDisruptions .signal-disruption[data-scope="rail"]')
    assert significant_rail.count() >= 1 and significant_rail.first.is_visible(), (prefix, 'Fresh significant Service Details delay was hidden behind an on-time departure board', page.locator('#signalDisruptions').inner_text())
    assert_accessible(page, prefix + '-rail-behind')
    page.screenshot(path=str(ART / (prefix + '-rail-behind.png')), full_page=True)
    enlarge_and_check(page, prefix + '-rail')
    set_reported_rail(page, '09:48', stale=True)
    evidence = evidence_text(progress)
    assert 'stale' in evidence or 'last known' in evidence or 'unavailable' in evidence, (prefix, 'Stale report appears fresh', evidence)
    assert 'live expected' not in progress.locator('.jp-status').inner_text().lower(), (prefix, 'Stale ahead/behind comparison still claims live', progress.inner_text())
    page.evaluate('''() => {
      const c=__commute,s=c.state;s.progressById={};s.railSource='tfl';s.saved.settings.provider='tfl';
      for(const board of Object.values(s.boards||{}))for(const t of board.services||[])t.timetable=true;
      c.render();
    }''')
    evidence = evidence_text(progress)
    assert any(word in evidence for word in ['modelled', 'unavailable', 'estimate']), (prefix, 'Missing live evidence is fabricated', progress.inner_text())
    assert 'live expected' not in progress.locator('.jp-status').inner_text().lower(), (prefix, 'Timetable-only progress claims a live comparison', progress.inner_text())


def tube_progress_cases(page, prefix):
    baseline_arrival = page.locator('#hero .big .arr').inner_text()
    page.evaluate('''() => {
      const c=__commute,s=c.state,now=c.simClock.now(),r=s.rendered.ride,p=s.rendered.progress;
      if(!r?.vehicle||p?.kind!=='tube')throw Error('No genuinely selected Tube vehicle for progress fixture');
      window.clarityTubeObservation={at:now,arrivals:[{vehicle:r.vehicle,lineId:r.line==='Met'?'metropolitan':'circle',
        platform:p.liveDirection+' - Platform 1',stopId:p.liveStopId,observedAt:now,t:p.arrival-2*60000}],err:null};
      s.ald=clarityTubeObservation;c.render();
    }''')
    progress = page.locator('#hero .journey-progress')
    evidence = evidence_text(progress)
    assert 'live arrival' in evidence, (prefix, 'Matched fresh Tube ETA not used', progress.inner_text())
    assert 'estimate' in evidence, (prefix, 'Tube live ETA is presented as an exact physical position', evidence)
    assert page.locator('#hero .big .arr').inner_text() != baseline_arrival, (prefix, 'Matched fresh Tube ETA did not update the headline')
    assert_accessible(page, prefix + '-tube-live')
    enlarge_and_check(page, prefix + '-tube')
    page.evaluate('''() => {const c=__commute; c.state.ald={...clarityTubeObservation,arrivals:clarityTubeObservation.arrivals.map(a=>({...a,vehicle:'a-different-vehicle'}))};c.render();}''')
    text = evidence_text(progress)
    assert 'modelled' in text or 'unavailable' in text, (prefix, 'Another Tube vehicle was accepted', progress.inner_text())
    assert 'min ahead' not in progress.locator('.jp-status').inner_text() and 'min behind' not in progress.locator('.jp-status').inner_text(), (prefix, 'An unmatched Tube prediction creates a live comparison', progress.inner_text())
    assert page.locator('#hero .big .arr').inner_text() == baseline_arrival, (prefix, 'Another Tube vehicle changed the headline arrival')
    page.evaluate('''() => {const c=__commute;c.state.ald={...clarityTubeObservation,at:c.simClock.now()-3*60000};c.render();}''')
    evidence = evidence_text(progress)
    assert any(word in evidence for word in ['stale', 'modelled', 'unavailable']), (prefix, 'Expired Tube data appears fresh', evidence)
    assert 'live expected' not in progress.locator('.jp-status').inner_text().lower(), (prefix, 'Expired Tube data still claims live progress', progress.inner_text())
    assert page.locator('#hero .big .arr').inner_text() == baseline_arrival, (prefix, 'Expired Tube prediction changed the headline arrival')


def remaining_leg_cases(page):
    """A real selected Met ride has completed rail and does not use Circle."""
    page.evaluate('''() => {
      const c=__commute,s=c.state;
      window.clarityRemainingSnapshot={boards:s.boards,boardsAt:s.boardsAt,status:s.status};
      s.boards=Object.fromEntries(Object.entries(s.boards).map(([key,board])=>[key,{...board,
        services:board.services.map(t=>({...t,cancelled:true,depLate:20,arrLate:20}))}]));
      s.boardsAt=c.simClock.now()-4*60000;
      s.status=['circle','metropolitan','hammersmith-city'].map(id=>({id,name:id,statuses:[{sev:10,desc:'Good Service',reason:''}]}));
      c.render();
    }''')
    assert page.locator('#signalDisruptions .signal-disruption[data-scope="rail"]').count() == 0, 'Completed rail cancellations are shown as current-route disruption'
    assert 'out of date' not in page.locator('#signalStatus').inner_text().lower(), 'Completed rail freshness warning remains prominent during the Tube leg'
    for line, visible in [('metropolitan', True), ('circle', False), ('hammersmith-city', False)]:
        page.evaluate('''id => {const c=__commute;for(const line of c.state.status)line.statuses=[{sev:line.id===id?6:10,desc:line.id===id?'Severe Delays':'Good Service',reason:line.id===id?'Severe delays affecting this line.':''}];c.render();}''', line)
        alerts = page.locator('#signalDisruptions .signal-disruption[data-scope="tube"]')
        assert bool(alerts.count()) == visible, ('Current Tube route relevance is incorrect', line, alerts.all_inner_texts())
    page.evaluate('''() => {Object.assign(__commute.state,clarityRemainingSnapshot);delete window.clarityRemainingSnapshot;__commute.render();}''')


def column_edge_cases(page, prefix):
    inject_disruption(page)
    page.evaluate('''() => {
      const c=__commute,s=c.state,now=Date.now();
      Object.assign(s,{here:[51.98002,-.22909],locStatus:'ok',locAcc:12,lastFixAt:now,lastFixRecvAt:now,autoSrc:"you're at Letchworth (±12 m)"});
      s.boards['LET-KGX'].services[2].depUnknown=true;c.render();
      for(const label of document.querySelectorAll('#hero .optrow>div:last-child small,#hero .optrow>div:nth-child(3) small'))label.textContent='At a long destination name';
    }''')
    measured = assert_column_alignment(page, prefix + '-long-label-and-no-estimate')
    assert page.locator('#list .exp,#list .journey-connection .connection-status').filter(has_text='No estimate').count() >= 1, (prefix, 'No-estimate train disappeared from the board')
    assert_accessible(page, prefix + '-column-edge')
    page.screenshot(path=str(ART / (prefix + '-column-edge.png')), full_page=True)
    return measured


def appearance_cases(page, prefix, device_theme, width):
    results = []
    for appearance in ['light', 'dark', 'system']:
        page.locator('#settingsBtn').click()
        page.select_option('#s_appearance', appearance)
        page.locator('#saveBtn').click()
        page.wait_for_function("!document.querySelector('#settings').open && !__commute.state.loading")
        inject_disruption(page, 15, tube='severe')
        expected = device_theme if appearance == 'system' else appearance
        canvas = page.evaluate('getComputedStyle(document.body).backgroundColor')
        assert canvas == ('rgb(9, 15, 22)' if expected == 'dark' else 'rgb(242, 245, 248)'), (prefix, appearance, canvas)
        label = prefix + '-appearance-' + appearance
        assert_accessible(page, label)
        assert_location(page, label)
        results.append({'system': device_theme, 'appearance': appearance, 'width': width})
    return results


def persistence_case(page, prefix):
    inject_disruption(page)
    expected_rows = page.locator('#list>.row').count()
    page.locator('#hero [data-follow]:not([disabled])').first.click()
    selected = page.evaluate('__commute.state.saved.followRoute.id')
    page.locator('[data-journey-view="plan"]').click()
    assert page.locator('#hero .optrow').first.is_visible(), (prefix, 'Explicit Plan is hidden while following')
    assert page.locator('#followPanel').is_visible()
    page.reload()
    page.wait_for_function('!!window.__commute && !!__commute.state.saved.followRoute')
    assert page.evaluate('__commute.state.saved.followRoute.id') == selected, (prefix, 'Reload lost the followed route')
    for theme in ['light', 'dark']:
        page.locator('#settingsBtn').click()
        page.select_option('#s_appearance', theme)
        page.locator('#saveBtn').click()
        page.wait_for_function("!document.querySelector('#settings').open && !__commute.state.loading && !__commute.state.again")
        assert page.evaluate('document.documentElement.dataset.design') == 'signal'
        assert page.evaluate('__commute.state.saved.followRoute.id') == selected
    page.locator('[data-follow-action="stop"]').click()
    assert not page.locator('#followPanel').is_visible()
    inject_disruption(page, cancelled=True)
    assert page.locator('#list>.row').count() == expected_rows
    assert any('Cancelled' in row for row in page.locator('#list>.row').all_inner_texts()), (prefix, 'Cancelled train was filtered out')


def progress_evidence_cases(browser):
    server, context, page, errors = compact.boot(browser, ROOT, 'dark', 393)
    try:
        start_journey(page)
        for _ in range(4):
            next_checkpoint(page)
        assert_progress(page, 'evidence-rail', 'on-train')
        rail_progress_cases(page, 'signal-clarity-evidence')
        page.locator('#simExit').click()
        start_journey(page)
        for _ in range(9):
            view = page.evaluate('__commute.simulator.getView()')
            platform_choice(page, view)
            next_checkpoint(page)
        assert_progress(page, 'evidence-tube', 'on-tube')
        remaining_leg_cases(page)
        tube_progress_cases(page, 'signal-clarity-evidence')
        assert not errors, errors
    finally:
        context.close()
        server.shutdown()


def capture_baseline(browser):
    assert (BASE / 'index.html').exists(), 'Save HEAD:index.html into the immutable baseline directory first.'
    results = {}
    for theme in ['light', 'dark']:
        for width in [393, 320]:
            server, context, page, errors = compact.boot(browser, BASE, theme, width)
            try:
                results[f'{theme}-{width}'] = capture_journey(page, f'signal-clarity-before-{theme}-{width}')
                assert not errors, errors
            finally:
                context.close()
                server.shutdown()
    (ART / 'signal-journey-clarity-before.json').write_text(json.dumps(results, indent=2))
    return results


def run_current(browser):
    build_hash = hashlib.sha256((ROOT / 'index.html').read_bytes()).hexdigest()
    results = {}
    for theme in ['light', 'dark']:
        for width in [393, 320]:
            server, context, page, errors = compact.boot(browser, ROOT, theme, width)
            try:
                prefix = f'signal-clarity-after-{theme}-{width}'
                captures = capture_journey(page, prefix, assert_current=True)
                disruptions = disruption_cases(page, prefix)
                locations = location_cases(page, prefix)
                columns = column_edge_cases(page, prefix)
                appearances = appearance_cases(page, prefix, theme, width)
                persistence_case(page, prefix)
                results[f'{theme}-{width}'] = {'captures': captures, 'disruptions': disruptions,
                                             'locations': locations, 'columns': columns, 'appearances': appearances}
                assert not errors, errors
            finally:
                context.close()
                server.shutdown()
    progress_evidence_cases(browser)
    final_hash = hashlib.sha256((ROOT / 'index.html').read_bytes()).hexdigest()
    assert final_hash == build_hash, 'Built page changed during the browser run; rerun against a frozen build.'
    (ART / 'signal-journey-clarity-after.json').write_text(json.dumps({'buildSha256': build_hash, 'cases': results}, indent=2))
    return results


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--baseline-only', action='store_true')
    options = parser.parse_args()
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), args=['--no-sandbox'])
        try:
            result = capture_baseline(browser) if options.baseline_only else run_current(browser)
            summary = {'browser': 'Chromium', 'baseline': options.baseline_only, 'deviceAppearanceCases': len(result)}
            if options.baseline_only:
                summary['captures'] = {key: list(value) for key, value in result.items()}
            else:
                summary.update({'journeyStateCaptures': sum(len(value['captures']) for value in result.values()),
                                'buildSha256': hashlib.sha256((ROOT / 'index.html').read_bytes()).hexdigest(),
                                'disruptionCases': sum(len(value['disruptions']) for value in result.values()),
                                'locationCases': sum(len(value['locations']) for value in result.values()),
                                'appearanceOverrides': sum(len(value['appearances']) for value in result.values()),
                                'progressEvidence': ['rail ahead', 'rail behind', 'rail stale', 'rail timetable only',
                                                     'Tube matching vehicle', 'Tube wrong vehicle', 'Tube stale']})
            print(json.dumps(summary, indent=2))
        finally:
            browser.close()
