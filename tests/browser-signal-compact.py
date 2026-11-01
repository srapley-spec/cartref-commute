"""Real Chromium checks for Signal information density and preserved controls.

Run after npm run build: python tests/browser-signal-compact.py.
--baseline-only records the immutable pre-redesign index from /workspace/scratch.
Uses normalized deterministic transport fixtures through the real engine/renderers; no live keys.
Both overnight fixtures retain one cancelled rail service; disrupted adds Tube closures and notices.
The 200% check doubles every visible computed text size once, including the journey times.
"""
import argparse
import functools
import http.server
import json
import os
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
ART=Path(os.environ.get('SIGNAL_ARTIFACT_DIR','/workspace/scratch'));ART.mkdir(parents=True,exist_ok=True)
BASE=ART/'signal-compact-baseline'
EPOCH='2026-11-03T03:22:00Z'

class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args): pass

def server_for(root):
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(root)))
 threading.Thread(target=server.serve_forever,daemon=True).start();return server

def inject(page,noisy=False):
 return page.evaluate('''noisy=>{
 const c=__commute,s=c.state,now=Date.now(),T=h=>Date.parse('2026-11-03T'+h+':00Z');
 const train=(from,to,std,arr,op,id,extra={})=>({from,to,std,dep:T(std),arr:T(arr),operator:op,serviceId:id,
  depLate:0,arrLate:0,depUnknown:false,cancelled:false,reason:'',platform:'1',...extra});
 const gn=[train('LET','KGX','04:55','05:46','Great Northern','gn0455'),train('LET','KGX','05:28','06:05','Great Northern','gn0528'),train('LET','KGX','05:40','06:16','Great Northern','gn0540',{cancelled:true,reason:'A train crew shortage'})];
 const tl=to=>[train('LET',to,'05:20',to==='STP'?'05:59':'06:04','Thameslink','tl0520'),train('LET',to,'05:50',to==='STP'?'06:29':'06:34','Thameslink','tl0550')];
 const facility='The toilets at Letchworth Garden City are currently unavailable. Please use the facilities at the next station.';
 s.boards={'LET-KGX':{services:gn,msgs:noisy?[facility]:[]},'LET-STP':{services:tl('STP'),msgs:[]},'LET-ZFD':{services:tl('ZFD'),msgs:[]}};
 const line=(id,name,closed=false)=>({id,name,statuses:[{sev:closed?20:10,desc:closed?'Service Closed':'Good Service',reason:closed?name+' service will resume later this morning. Full overnight service details remain available.':''}]});
 s.status=[line('circle','Circle',noisy),line('metropolitan','Metropolitan',noisy),line('hammersmith-city','Hammersmith & City',noisy)];
 s.nrStatus=[line('great-northern','Great Northern'),line('thameslink','Thameslink')];
 s.saved.settings={...s.saved.settings,provider:'rdm',rdmKey:'fixture-only',followRoute:true};
 s.saved.mode='commute';s.saved.dirMode='office';s.saved.pace='fast';s.saved.view='now';s.saved.home=[51.975,-.23];
 s.saved.followRoute=null;s.saved.viewOverride=null;s.presentation=null;s.journeySituationKey=null;
 Object.assign(s,{autoDir:'office',here:[51.975,-.23],locAcc:12,locStatus:'ok',lastFixAt:now,lastFixRecvAt:now,
  onLine:false,atHub:null,boardsAt:now,boardsSource:'darwin',boardsDir:'office',railSource:'darwin',fetchedAt:now,
  loading:false,errors:[],routeFailed:{},followFailedBoards:[],autoSrc:"you're near Letchworth (±12 m)"});
 c.render();
 return c.ranked(now).map(o=>({key:o.train.serviceId+'|'+o.hub,std:o.train.std,cancelled:o.train.cancelled,arrive:o.arrive,leave:o.leave}));
 }''',noisy)

