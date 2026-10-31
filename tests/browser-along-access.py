"""Exercise the real flag -> guided simulator -> Along navigation flow in both designs."""
import importlib.util
import json
import os
from pathlib import Path
import sys
from playwright.sync_api import sync_playwright
sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parents[1]
ART=Path(os.environ.get('ALONG_ACCESS_ARTIFACT_DIR','/workspace/scratch'))
ART.mkdir(parents=True,exist_ok=True)
spec=importlib.util.spec_from_file_location('journey_clarity',ROOT/'tests/browser-signal-journey-clarity.py')
journey=importlib.util.module_from_spec(spec);spec.loader.exec_module(journey)
results=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for signal in [False,True]:
  server,context,page,errors=journey.compact.boot(browser,ROOT,'light',390)
  try:
   page.locator('#settingsBtn').click()
   page.locator('#s_signal').set_checked(signal)
   page.locator('#s_followRoute').uncheck()
   page.locator('#s_alongLine').check();page.locator('#saveBtn').click()
   journey.start_journey(page)
   for index in range(5):
    for width in [320,390]:
     page.set_viewport_size({'width':width,'height':844})
     nav=page.locator('#alongNavigation');entry=page.locator('#alongEntry')
     assert nav.is_visible() and entry.is_visible(),(signal,index,'missing enabled navigation')
     box=entry.bounding_box()
     assert box['y']>=0 and box['y']+box['height']<=844,(signal,index,width,'navigation is outside the viewport',box)
     assert box['height']>=44 and box['width']>=44
     assert nav.evaluate('e=>e.scrollWidth<=e.clientWidth+1')
     entry.click();assert page.locator('#alongLine').evaluate('e=>e.open')
     heading=page.locator('#alongJourney').inner_text()
     assert ('Browse' in heading)==(index<4),(signal,index,heading)
     assert page.locator('[data-point="digswell"]').count()==1
     assert page.locator('[data-point="hitchin"]').is_visible(),'all route points stay browsable outside the chosen interests'
     if index==0:assert page.locator('#alongEvidence').inner_text().startswith('Browse this route')
     if index==4:
      page.screenshot(path=str(ART/f'along-access-{"signal" if signal else "panda"}-{width}.png'))
     page.locator('#alongClose').click()
     assert entry.evaluate('e=>e===document.activeElement')
     results.append({'signal':signal,'checkpoint':index,'width':width,'button':box,'heading':heading})
    if index<4:journey.next_checkpoint(page)
   # Scroll back from the current train position to a passed point, then let GPS progress.
   page.locator('#alongEntry').click()
   point=page.locator('[data-point="hitchin"]')
   assert point.get_attribute('data-state')=='passed'
   point.locator('summary').click();point.locator('.al-more').click()
   assert point.locator('.al-explore').is_visible()
   assert 'flat junction' in point.inner_text()
   page.evaluate("window.__accessReading=document.querySelector('[data-point=\"hitchin\"] details')")
   page.evaluate('async()=>await __commute.simulator.nextCheckpoint()')
   journey.settle(page)
   assert point.locator('details').evaluate('e=>e.open&&e===window.__accessReading'),'a new location must preserve the article being read'
   assert point.is_visible()
   page.locator('#alongClose').click()
   assert page.evaluate('__commute.S().followRoute') is False
   assert not errors,errors
  finally:
   context.close();server.shutdown()
 browser.close()
(ART/'along-access-results.json').write_text(json.dumps(results,indent=2))
print('PASS: real opt-in and simulator checkpoints 0-4; both designs; 320/390px; visible access, browse/onboard transition, passed-point reading across GPS progress, focus and 44px targets')
