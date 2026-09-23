import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const phase = process.argv[2] ?? 'before';
const base = process.env.BASE_URL ?? 'http://127.0.0.1:5197';
const out = `artifacts/human-visual-ceiling/${phase}`;
mkdirSync(out, {recursive:true});
const executablePath = process.env.CHROMIUM_PATH ?? ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium'].find(existsSync);
const browser = await chromium.launch({headless:true, ...(executablePath ? {executablePath} : {})});
const report = {phase, base, samples:[], errors:[]};
async function sample(page,name) {
  await page.waitForTimeout(1800);
  const timing=[];
  for(let i=0;i<12;i++){timing.push(await page.evaluate(()=>JSON.parse(document.querySelector('[data-testid="scientific-worlds"]').getAttribute('data-runtime-diagnostics')).render));await page.waitForTimeout(200);}
  const data=await page.evaluate(() => {
    const w=document.querySelector('[data-testid="scientific-worlds"]');
    const c=document.querySelector('[data-testid="sw-canvas"]');
    const e=document.querySelector('[data-testid="sw-explorer"]');
    const rect=el=>el?JSON.parse(JSON.stringify(el.getBoundingClientRect())):null;
    const ui=['.human-hero-heading','.human-hero-tools','.human-hero-path','.human-hero-action','.human-inspector:not([hidden])','[data-testid="mobile-navigation"]'].map(selector=>({selector,rect:rect(document.querySelector(selector))})).filter(x=>x.rect?.width&&x.rect?.height);
    return {runtime:JSON.parse(w.getAttribute('data-runtime-diagnostics')),canvas:rect(c),explorer:rect(e),dpr:window.devicePixelRatio,renderDpr:c.width/c.clientWidth,overflow:document.documentElement.scrollWidth>window.innerWidth,level:e.getAttribute('data-level'),ui};
  });
  if(phase==='after'){
    assert.equal(data.overflow,false,`${name}: horizontal overflow`);
    for(let i=0;i<data.ui.length;i++)for(let j=i+1;j<data.ui.length;j++){
      const a=data.ui[i],b=data.ui[j],r=a.rect,s=b.rect;
      assert.ok(Math.min(r.right,s.right)-Math.max(r.left,s.left)<1||Math.min(r.bottom,s.bottom)-Math.max(r.top,s.top)<1,`${name}: ${a.selector} overlaps ${b.selector}`);
    }
  }
  await page.screenshot({path:`${out}/${name}.png`,timeout:60000});
  report.samples.push({name,...data,timing});
  writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));
 console.log(name,JSON.stringify(data.runtime.render));
}
async function open(viewport) {
 const mobile=viewport.width<500;
 const ctx=await browser.newContext({viewport,deviceScaleFactor:mobile?3:1,isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'});
 await ctx.addInitScript(()=>localStorage.setItem('genesis-os:onboarding/v1',JSON.stringify({completed:true})));
 const page=await ctx.newPage();page.on('pageerror',e=>report.errors.push(String(e)));
 await page.goto(`${base}/#/human-biology-lab`);
 await page.getByTestId('sw-explorer').waitFor({timeout:90000});
 if(await page.getByTestId('scientific-worlds').getAttribute('data-camera')!=='TWIN')await page.getByTestId('sw-explorer-twin-camera').click();
 await page.waitForFunction(()=>document.querySelector('[data-testid="sw-twin"]')?.getAttribute('data-load-state')==='READY',null,{timeout:90000});
 return {ctx,page};
}
async function level(page,target){
 await page.getByTestId(phase==='after'?`human-hero-${target}`:`sw-explorer-rung-${target}`).click();
 await page.waitForFunction(t=>{const w=document.querySelector('[data-testid="scientific-worlds"]'), e=document.querySelector('[data-testid="sw-explorer"]');const d=JSON.parse(w.getAttribute('data-runtime-diagnostics'));return e.getAttribute('data-level')===t&&w.getAttribute('data-macro-level')===t&&d.state==='IDLE';},target,{timeout:180000});
}
try {
 let {ctx,page}=await open({width:1440,height:900});
 await sample(page,'desktop-establishing');
 await level(page,'organ');await sample(page,'desktop-organ');
 await page.getByTestId(phase==='after'?'human-mode-ghost':'sw-explorer-surface-ghost').click();await sample(page,'desktop-ghost');
 await level(page,'tissue');await sample(page,'desktop-tissue');
 await level(page,'cell');await sample(page,'desktop-cell');await ctx.close();
 for(const [width,height] of [[375,812],[390,844],[430,932]]){
  ({ctx,page}=await open({width,height}));await sample(page,`mobile-${width}-hero`);
  if(phase==='after')await page.getByTestId('human-inspector-toggle').click();
  await sample(page,`mobile-${width}-inspector`);await ctx.close();
 }
 assert.equal(report.errors.length,0,'uncaught browser errors');
}finally{writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));await browser.close();}
