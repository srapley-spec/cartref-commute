"""Visible leave deadlines in the screenshot's walking-to-station situation.

Run after npm run build: python tests/browser-leave-by.py.
Uses the production app with deterministic transport/location observations.
"""
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ART = Path('/workspace/scratch')
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('compact', ROOT / 'tests/browser-signal-compact.py')
compact = importlib.util.module_from_spec(spec)
spec.loader.exec_module(compact)

INJECT = """() => {
 const c=__commute,s=c.state,T=h=>Date.parse('2026-11-03T'+h+':00Z');
 const train=(std,arr)=>({from:'LET',to:'KGX',std,dep:T(std),arr:T(arr),operator:'Great Northern',serviceId:std,
  platform:'1',depLate:0,arrLate:0,cancelled:false,depUnknown:false,arrUnknown:false,reason:''});
 s.saved.home=[51.96,-.22909];s.saved.pace='fast';s.saved.settings.walkHomeStationFast=1800;
 s.boards={'LET-KGX':{services:[train('13:27','14:22'),train('13:52','14:39'),train('14:27','15:22')],msgs:[]},
  'LET-STP':{services:[],msgs:[]},'LET-ZFD':{services:[],msgs:[]}};
 Object.assign(s,{here:[51.969,-.22909],locAcc:4,locStatus:'ok',lastFixAt:Date.now(),lastFixRecvAt:Date.now(),
  boardsAt:Date.now(),onLine:false,atHub:null,autoSrc:"you're near Letchworth (±4 m)"});
 c.render();
}"""


def boot(browser, theme, width):
    server = compact.server_for(ROOT)
    context = browser.new_context(viewport={'width': width, 'height': 852}, color_scheme=theme,
                                  geolocation={'latitude': 51.969, 'longitude': -.22909, 'accuracy': 4},
                                  permissions=['geolocation'])
    context.add_init_script("""(()=>{
      const D=Date,t=D.parse('2026-11-03T12:48:00Z');
      window.Date=class extends D{constructor(...a){super(...(a.length?a:[t]));}static now(){return t;}};
      localStorage.setItem('cartrefCommute.v1',JSON.stringify({mode:'commute',dirMode:'office',pace:'fast',
        home:[51.96,-.22909],settings:{provider:'demo',followRoute:true}}));
    })();""")
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    def network(r):
        if r.request.url.startswith('http://127.0.0.1:'):
            r.continue_()
        else:
            r.fulfill(status=200, content_type='application/json', body='[]' if '/Line/' in r.request.url else '{}')
    page.route('**/*', network)
    page.goto(f'http://127.0.0.1:{server.server_port}/index.html')
    page.wait_for_function('!!window.__commute && !!__commute.state.boards')
    return server, context, page, errors


def check(page, label):
    result = page.evaluate("""() => {
      const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};};
      const visible=e=>e&&e.checkVisibility()&&![...function*(n){for(;n;n=n.parentElement)yield n;}(e)]
        .some(n=>n.tagName==='DETAILS'&&!n.open&&!n.querySelector(':scope>summary')?.contains(e));
      const primary=document.querySelector('#hero>.opt'),next=document.querySelector('#hero .signal-alternative');
      const options=__commute.ranked(Date.now());
      const owners=[primary,next,...document.querySelectorAll('#list .row[data-journey-service]')];
      const deadlines=owners.map(owner=>{
        const node=owner.querySelector('[data-fact="leave-by"]'),clock=node?.querySelector('.t');
        if(!visible(node)||!visible(clock))throw Error('Hidden leave deadline: '+owner.textContent);
        const key=owner.dataset.journeyService||owner.closest('[data-journey-service]').dataset.journeyService;
        const option=options.find(o=>[o.train.from,o.train.to,o.train.std,o.train.operator].join('|')===key);
        if(!option||Number(node.dataset.ms)!==option.leave||clock.innerText!==new Date(option.leave).toISOString().slice(11,16))throw Error('Wrong deadline');
        if(Number(node.querySelector('[data-cd]').dataset.cd)!==option.leave)throw Error('Departure countdown replaced leave countdown');
        if(node.querySelector('[data-cd]').innerText!=='leave in '+CommuteCore.countdown(option.leave-Date.now()))throw Error('Wrong leave countdown');
        return {text:node.innerText,box:box(node),clock:box(clock)};
      });
      const times=primary.querySelector('.optrow'),deadline=primary.querySelector('[data-fact="leave-by"]'),connection=primary.querySelector('.journey-connection');
      if(box(deadline).bottom>box(connection).y)throw Error('Leave deadline is not the first answer');
      if(parseFloat(getComputedStyle(deadline.querySelector('.t')).fontSize)<parseFloat(getComputedStyle(times.querySelector('.optbig')).fontSize))throw Error('Leave deadline lost prominence');
      const centers=[...document.querySelectorAll('#hero .journey-total-time,#list .journey-total-time')].filter(visible).map(e=>{const r=box(e);return (r.x+r.right)/2;});
      if(centers.some(x=>Math.abs(x-innerWidth/2)>1.5))throw Error('Centred Total journey layout changed');
      if(document.documentElement.scrollWidth>innerWidth+1)throw Error('Horizontal overflow');
      return {deadlines,primaryTrain:connection.innerText,centers};
    }""")
    compact.assert_time_legibility(page, label)
    assert ' '.join(result['deadlines'][0]['text'].split()).startswith('Leave by 13:07'), (label, result)
    assert '13:27' in result['primaryTrain'] and 'On time' in result['primaryTrain'], (label, result)
    assert page.locator('#hero .steps').first.get_attribute('open') is None
    return result


def run(browser):
    results = []
    for theme in ['light', 'dark']:
        for width in [320, 393]:
            server, context, page, errors = boot(browser, theme, width)
            label = f'{theme}-{width}'
            try:
                compact.inject(page)
                page.evaluate(INJECT)
                result = check(page, label)
                page.screenshot(path=str(ART / f'leave-by-{label}.png'), full_page=True)
                page.locator('[data-journey-view="plan"]').click()
                check(page, label + '-plan')
                page.locator('#hero .signal-alternative .steps>summary').click()
                check(page, label + '-expanded')
                page.evaluate('__commute.render()')
                assert page.locator('#hero .signal-alternative .steps').get_attribute('open') is not None
                check(page, label + '-refresh')
                page.evaluate("""()=>{
                  window.leaveByFonts=[...document.querySelectorAll('body,body *')].filter(e=>e.checkVisibility())
                    .map(e=>({e,size:parseFloat(getComputedStyle(e).fontSize)}));
                  for(const {e,size} of leaveByFonts)e.style.setProperty('font-size',size*2+'px','important');
                }""")
                check(page, label + '-200')
                page.screenshot(path=str(ART / f'leave-by-{label}-200.png'), full_page=True)
                assert not errors, errors
                results.append({'theme': theme, 'width': width, 'result': result})
            finally:
                context.close()
                server.shutdown()
    report = {'build_sha256': hashlib.sha256((ROOT / 'index.html').read_bytes()).hexdigest(), 'results': results}
    (ART / 'leave-by-browser-results.json').write_text(json.dumps(report, indent=2))
    print('PASS: visible canonical Leave by, preserved train/duration layout, refresh and 200% text in 4 phone scenes')


with sync_playwright() as p:
    browser = p.chromium.launch()
    try:
        run(browser)
    finally:
        browser.close()
