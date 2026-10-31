"""Real mobile Chromium checks for cold Back and Reset: python3 tests/browser-simulator-context-reset.py."""
import functools
import http.server
import json
import threading
from pathlib import Path
from playwright.sync_api import sync_playwright

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args): pass

root = Path(__file__).resolve().parents[1]
server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(root)))
threading.Thread(target=server.serve_forever, daemon=True).start()
results = []
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    for signal in [False, True]:
        for direction in ['outbound', 'return']:
            for route in ['kgx', 'far']:
                context = browser.new_context(viewport={'width': 393, 'height': 852}, geolocation={'latitude': 51.975, 'longitude': -.23, 'accuracy': 12}, permissions=['geolocation'])
                page = context.new_page()
                page.add_init_script('localStorage.setItem("cartrefCommute.v1",JSON.stringify('+json.dumps({'home':[51.975,-.23], 'settings':{'signal':signal, 'provider':'tfl'}})+'));')
                errors, traffic = [], []
                page.on('pageerror', lambda e: errors.append(str(e)))
                def network(request):
                    if request.request.url.startswith('http://127.0.0.1:'): request.continue_()
                    else:
                        traffic.append(request.request.url)
                        request.fulfill(status=200, content_type='application/json', body='{}')
                page.route('**/*', network)
                page.goto(f'http://127.0.0.1:{server.server_port}/index.html')
                page.wait_for_function('!!window.__commute')
                native_date = page.evaluate('Date.now()')
                page.locator('#journeySimulatorBtn').click()
                page.select_option('#journeyDirection', direction)
                page.select_option('#journeyRoute', route)
                page.locator('#journeyStart').click()
                page.wait_for_function('__commute.simulator.sim.active && !__commute.simulator.sim.verification.pending')
                baseline = len(traffic)
                for _ in range(20):
                    point = page.evaluate('''() => {const v=__commute.simulator.getView();return v.checkpoints[v.index];}''')
                    if point['point'] == 'north': break
                    page.evaluate('''() => {
                      const v=__commute.simulator.getView(),p=v.checkpoints[v.index],next=v.checkpoints[v.index+1];
                      if(/platforms/.test(p.label)&&next?.mode==='tube'){
                        const at=v.startTime+next.at*60000;
                        [...document.querySelectorAll('[data-tubepick]')].find(b=>Math.abs(Number(b.dataset.tubepick.split('|')[1])-at)<1000)?.click();
                      }
                      if(/Alight at Farringdon/.test(p.label))[...document.querySelectorAll('[data-ride="off"]')].find(b=>b.textContent.includes('Farringdon'))?.click();
                    }''')
                    index = page.evaluate('__commute.simulator.sim.index')
                    page.locator('#journeyNext').click()
                    page.wait_for_function('(index)=>__commute.simulator.sim.index===index+1&&!__commute.simulator.sim.verification.pending', arg=index)
                assert point['point']=='north'
                assert page.evaluate('__commute.state.onLine'), 'real engine established the rail journey'
                before = page.evaluate('''() => {const v=__commute.simulator.getView();return {index:v.index,time:v.startTime+v.checkpoints[v.index-1].at*60000};}''')
                page.locator('#journeyBack').click()
                page.wait_for_function('!__commute.simulator.sim.verification.pending')
                assert page.evaluate('__commute.simulator.sim.index')==before['index']-1
                assert page.evaluate('__commute.simClock.now()')==before['time']
                assert page.evaluate('__commute.simulator.sim.timer===null')
                assert page.evaluate('__commute.simulator.sim.verification.current.assertions.find(a=>a.id==="journey-context-cleared").status')=='PASS'
                page.locator('#simToggle').click()
                for theme in ['light','dark']:
                    page.emulate_media(color_scheme=theme)
                    page.wait_for_timeout(350)
                    for size in [{'width':320,'height':568},{'width':393,'height':852},{'width':852,'height':393}]:
                        page.set_viewport_size(size)
                        layout = page.evaluate('''() => {
                          const bar=document.querySelector('#simBar').getBoundingClientRect();
                          const buttons=['journeyBack','journeyResetState'].map(id=>{const e=document.getElementById(id),r=e.getBoundingClientRect();return {id,w:r.width,h:r.height,left:r.left,right:r.right,overflow:e.scrollWidth>e.clientWidth};});
                          return {buttons,inside:bar.left>=0&&bar.right<=innerWidth&&bar.bottom<=innerHeight,barHeight:bar.height,padding:parseFloat(getComputedStyle(document.body).paddingBottom)};
                        }''')
                        assert layout['inside'] and layout['padding']>=layout['barHeight'],layout
                        assert all(b['w']>=44 and b['h']>=44 and b['left']>=0 and b['right']<=size['width'] and not b['overflow'] for b in layout['buttons']), layout
                page.set_viewport_size({'width':393,'height':852})
                current = page.evaluate('JSON.stringify({time:__commute.simClock.now(),fix:__commute.state.lastPosition,index:__commute.simulator.sim.index})')
                page.locator('#journeyResetState').click()
                page.wait_for_function('!__commute.simulator.sim.verification.pending')
                assert page.evaluate('JSON.stringify({time:__commute.simClock.now(),fix:__commute.state.lastPosition,index:__commute.simulator.sim.index})')==current
                assert page.evaluate('__commute.simulationReporter.getReport().previousAttempts.length')==2
                assert not page.evaluate('__commute.simulator.sim.manualOverride')
                assert len(traffic)==baseline, traffic[baseline:]
                assert abs(page.evaluate('Date.now()')-native_date)<120000, 'simulator must not replace browser time'
                page.locator('#simExit').click()
                assert page.evaluate('!__commute.simClock.active&&!__commute.S().simulatorEnabled&&!__commute.S().simulatedFeeds')
                assert not errors, errors
                results.append({'design':'signal' if signal else 'panda','direction':direction,'route':route,'back':True,'resetInPlace':True,'mobileLayouts':6,'pageErrors':0,'liveCallsDuringSimulation':0})
                context.close()
    browser.close()
server.shutdown()
print(json.dumps({'browser':'Chromium','cases':results,'pass':True},indent=2))
