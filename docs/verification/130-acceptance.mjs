import { chromium } from 'playwright';
const base='http://127.0.0.1:4314', browser=await chromium.launch();
const result = {};
try {
  const ctx=await browser.newContext({permissions:['clipboard-read','clipboard-write']});
  const page=await ctx.newPage();
  const text='같은 내용의 두 번째 종목 메모';
  await page.goto(base+'/journal');
  const editor=page.getByLabel('매매 메모'), select=page.getByRole('combobox');
  await page.locator('form button:enabled').waitFor();
  await editor.fill(text);
  let received, release;
  const waitRequest=new Promise(r=>{received=r}), gate=new Promise(r=>{release=r});
  let payload;
  await page.route('**/api/journal',async route=>{payload=route.request().postDataJSON();received();await gate;await route.continue();});
  await page.getByRole('button',{name:'일지 저장'}).click(); await waitRequest;
  try { await select.selectOption('000660'); await editor.fill('새 종목용 편집'); await editor.fill(text); }
  finally {release();}
  await page.locator('.journal-entry').filter({hasText:text}).waitFor();
  const journal=(await (await page.request.get(base+'/api/state')).json()).journal.filter(x=>x.text===text);
  result.journal={submitted:payload.code,selected:await select.inputValue(),draft:await editor.inputValue(),persisted:journal.map(j=>j.code)};
  result.journal.pass=result.journal.submitted==='005930' && result.journal.selected==='000660' && result.journal.draft===text && JSON.stringify(result.journal.persisted)==='["005930"]';
  const state=await (await page.request.get(base+'/api/state')).json();
  state.watchlist=['005930','00088K'];
  const stocks=[{code:'005930',name:'삼성전자'},{code:'00088K',name:'한화우'}].map(x=>({...x,exchange:'KOSPI',kind:'stock',isin:'fixture',group:'ST'}));
  const orders=[];
  page.on('request',req=>{if(req.method()==='POST'&&/\/api\/(?:orders(?:\/|$)|kis\/(?:order(?:\/|$)|cancel|revise)|strategies\/run)/.test(new URL(req.url()).pathname)) orders.push(new URL(req.url()).pathname);});
  await page.route('**/api/state',r=>r.fulfill({json:state}));
  await page.route('**/api/data/master',r=>r.fulfill({json:{instruments:stocks,removed:[],sources:[]}}));
  await page.route('**/api/market/quote',r=>r.fulfill({status:503,json:{error:'offline'}}));
  await page.goto(base+'/watchlist');
  const region=page.getByRole('region',{name:'종목 상세'});
  await page.getByRole('button',{name:'삼성전자 상세',exact:true}).click();await region.waitFor();
  const copy=region.getByRole('button',{name:/종목\s*코드\s*복사/});
  result.copy={button:await copy.count(),values:[],denial:false,orders};
  if (result.copy.button===1) {
    await copy.click();result.copy.values.push(await page.evaluate(()=>navigator.clipboard.readText()));
    await page.getByRole('button',{name:'한화우 상세',exact:true}).click(); await copy.click();
    result.copy.values.push(await page.evaluate(()=>navigator.clipboard.readText()));
    await page.evaluate(()=>Object.defineProperty(navigator.clipboard,'writeText',{value:()=>Promise.reject(new DOMException('denied','NotAllowedError'))}));
    await copy.click();
    const notice=region.getByText(/복사.*(실패|거부|허용|권한|없|못)|권한.*(거부|확인|허용)/).last();
    result.copy.denial=await notice.isVisible();
  }
  result.copy.pass=JSON.stringify(result.copy.values)==='["005930","00088K"]' && result.copy.denial && !orders.length;
  console.log(JSON.stringify(result));
} finally {await browser.close();}
