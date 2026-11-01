"""Independent native retirement checks: two-station summaries and reachable full evidence.

Run after building: python tests/browser-panda-independent-review.py.
Only the existing server/browser setup is reused; the fixtures and assertions below are independent.
"""
import hashlib
import importlib.util
import json
import os
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
ART = Path(os.environ.get('PANDA_INDEPENDENT_ARTIFACT_DIR', '/workspace/scratch/panda-independent'))
ART.mkdir(parents=True, exist_ok=True)
spec = importlib.util.spec_from_file_location('compact_setup', ROOT / 'tests/browser-signal-compact.py')
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)


def inject(page):
    return page.evaluate('''() => {
      const c=__commute,s=c.state,n=Date.now(),M=60000;
      const t=(from,dep,arr,id,p)=>({from,to:'LET',std:new Date(n+dep*M).toISOString().slice(11,16),
        dep:n+dep*M,arr:n+arr*M,serviceId:id,operator:'Thameslink',platform:p,
        depLate:0,arrLate:0,depUnknown:false,arrUnknown:false,cancelled:false,reason:''});
      Object.assign(s,{boards:{'KGX-LET':{services:[],msgs:[]},
        'STP-LET':{services:[t('STP',40,80,'first','B'),t('STP',60,100,'second','')],msgs:[]},
        'ZFD-LET':{services:[t('ZFD',35,80,'first','4'),t('ZFD',55,100,'second','5')],msgs:[]}},
        boardsAt:n,boardsDir:'home',railSource:'darwin',routeFailed:{},loading:false,errors:[],
        here:null,onLine:false,atHub:null,inLondon:false});
      s.saved.dirMode='home';s.saved.mode='commute';s.saved.view='now';s.saved.followRoute=null;
      s.saved.viewOverride=null;s.saved.settings.followRoute=true;
      c.render();document.querySelector('[data-journey-view="plan"]').click();
      return {zfd:new Date(n+55*M).toISOString().slice(11,16),stp:new Date(n+60*M).toISOString().slice(11,16)};
    }''')


def geometry(page, label):
    result = page.evaluate('''() => {
      const issues=[];
      for(const e of document.querySelectorAll('#hero .signal-alternative>summary,#hero .optrow,#list .row')){
        if(!e.checkVisibility())continue;
        const r=e.getBoundingClientRect();if(r.right>innerWidth+1||r.left< -1)issues.push('outside viewport: '+e.innerText);
      }
      for(const e of document.querySelectorAll('#hero .optrow')){
        if(!e.checkVisibility())continue;
        const values=[...e.querySelectorAll('.optbig')].filter(e=>e.checkVisibility());
        for(let i=0;i<values.length;i++)for(let j=i+1;j<values.length;j++){
          const a=values[i].getBoundingClientRect(),b=values[j].getBoundingClientRect();
          if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1)issues.push('time overlap');
        }
      }
      const b=document.querySelector('#hero .signal-alternative [data-follow]').getBoundingClientRect();
      return {scrollWidth:document.documentElement.scrollWidth,width:innerWidth,issues,follow:{width:b.width,height:b.height}};
    }''')
    assert not result['issues'], (label, result)
    assert result['scrollWidth'] <= result['width'] + 1, (label, result)
    assert result['follow']['width'] >= 44 and result['follow']['height'] >= 44, (label, result)
    return result


results = []
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), args=['--no-sandbox'])
    try:
        for theme in ['light', 'dark']:
            for width in [320, 390]:
                server, context, page, errors = setup.boot(browser, ROOT, theme, width)
                try:
                    expected = inject(page)
                    detail = page.locator('#hero .signal-alternative')
                    summary = detail.locator(':scope>summary')
                    text = summary.inner_text()
                    assert 'Farringdon '+expected['zfd']+' platform 5' in text, text
                    assert 'St Pancras '+expected['stp'] in text, text
                    assert 'platform' not in summary.locator('.signal-alt-service').inner_text()
                    assert not detail.evaluate('e=>e.open')
                    page.screenshot(path=str(ART / f'{theme}-{width}-collapsed.png'), full_page=True)
                    summary.focus()
                    page.keyboard.press('Enter')
                    assert detail.evaluate('e=>e.open'), 'native keyboard disclosure must expose the retained original content'
                    assert detail.locator('.optmeta').is_visible()
                    assert detail.locator('[data-follow]').is_visible()
                    for enlarged in [False, True]:
                        if enlarged:
                            page.evaluate('''() => {
                              window.independentFonts=[...document.querySelectorAll('body,body *')].filter(e=>e.checkVisibility()).map(e=>({e,size:parseFloat(getComputedStyle(e).fontSize),prior:e.style.fontSize}));
                              for(const {e,size}of independentFonts)e.style.setProperty('font-size',(size*2)+'px','important');
                            }''')
                        label=f'{theme}-{width}-'+('200-percent' if enlarged else 'normal')
                        results.append({'case':label,**geometry(page,label)})
                        page.screenshot(path=str(ART / (label+'.png')), full_page=True)
                    page.evaluate('''() => {
                      for(const {e,prior}of independentFonts){if(prior)e.style.fontSize=prior;else e.style.removeProperty('font-size');}
                      const c=__commute,s=c.state;s.errors=['Independent native diagnostic detail'];s.boardsAt=Date.now()-180001;
                      s.status=[{id:'circle',name:'Circle',statuses:[{sev:9,desc:'Minor Delays',reason:'Independent full source notice'}]},
                        {id:'metropolitan',name:'Metropolitan',statuses:[{sev:10,desc:'Good Service'}]},
                        {id:'hammersmith-city',name:'Hammersmith & City',statuses:[{sev:10,desc:'Good Service'}]}];c.render();
                    }''')
                    assert page.locator('#signalDisruptions').is_visible()
                    assert 'Independent native diagnostic detail' in page.locator('#signalDisruptions').inner_text()
                    page.locator('#signalNotices>summary').click()
                    assert page.locator('#banners').is_visible()
                    page.locator('#banners details').filter(has_text='Circle: Minor Delays').locator('summary').click()
                    assert 'Independent full source notice' in page.locator('#banners').inner_text()
                    assert 'check a live board before relying' in page.locator('#banners').inner_text()
                    page.locator('#signalNetwork>summary').click()
                    assert page.locator('#status').is_visible()
                    assert 'Metropolitan' in page.locator('#status').inner_text()
                    assert 'Tube legs are estimates' in page.locator('#modelNote').inner_text()
                    page.evaluate('__commute.render()')
                    assert page.locator('#signalNotices').evaluate('e=>e.open')
                    assert page.locator('#signalNetwork').evaluate('e=>e.open')
                    assert page.locator('#banners details').filter(has_text='Circle: Minor Delays').evaluate('e=>e.open')
                    assert not errors, errors
                finally:
                    context.close()
                    server.shutdown()
    finally:
        browser.close()

report={'candidateBuildSha256':hashlib.sha256((ROOT/'index.html').read_bytes()).hexdigest(),'cases':results,'pageErrors':[]}
(ART/'results.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