def metrics(page):
 return page.evaluate('''()=>{
 const rect=e=>{if(!e||!e.getClientRects().length)return null;const r=e.getBoundingClientRect();return {top:r.top+scrollY,bottom:r.bottom+scrollY,height:r.height,width:r.width};};
 const hero=document.querySelector('#hero'),rows=[...document.querySelectorAll('#list>.row')];
 const controls=[...document.querySelectorAll('button,summary,input:not([type=checkbox]),select')].filter(e=>e.getClientRects().length);
 const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d');
 const rgba=c=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=c;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].map((x,i)=>i===3?x/255:x);};
 const composite=(a,b)=>a.slice(0,3).map((v,i)=>v*a[3]+b[i]*(1-a[3]));
 const background=e=>{const colors=[];for(let n=e;n;n=n.parentElement)colors.push(rgba(getComputedStyle(n).backgroundColor));let b=[255,255,255];for(const c of colors.reverse())b=composite(c,b);return b;};
 const luminance=a=>{a=a.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return a[0]*.2126+a[1]*.7152+a[2]*.0722;};
 const samples=[...document.querySelectorAll('#hero .optbig,#hero .optmeta,#hero .pill.bad,#list .meta,#list .follow-btn,#signalStatus,#signalAdjustments>summary')].filter(e=>e.getClientRects().length&&!e.disabled);
 const contrast=samples.map(e=>{const b=background(e),f=composite(rgba(getComputedStyle(e).color),b),a=luminance(f),z=luminance(b);return{text:e.textContent.trim().slice(0,40),ratio:(Math.max(a,z)+.05)/(Math.min(a,z)+.05)};});
 return {width:innerWidth,viewport:innerHeight,pageHeight:document.documentElement.scrollHeight,scrollWidth:document.documentElement.scrollWidth,
  hero:rect(hero),answer:rect(hero.querySelector('.optrow,.big')||hero),board:rect(document.querySelector('#list')),
  rows:rows.map(rect),controlHeights:controls.map(e=>({id:e.id||e.textContent.trim().slice(0,45),height:e.getBoundingClientRect().height,width:e.getBoundingClientRect().width})),
  contrast,trainRows:rows.map(e=>e.innerText),heroText:hero.innerText};
 }''')

def boot(browser,root,theme='dark',width=393):
 server=server_for(root)
 context=browser.new_context(viewport={'width':width,'height':852 if width==393 else 700},color_scheme=theme,geolocation={'latitude':51.975,'longitude':-.23,'accuracy':12},permissions=['geolocation'])
 context.add_init_script('''(()=>{const D=Date,t=D.parse('2026-11-03T03:22:00Z');window.Date=class extends D{constructor(...x){super(...(x.length?x:[t]));}static now(){return t;}};
 if(!localStorage.getItem('cartrefCommute.v1'))localStorage.setItem('cartrefCommute.v1',JSON.stringify({mode:'commute',dirMode:'office',pace:'fast',home:[51.975,-.23],settings:{provider:'demo',followRoute:true}}));})();''')
 page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 def network(r):
  if r.request.url.startswith('http://127.0.0.1:'):r.continue_()
  else:r.fulfill(status=200,content_type='application/json',body='[]' if '/Line/' in r.request.url else '{}')
 page.route('**/*',network);page.goto(f'http://127.0.0.1:{server.server_port}/index.html');page.wait_for_function('!!window.__commute && !!__commute.state.boards')
 return server,context,page,errors


def capture_baseline(browser):
 assert (BASE/'index.html').exists(),'Save HEAD:index.html to the immutable baseline before editing.'
 out={}
 for noisy in [False,True]:
  server,context,page,errors=boot(browser,BASE)
  try:
   inject(page,noisy);label='disrupted' if noisy else 'normal';out[label]=metrics(page)
   page.screenshot(path=str(ART/f'signal-compact-before-{label}-dark.png'),full_page=True)
   assert not errors,errors
  finally:context.close();server.shutdown()
 (ART/'signal-compact-before.json').write_text(json.dumps(out,indent=2));return out


