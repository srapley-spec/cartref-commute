"""Optional real Chromium verification: python3 tests/browser-simulator.py (Playwright required)."""
import json,threading,http.server,functools
from pathlib import Path
from playwright.sync_api import sync_playwright
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*a):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(Path(__file__).resolve().parents[1])))
threading.Thread(target=server.serve_forever,daemon=True).start()
results=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=browser.new_page(geolocation={'latitude':51.975,'longitude':-.23,'accuracy':12},permissions=['geolocation'])
 errors=[];traffic=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 def network(route):
  if route.request.url.startswith('http://127.0.0.1:'):route.continue_()
  else:traffic.append(route.request.url);route.fulfill(status=200,content_type='application/json',body='{}')
 page.route('**/*',network);page.goto(f'http://127.0.0.1:{server.server_port}/index.html');page.wait_for_function('!!window.__commute')
 page.locator('#settingsBtn').click();page.locator('#s_simulator').check();page.locator('#s_simulatedFeeds').check();page.locator('#saveBtn').click();page.wait_for_timeout(200)
 baseline=len(traffic)
 page.evaluate('''() => {const set=window.setInterval,clear=window.clearInterval;window.playback=new Map();let id=90000;window.setInterval=(fn,ms)=>{if(ms!==1000)return set(fn,ms);const n=id++;playback.set(n,fn);return n;};window.clearInterval=n=>{if(!playback.delete(n))clear(n);};}''')
 # Real phone-size rendering, including explicit light/dark overrides on either system theme.
 for theme in ['light','dark']:
  page.emulate_media(color_scheme=theme)
  for override in [None,'light','dark']:
   page.evaluate("value => value ? document.documentElement.dataset.theme=value : delete document.documentElement.dataset.theme",override)
   for size in [{'width':393,'height':852},{'width':320,'height':568},{'width':852,'height':393}]:
    page.set_viewport_size(size)
    checks=page.evaluate(r"""() => {
     const panel=document.querySelector('#simPanel'),bar=document.querySelector('#simBar');
     const luminance=s=>{const c=s.match(/[\d.]+/g).slice(0,3).map(Number).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;});return c[0]*.2126+c[1]*.7152+c[2]*.0722;};
     const controls=[...document.querySelectorAll('#simPanel button,#simPanel input,#simPanel select,#simBar button')];
     return {overflow:panel.scrollWidth>panel.clientWidth+1,overlap:panel.getBoundingClientRect().bottom>bar.getBoundingClientRect().top,
      inside:bar.getBoundingClientRect().bottom<=innerHeight+1&&bar.getBoundingClientRect().top>=0,
      controls:controls.map(e=>{const c=getComputedStyle(e),a=luminance(c.color),b=luminance(c.backgroundColor);return {id:e.id,contrast:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),height:e.getBoundingClientRect().height};})};
    }""")
    assert not checks['overflow'] and not checks['overlap'] and checks['inside'],(theme,override,size,checks)
    assert all(c['contrast']>=4.5 and c['height']>=44 for c in checks['controls']),(theme,override,size,checks)
 page.set_viewport_size({'width':393,'height':852})
 page.locator('#simToggle').click();assert not page.locator('#simPanel').is_visible()
 page.locator('#simAdvance').click();assert page.locator('#simAdvance').inner_text()=='Continue'
 frozen=page.evaluate('__commute.simClock.now()');page.wait_for_timeout(30);assert page.evaluate('__commute.simClock.now()')==frozen
 page.locator('#simAdvance').click();assert page.locator('#simAdvance').inner_text()=='Pause'
 page.locator('#simAdvance').click();assert page.locator('#simAdvance').inner_text()=='Continue'
 page.locator('#simToggle').click();assert page.locator('#simPanel').is_visible()
 assert page.evaluate('__commute.simClock.now()')==frozen
 for direction in ['outbound','return']:
  for route in ['kgx','far']:
   page.select_option('#simPath',route);page.select_option('#simDirection',direction)
   for speed in ['1','5','20']:
    page.select_option('#simSpeed',speed);page.locator('#simPlay').click();page.locator('#simContinue').click()
    moved=page.evaluate('''() => {const c=__commute.simClock,t=c.now();for(const fn of [...playback.values()])fn();return c.now()-t;}''')
    assert moved==int(speed)*1000,(direction,route,speed,moved)
    page.locator('#simPause').click();assert page.evaluate('playback.size')==0
   page.select_option('#simSpeed','20');page.locator('#simPlay').click();count=page.evaluate('__commute.simulator.route().length')
   for index in range(count):
    assert page.evaluate('__commute.simulator.sim.index')==index
    frozen=page.evaluate('__commute.simClock.now()');page.wait_for_timeout(20);assert page.evaluate('__commute.simClock.now()')==frozen
    if index<count-1:
     page.locator('#simContinue').click();steps=page.evaluate('''() => {let n=0;while(playback.size && n++<2000)for(const fn of [...playback.values()])fn();return n;}''');assert steps<2000;page.wait_for_timeout(20)
   results.append({'route':route,'direction':direction,'checkpoints':count,'speeds':[1,5,20],'pass':True})
 assert len(traffic)==baseline,traffic[baseline:]
 page.locator('#simToggle').click();page.locator('#simExit').click();assert page.evaluate('!__commute.simClock.active && !__commute.S().simulatedFeeds && !__commute.simulator.sim.active')
 assert not errors,errors
 browser.close()
server.shutdown();print(json.dumps({'browser':'Chromium','phoneLayouts':18,'minimumControlContrast':4.5,'dockHideShow':True,'journeys':results,'pageErrors':errors,'liveCallsDuringSimulation':0},indent=2))
