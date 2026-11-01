"""Check the built Along the line view: python tests/browser-along-line.py. Requires Playwright and Chromium."""
from playwright.sync_api import sync_playwright
import json, os
from pathlib import Path
root=Path(__file__).resolve().parents[1]
art=Path(os.environ.get('ALONG_ARTIFACT_DIR','/workspace/scratch'))
art.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=b.new_page(viewport={'width':390,'height':844},device_scale_factor=1)
 errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.route('**/*',lambda r:r.abort())
 page.add_init_script("localStorage.setItem('cartrefCommute.v1', JSON.stringify({settings:{provider:'demo',signal:true,alongLine:true},dirMode:'office'}))")
 page.route('https://cartref.test/**',lambda r:r.fulfill(status=200,content_type='text/html',body=(root/'index.html').read_text()))
 page.goto('https://cartref.test/index.html')
 page.wait_for_function('window.__commute && !__commute.state.loading')
 page.evaluate('''() => {const c=__commute,s=c.state,n=Date.now();const t={from:'LET',to:'KGX',std:'09:05',dep:n-15*60000,arr:n+20*60000,operator:'Great Northern',serviceId:'browser-along',depLate:0,arrLate:0,depUnknown:false,arrUnknown:false,cancelled:false,platform:'2',reason:'',calls:[{code:'LET',t:n-15*60000},{code:'KGX',t:n+20*60000}]};Object.assign(s,{boards:{'LET-KGX':{services:[t],msgs:[]}},boardsAt:n,railSource:'darwin',boardsDir:'office',here:[51.8158,-.1972],locAcc:10,locStatus:'ok',lastFixAt:n,onLine:true,atHub:null,inLondon:false,trainLock:{from:'LET',std:t.std,operator:t.operator,serviceId:t.serviceId,picked:true}});c.render();}''')
 page.locator('#alongEntry').click()
 page.locator('[data-point="digswell"] summary').click()
 page.screenshot(path=str(art/'along-light.png'))
 results=[]
 for width in [320,390]:
  page.set_viewport_size({'width':width,'height':844})
  for theme in ['light','dark','system-light','system-dark']:
   page.emulate_media(color_scheme='dark' if theme.endswith('dark') else 'light')
   page.evaluate('(theme)=>{if(theme.startsWith("system"))delete document.documentElement.dataset.theme;else document.documentElement.dataset.theme=theme}',theme)
   for size in [15,30]:
    page.locator('#alongLine').evaluate('(el,size)=>el.style.fontSize=size+"px"',size)
    m=page.locator('#alongLine').evaluate('''el=>({width:el.clientWidth,scroll:el.scrollWidth,buttons:[...el.querySelectorAll('button')].filter(b=>b.checkVisibility()).map(b=>({id:b.id,h:b.getBoundingClientRect().height,w:b.getBoundingClientRect().width})),bg:getComputedStyle(el).backgroundColor})''')
    expected_bg='rgb(9, 15, 22)' if theme.endswith('dark') else 'rgb(242, 245, 248)'
    assert m['bg']==expected_bg,(width,theme,size,'Incorrect appearance',m['bg'])
    assert m['scroll']<=m['width']+1,(width,theme,size,m)
    assert all(x['h']>=44 and x['w']>=44 for x in m['buttons']),(width,theme,size,m)
    results.append({'viewport':width,'theme':theme,'fontSize':size,**m})
 page.locator('#alongLine').evaluate('el=>el.style.fontSize="15px"')
 page.set_viewport_size({'width':390,'height':844})
 page.screenshot(path=str(art/'along-dark.png'))
 page.locator('#alongClose').click()
 assert page.locator('#alongEntry').evaluate('el=>el===document.activeElement')
 assert not errors,errors
 (art/'along-browser.json').write_text(json.dumps(results,indent=2))
 print('PASS: 320/390px, manual/system light/dark, 15/30px text, 44px targets, no dialog overflow, focus return, no page errors')
 b.close()