def check_density(page,label,width,noisy):
 m=metrics(page)
 # The journey-clarity release deliberately exposes location evidence and serious disruption before the
 # answer; the later centred-duration release deliberately stacks its two duration facts.
 # Measure layout overhead separately so those required facts cannot be hidden
 # merely to satisfy thresholds from the earlier compact-only design.
 allowances=page.evaluate('''()=>{
  const disruption=document.querySelector('#signalDisruptions');
  const height=e=>e?.checkVisibility()?e.getBoundingClientRect().height:0;
  const boarding=[...document.querySelectorAll('#hero .signal-alt-boarding')].filter(e=>e.checkVisibility());
  const location=document.querySelector('#dirNote');
  const status=document.querySelector('#signalStatus');
  const durations=[...document.querySelectorAll('#hero .journey-facts')].filter(e=>e.checkVisibility());
  const rowDurations=[...document.querySelectorAll('#list>.row')].map(e=>height(e.querySelector('.journey-facts')));
  if([...disruption.children].some(e=>!e.checkVisibility()))throw Error('Significant disruption is concealed');
  return {alerts:[disruption,location,status].reduce((total,e)=>total+height(e)+(height(e)?8:0),0),
   boarding:boarding.reduce((total,e)=>total+height(e)+4,0),
   durations:durations.reduce((total,e)=>total+height(e),0),rowDurations};
 }''')
 assert m['scrollWidth']<=width+1,(label,'horizontal overflow',m)
 assert m['answer']['top']-allowances['alerts']<(320 if noisy else 260),(label,'answer buried below controls/notices',m)
 assert m['answer']['bottom']-allowances['alerts']<m['viewport'],(label,'primary answer is not visible without scrolling',m)
 assert m['board']['top']-allowances['alerts']-allowances['boarding']-allowances['durations']<(650 if width==393 else 740),(label,'board starts too far down',m)
 assert all(r is not None and r['height']>0 for r in m['rows']),(label,'a loaded train was visually hidden',m)
 if width==393:
  assert all(0<h<=48 for h in allowances['rowDurations']),(label,'centred duration facts are hidden or oversized',allowances)
  assert max(r['height']-h for r,h in zip(m['rows'],allowances['rowDurations']))<220,(label,'row overhead remains excessively tall',m)
 assert all(c['height']>=43.9 and c['width']>=43.9 for c in m['controlHeights']),(label,'touch targets below44',m['controlHeights'])
 assert all(c['ratio']>=4.5 for c in m['contrast']),(label,'actual text contrast below4.5',m['contrast'])
 return m

def assert_time_legibility(page,label):
 overlaps=page.evaluate('''()=>{
 const problems=[];
 for(const container of document.querySelectorAll('#hero .optrow,#list>.row')){
  const times=[...container.querySelectorAll('.optbig,.optarrow,.t,.follow-btn')].filter(e=>e.checkVisibility());
  for(let i=0;i<times.length;i++)for(let j=i+1;j<times.length;j++){
   const a=times[i].getBoundingClientRect(),b=times[j].getBoundingClientRect();
   if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1)
    problems.push([times[i].textContent,times[j].textContent]);
  }
 }
 return problems;
 }''')
 assert not overlaps,(label,'times, direction or Follow action overlap',overlaps)


