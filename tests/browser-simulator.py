"""Real Chromium regression: python3 tests/browser-simulator.py (Playwright required)."""
import json, threading, http.server, functools
from pathlib import Path
from playwright.sync_api import sync_playwright

class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args): pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(Path(__file__).resolve().parents[1])))
threading.Thread(target=server.serve_forever,daemon=True).start()
results=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':320,'height':568},geolocation={'latitude':51.975,'longitude':-.23,'accuracy':12},permissions=['geolocation'])
 errors=[];traffic=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 def network(route):
  if route.request.url.startswith('http://127.0.0.1:'):route.continue_()
  else:traffic.append(route.request.url);route.fulfill(status=200,content_type='application/json',body='{}')
 page.route('**/*',network)
 page.goto(f'http://127.0.0.1:{server.server_port}/index.html');page.wait_for_function('!!window.__commute')
 page.locator('#journeySimulatorBtn').click()
 assert page.locator('#journeyModeButton').get_attribute('aria-pressed')=='true'
 assert not page.evaluate('__commute.simClock.active || __commute.simulator.sim.active')
 assert not page.locator('#simAdvanced').evaluate('e=>e.open')
 # Direction, corridor, Start are the only three deliberate setup actions.
 page.select_option('#journeyDirection','return');page.select_option('#journeyRoute','far')
 start=page.locator('#journeyStart').bounding_box();assert start and start['y']>=0 and start['y']+start['height']<=568,'Start requires no extra scroll action'
 page.locator('#journeyStart').click()
 page.wait_for_function('__commute.simulator.sim.active && document.querySelector("#simPanel").hidden')
 page.wait_for_function('!__commute.simulator.getView().verification.pending && !!__commute.simulator.getView().verification.current')
 assert page.evaluate('__commute.S().simulatorEnabled && __commute.S().simulatedFeeds && __commute.simClock.active')
 assert page.evaluate('__commute.simulator.sim.index')==0
 assert page.evaluate('__commute.simulator.sim.timer') is None
 assert not page.locator('#simPanel').is_visible()
 assert page.locator('#hero').inner_text().strip(),'the real app is the journey screen'
 page.wait_for_function("""() => {
  const target=document.querySelector('#hero .big')||document.querySelector('#hero'),bar=document.querySelector('#simBar');
  const r=target.getBoundingClientRect(),b=bar.getBoundingClientRect();
  return r.width>0&&Math.min(r.bottom,b.top)-Math.max(r.top,0)>=Math.min(44,r.height);
 }""")
 frozen=page.evaluate('__commute.simClock.now()');page.wait_for_timeout(30);assert page.evaluate('__commute.simClock.now()')==frozen
 baseline=len(traffic)
 page.evaluate('''() => {const set=window.setInterval,clear=window.clearInterval;window.playback=new Map();let id=90000;window.setInterval=(fn,ms)=>{if(ms!==1000)return set(fn,ms);const n=id++;playback.set(n,fn);return n;};window.clearInterval=n=>{if(!playback.delete(n))clear(n);};}''')
 def open_mode(mode):
  if not page.locator('#simPanel').is_visible():page.locator('#simToggle').click()
  page.locator('#journeyAdvancedButton' if mode=='advanced' else '#journeyModeButton').click()
  if mode=='advanced':assert page.locator('#simAdvanced').evaluate('e=>e.open')
 # Preserve all previous readability assertions, now opening progressive disclosure
 # before inspecting its controls. Check both mode surfaces, including native checkbox labels.
 for theme in ['light','dark']:
  page.emulate_media(color_scheme=theme)
  for override in [None,'light','dark']:
   page.evaluate("value => value ? document.documentElement.dataset.theme=value : delete document.documentElement.dataset.theme",override)
   for size in [{'width':393,'height':852},{'width':320,'height':568},{'width':852,'height':393}]:
    page.set_viewport_size(size)
    for mode in ['journey','advanced']:
     open_mode(mode)
     page.wait_for_timeout(10)
     checks=page.evaluate(r'''() => {
      const panel=document.querySelector('#simPanel'),bar=document.querySelector('#simBar');
      const luminance=s=>{const c=s.match(/[\d.]+/g).slice(0,3).map(Number).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;});return c[0]*.2126+c[1]*.7152+c[2]*.0722;};
      const visible=e=>!!e.getClientRects().length;
      const background=e=>{let current=e;while(current){const s=getComputedStyle(current).backgroundColor;if(s!=='transparent'&&!/^rgba\([^)]*,\s*0\)$/.test(s))return s;current=current.parentElement;}return 'rgb(255,255,255)';};
      const controls=[...document.querySelectorAll('#simPanel button,#simPanel input,#simPanel select,#simPanel summary,#simBar button')].filter(visible);
      const rect=bar.getBoundingClientRect();
      return {overflow:panel.scrollWidth>panel.clientWidth+1,overlap:panel.getBoundingClientRect().bottom>rect.top,
       inside:rect.bottom<=innerHeight+1&&rect.top>=0,dockHeight:rect.height,reserved:parseFloat(getComputedStyle(document.body).paddingBottom),
       controls:controls.map(e=>{const checkbox=e.matches('input[type=checkbox]'),target=checkbox?e.closest('label'):e,c=getComputedStyle(target),a=luminance(c.color),b=luminance(background(target));return {id:e.id||e.tagName,contrast:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),height:target.getBoundingClientRect().height};})};
     }''')
     assert not checks['overflow'] and not checks['overlap'] and checks['inside'],(theme,override,size,mode,checks)
     assert checks['reserved']>=checks['dockHeight'],('real app must scroll clear of measured dock',checks)
     assert checks['dockHeight']<=min(190,size['height']*.45),('supporting overlay must remain compact',size,checks)
     assert all(c['contrast']>=4.5 and c['height']>=44 for c in checks['controls']),(theme,override,size,mode,checks)
 page.set_viewport_size({'width':393,'height':852});open_mode('advanced')
 # Collapsing/expanding, switching mode and inspecting the timeline preserve playback.
 page.locator('#simToggle').click();assert not page.locator('#simPanel').is_visible()
 page.locator('#simAdvance').click();assert page.locator('#simAdvance').inner_text()=='Pause'
 active_timer=page.evaluate('__commute.simulator.sim.timer')
 page.locator('#simToggle').click();page.locator('#journeyAdvancedButton').click();page.locator('#journeyTimelineToggle').click()
 assert page.locator('#journeyTimelineDetails').evaluate('e=>e.open')
 page.locator('[data-checkpoint-inspect]').last.click()
 assert page.evaluate('__commute.simulator.sim.timer')==active_timer
 assert page.evaluate('__commute.simClock.now()')==frozen
 page.locator('#simAdvance').click();assert page.locator('#simAdvance').inner_text()=='Continue'
 assert page.evaluate('playback.size')==0
 for direction in ['outbound','return']:
  for route in ['kgx','far']:
   open_mode('advanced');page.select_option('#simPath',route);page.select_option('#simDirection',direction)
   for speed in ['1','5','20']:
    open_mode('advanced');page.select_option('#simSpeed',speed);page.locator('#simPlay').click();page.locator('#simContinue').click()
    moved=page.evaluate('''() => {const c=__commute.simClock,t=c.now();for(const fn of [...playback.values()])fn();return c.now()-t;}''')
    assert moved==int(speed)*1000,(direction,route,speed,moved)
    page.locator('#simPause').click();assert page.evaluate('playback.size')==0
   page.select_option('#simSpeed','20');page.locator('#simPlay').click();count=page.evaluate('__commute.simulator.route().length')
   for index in range(count):
    assert page.evaluate('__commute.simulator.sim.index')==index
    instant=page.evaluate('__commute.simClock.now()');page.wait_for_timeout(20);assert page.evaluate('__commute.simClock.now()')==instant
    if index<count-1:
     page.locator('#simContinue').click();steps=page.evaluate('''() => {let n=0;while(playback.size && n++<2000)for(const fn of [...playback.values()])fn();return n;}''');assert steps<2000;page.wait_for_timeout(20)
   results.append({'route':route,'direction':direction,'checkpoints':count,'speeds':[1,5,20],'pass':True})
 assert len(traffic)==baseline,traffic[baseline:]
 page.locator('#simExit').click();assert page.evaluate('!__commute.simClock.active && !__commute.S().simulatedFeeds && !__commute.simulator.sim.active')
 # Reports survive Stop without resuming a simulation, and use the browser's actual download path.
 page.locator('#journeySimulatorBtn').click()
 if not page.locator('#journeyResultsDetails').evaluate('e=>e.open'):page.locator('#journeyResultsDetails > summary').click()
 with page.expect_download() as download_info:page.locator('#journeyExportResults').click()
 exported=download_info.value;report=json.loads(Path(exported.path()).read_text())
 assert report['kind']=='cartref-commute-simulation' and report['checkpoints']
 assert not page.evaluate('__commute.simClock.active || __commute.simulator.sim.active')
 assert not errors,errors
 browser.close()
server.shutdown()
print(json.dumps({'browser':'Chromium','phoneLayouts':18,'modes':['journey','advanced'],'minimumControlContrast':4.5,'guidedActions':3,'dockHideShow':True,'reportDownload':True,'journeys':results,'pageErrors':errors,'liveCallsDuringSimulation':0},indent=2))