def run_current(browser):
 results=[]
 for theme in ['light','dark']:
  for width in [393,320]:
   server,context,page,errors=boot(browser,ROOT,theme,width)
   try:
    for noisy in [False,True]:
     expected=inject(page,noisy);label=f'{"disrupted" if noisy else "normal"}-{theme}-{width}'
     page.evaluate('scrollTo(0,0)');page.screenshot(path=str(ART/f'signal-compact-{label}.png'),full_page=True);m=check_density(page,label,width,noisy)
     assert_time_legibility(page,label)
     assert len(m['rows'])==len(expected),(label,'train rows hidden',len(m['rows']),len(expected))
     assert all(any(o['std'] in row for row in m['trainRows']) for o in expected),(label,'a loaded departure disappeared',expected,m['trainRows'])
     assert any('Cancelled' in row for row in m['trainRows']),'cancelled train must remain visible'
     alternative_service=page.locator('#hero .signal-alternative > summary .signal-alt-service')
     assert alternative_service.is_visible(),'collapsed next-best option has no train identity'
     assert all(text in alternative_service.inner_text() for text in ['05:20','Thameslink','platform 1'])
     if noisy:
      status=page.locator('#signalStatus');assert status.is_visible()
      assert 'closed' in status.inner_text().lower()
      assert status.bounding_box()['y']+status.bounding_box()['height']<m['viewport'],'severe warning is below the fold'
      page.locator('#signalNotices > summary').click()
      assert page.locator('#banners').is_visible()
      page.locator('#banners details').filter(has_text='Circle').first.locator('summary').first.click()
      assert 'Full overnight service details' in page.locator('#banners').inner_text()
      facilities=page.locator('#banners details[data-key="facilities"]')
      facilities.locator('summary').click()
      assert 'Please use the facilities at the next station.' in facilities.inner_text()
      if theme=='dark' and width==393:
       page.screenshot(path=str(ART/'signal-compact-expanded-alerts-dark-393.png'),full_page=True)
      page.locator('#signalNotices > summary').click()
     page.screenshot(path=str(ART/f'signal-compact-{label}.png'),full_page=True)
     results.append({'state':label,**m})
    page.locator('#signalNetwork > summary').click()
    for service in ['Circle','Hammersmith & City','Metropolitan','Great Northern','Thameslink']:
     assert service in page.locator('#signalNetwork').inner_text(),('missing line status',service)
    page.locator('#signalNetwork > summary').click()
    fallback=page.locator('#hero .signal-alternative')
    fallback.locator(':scope > summary').click()
    assert fallback.locator('.optmeta').is_visible(),'next-best train details are inaccessible'
    assert fallback.locator('[data-follow]').is_visible(),'next-best train cannot be followed'
    if theme=='dark' and width==393:
     page.screenshot(path=str(ART/'signal-compact-expanded-nextbest-dark-393.png'),full_page=True)
    fallback.locator(':scope > summary').click()
    # Manual appearance overrides work on either device appearance, using real Settings.
    for appearance in ['light','dark','system']:
     page.locator('#settingsBtn').click();page.select_option('#s_appearance',appearance);page.locator('#saveBtn').click()
     page.wait_for_function("!document.querySelector('#settings').open")
     inject(page,True);page.evaluate('scrollTo(0,0)')
     variant=check_density(page,f'{theme}-{width}-appearance-{appearance}',width,True)
     expected_theme=theme if appearance=='system' else appearance
     canvas=page.evaluate("getComputedStyle(document.body).backgroundColor")
     if expected_theme=='dark':assert max(int(x) for x in canvas.split('(')[1].split(')')[0].split(',')[:3])<80,canvas
     else:assert min(int(x) for x in canvas.split('(')[1].split(')')[0].split(',')[:3])>200,canvas
     results.append({'state':f'disrupted-{theme}-{width}-appearance-{appearance}',**variant})
    # The compact disclosure keeps all original adjustments usable.
    page.locator('#signalAdjustments > summary').click()
    for selector in ['[data-mode="leisure"]','[data-dir="home"]','[data-pace="avg"]']:
     assert page.locator(selector).is_visible(),selector
    for selector in ['[data-mode="leisure"]','[data-mode="commute"]','[data-dir="home"]','[data-dir="office"]']:
     page.locator(selector).click();assert page.locator(selector).get_attribute('aria-pressed')=='true',selector
    page.wait_for_function('!__commute.state.loading')
    page.locator('[data-pace="avg"]').click();assert page.locator('[data-pace="avg"]').get_attribute('aria-pressed')=='true'
    page.locator('[data-pace="fast"]').click();page.locator('#signalAdjustments > summary').click()
    page.locator('[data-view="by"]').click();assert page.locator('#byForm').is_visible()
    page.locator('#byTime').fill('08:30');page.locator('[data-view="now"]').click()
    inject(page,True)
    # Following is a true app interaction, not a separate mock view.
    page.locator('[data-follow]:not([disabled])').first.click();assert page.locator('#followPanel').is_visible()
    page.evaluate('scrollTo(0,0)')
    if theme=='dark' and width==393:
     page.screenshot(path=str(ART/'signal-compact-followed-beforetrain-dark-393.png'),full_page=True)
    chosen=page.evaluate('__commute.state.saved.followRoute.id')
    page.locator('#list [data-follow]:not([disabled])').first.click()
    replacement=page.evaluate('__commute.state.saved.followRoute.id')
    assert replacement!=chosen,'selecting another visible train did not change the followed route'
    chosen=replacement
    page.evaluate('''()=>{const s=__commute.state,selected=s.saved.followRoute.option.train.serviceId;for(const board of Object.values(s.boards))for(const train of board.services)if(train.serviceId===selected){train.dep+=120000;train.arr+=180000;train.depLate=2;train.arrLate=3;}s.boardsAt=Date.now();__commute.render();}''')
    assert page.evaluate('__commute.state.saved.followRoute.id')==chosen,'refresh changed the followed train'
    assert page.locator('#followPanel').is_visible()
    page.locator('[data-journey-view="plan"]').click();assert page.locator('#followPanel').is_visible()
    assert page.evaluate('__commute.state.saved.followRoute.id')==chosen
    page.reload();page.wait_for_function('!!window.__commute && !!__commute.state.saved.followRoute')
    assert page.evaluate('__commute.state.saved.followRoute.id')==chosen
    assert page.evaluate("document.documentElement.dataset.design==='signal'")
    page.locator('[data-follow-action="stop"]').click();assert not page.locator('#followPanel').is_visible()
    inject(page,True)
    # Twofold text stress is allowed to grow vertically, but no information may clip horizontally.
    page.evaluate('''()=>{window.compactFontSnapshot=[...document.querySelectorAll('body,body *')].filter(e=>e.checkVisibility()).map(e=>({e,size:parseFloat(getComputedStyle(e).fontSize),prior:e.style.fontSize}));for(const {e,size} of compactFontSnapshot)e.style.setProperty('font-size',(size*2)+'px','important');}''')
    page.evaluate('scrollTo(0,0)');page.screenshot(path=str(ART/f'signal-compact-200-percent-{theme}-{width}.png'),full_page=True)
    enlarged=metrics(page);assert enlarged['scrollWidth']<=width+1,('large text',theme,width,enlarged)
    assert_time_legibility(page,f'200%text-{theme}-{width}')
    page.evaluate('''()=>{for(const {e,prior} of compactFontSnapshot){if(prior)e.style.fontSize=prior;else e.style.removeProperty('font-size');}delete window.compactFontSnapshot;}''')
    # Advance this fixture past departure and exercise explicit boarding through the real button.
    page.locator('[data-follow]:not([disabled])').first.click()
    page.evaluate('''()=>{const now=Date.parse('2026-11-03T05:00:00Z');Date.now=()=>now;Object.assign(__commute.state,{boardsAt:now,locStatus:'denied',lastFixAt:0,lastFixRecvAt:0});__commute.render();}''')
    page.locator('[data-follow-action="boarded"]').click()
    assert page.evaluate('__commute.state.saved.followRoute.phase')=='on-train'
    assert page.locator('#followPanel').is_visible()
    page.evaluate('scrollTo(0,0)');arrival=page.locator('#followPanel .big').bounding_box()
    assert arrival['y']+arrival['height']<(852 if width==393 else 700),'followed arrival is below the fold'
    if theme=='dark' and width==393:
     page.screenshot(path=str(ART/'signal-compact-followed-confirmed-ontrain-dark-393.png'),full_page=True)
    assert not errors,errors
   finally:context.close();server.shutdown()
 (ART/'signal-compact-after.json').write_text(json.dumps(results,indent=2))
 return results

if __name__=='__main__':
 args=argparse.ArgumentParser();args.add_argument('--baseline-only',action='store_true');opt=args.parse_args()
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox'])
  try:
   if opt.baseline_only:
    values=capture_baseline(browser)
    print(json.dumps({k:{'answerTop':v['answer']['top'],'boardTop':v['board']['top'],'rowHeights':[r['height'] for r in v['rows']],'pageHeight':v['pageHeight']} for k,v in values.items()},indent=2))
   else:
    values=run_current(browser)
    print(json.dumps({'layouts':len(values),'checks':'density,full-board,cancellation,notices,adjustments,plan,follow,large-text','metrics':[{k:v for k,v in x.items() if k in ['state','width','pageHeight','answer','board','rows']} for x in values]},indent=2))
  finally:browser.close()
