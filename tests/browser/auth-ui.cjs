const fs=require('node:fs'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
  const html=fs.readFileSync('dist/cashflow.html');
  const company={id:'a0000000-0000-4000-8000-000000000001',code:'EMPRE01',name:'FISTERRA SRL'};
  const second={id:'a0000000-0000-4000-8000-000000000002',code:'EMPRE02',name:'FISTERRA CHILE S.P.A.'};
  const user={id:'b0000000-0000-4000-8000-000000000001',name:'Administrador',email:'admin@example.com',role:'admin'};
  let revision=0,payload=null;
  const server=http.createServer(async(req,res)=>{
    const json=(status,body,cookie)=>{res.writeHead(status,{'content-type':'application/json',...(cookie?{'set-cookie':cookie}:{})});res.end(JSON.stringify(body))};
    const logged=req.headers.cookie?.includes('cashflow_session=test-session'),noCompany=req.headers.cookie?.includes('cashflow_no_company=1');
    if(req.url==='/api/auth'){
      if(req.method==='GET')return json(200,logged?{mode:'users',authenticated:true,user,company:noCompany?null:company,companies:noCompany?[]:[company,second]}:{mode:'users',authenticated:false,recoveryAvailable:false});
      let raw='';for await(const part of req)raw+=part;const body=JSON.parse(raw);
      if(body.action==='login')return body.email===user.email&&body.password==='correct long password'?json(200,{mode:'users',authenticated:true,user,company:noCompany?null:company,companies:noCompany?[]:[company,second]},'cashflow_session=test-session; HttpOnly; Path=/'):json(401,{error:'Email o contraseña incorrectos.'});
      if(body.action==='logout')return json(200,{authenticated:false},'cashflow_session=; Max-Age=0; Path=/');
      return json(400,{error:'Acción desconocida.'});
    }
    if(req.url==='/api/workspace'){
      if(!logged)return json(401,{error:'Iniciá sesión.'});
      if(req.method==='GET')return json(200,{revision,payload,updatedAt:null});
      let raw='';for await(const part of req)raw+=part;const next=JSON.parse(raw);payload=next.payload;revision++;return json(200,{revision,updatedAt:new Date().toISOString()});
    }
    if(req.url==='/api/finnegans-config')return json(200,{enabled:true,sources:{CLI:{filters:{cuenta:'DEUDORES'}},PRV:{filters:{}},CHP:{filters:{}},CHT:{filters:{}},EJC:{filters:{}},EJP:{filters:{}},BCO:{filters:{}}}});
    if(req.url==='/api/consolidated'){
      let raw='';for await(const part of req)raw+=part;const ids=JSON.parse(raw).companyIds;
      if(ids.length!==2||ids[0]!==company.id||ids[1]!==second.id)return json(400,{error:'Selección inválida'});
      const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Buenos_Aires'}).format(new Date());
      const state=(name,saldo,cobro,pago)=>({saldo,saldoFecha:today,saldoManualSet:true,tc:1000,fx:{CLP:2},data:{
        CLI:{rows:[{s:'CLI',id:name+'-CLI',company:name,p:'Cliente',cat:'Cobranza clientes',f:today,m:cobro,c:'ARS'}],at:today},
        PRV:{rows:[{s:'PRV',id:name+'-PRV',company:name,p:'Proveedor',cat:'Proveedores',f:today,m:-pago,c:'ARS'}],at:today},
        CHP:{rows:[],lastCheck:{status:'empty'}},CHT:{rows:[],lastCheck:{status:'empty'}},BCO:{rows:[]},
        EJC:{orig:'Finnegans · API',at:today,period:{from:today.slice(0,7)+'-01',to:today},rows:[{mes:today.slice(0,7),f:today,imp:cobro,p:'Cliente',doc:'COBRO',cat:'Cobranza clientes',account:'Banco',originalCurrency:name.includes('CHILE')?'CLP':'ARS',originalAmount:cobro}],applications:[{mes:today.slice(0,7),f:today,imp:9,p:'Cliente',doc:'COBRO',appliedDoc:'FACTURA'}]},
        EJP:{orig:'Finnegans · API',at:today,period:{from:today.slice(0,7)+'-01',to:today},rows:[{mes:today.slice(0,7),f:today,imp:pago,p:'Proveedor',doc:'PAGO',cat:'Proveedores',account:'Banco',originalCurrency:name.includes('CHILE')?'CLP':'ARS',originalAmount:pago}]}}});
      return json(200,{workspaces:[{company,updatedAt:null,state:state(company.name,100,40,20)},{company:second,updatedAt:null,state:state(second.name,200,60,30)}]});
    }
    if(req.url==='/api/users')return json(200,{users:[{...user,active:true,company_ids:[company.id]}]});
    if(req.url==='/api/companies')return json(200,{companies:[{...company,active:true}]});
    res.writeHead(200,{'content-type':'text/html;charset=utf-8'});res.end(html);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:850}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.locator('#authLoginForm').waitFor({state:'visible'});
    assert.equal(await page.locator('main').isVisible(),false);
    await page.locator('#manualGateOpen').click();
    assert.equal(await page.locator('#manualDialog').evaluate(dialog=>dialog.open),true);
    assert.match(await page.locator('#manualContent').innerText(),/Crear un usuario/);
    if(process.env.MANUAL_SCREENSHOT)await page.screenshot({path:process.env.MANUAL_SCREENSHOT});
    await page.locator('#manualClose').click();
    assert.equal(await page.locator('#manualDialog').evaluate(dialog=>dialog.open),false);
    await page.locator('#authEmail').fill(user.email);await page.locator('#authPassword').fill('wrong long password');
    await page.locator('#authShowPassword').click();assert.equal(await page.locator('#authPassword').getAttribute('type'),'text');
    await page.getByRole('button',{name:'Iniciar sesión'}).click();await page.getByText('Email o contraseña incorrectos.').waitFor();
    await page.locator('#authPassword').fill('correct long password');await page.getByRole('button',{name:'Iniciar sesión'}).click();
    await page.waitForFunction(()=>WORKSPACE.mode==='ready');assert.equal(await page.locator('main').isVisible(),true);
    assert.equal(payload.state.data.CLI.rows.length,0);
    await page.locator('#v-usr h2').waitFor();
    assert.equal(await page.locator('#authUsersTab').getAttribute('aria-selected'),'true');
    assert.equal(await page.locator('#v-res').isVisible(),false);
    assert.match(await page.locator('#v-usr').innerText(),/admin@example.com/);
    await page.locator('#manualOpen').click();
    assert.equal(await page.locator('#manualDialog').evaluate(dialog=>dialog.open),true);
    await page.locator('#manualClose').click();
    await page.locator('nav.tabs button[data-t="dat"]').click();
    await page.locator('#report-CLI-cuenta').waitFor({state:'attached'});
    assert.equal(await page.locator('#report-CLI-cuenta').inputValue(),'DEUDORES');
    assert.equal(await page.locator('[data-filter="empresa"]').count(),0);
    assert.equal(await page.locator('#report-PRV-cuenta').count(),1);
    assert.equal(await page.locator('#report-CHP-estado').count(),1);
    assert.equal(await page.locator('#report-CHT-estado').count(),1);
    assert.equal(await page.locator('#report-EJC-cliente').count(),1);
    assert.equal(await page.locator('#report-EJP-proveedor').count(),1);
    await page.locator('#report-CLI-cuenta').locator('xpath=ancestor::details').locator('summary').click();
    await page.locator('#report-CLI-cuenta').fill('DEUDORES NUEVO');
    await page.waitForFunction(()=>WORKSPACE.revision>0&&WORKSPACE.dirty===false&&WORKSPACE.busy===false);
    assert.equal(payload.filters.CLI.cuenta,'DEUDORES NUEVO');
    await page.locator('nav.tabs button[data-t="flu"]').click();
    await page.locator(`[data-cons-company="${second.id}"]`).check();
    await page.getByText('Flujo de fondos consolidado').waitFor();
    const flow=await page.locator('#v-flu').innerText();
    assert.match(flow,/FISTERRA SRL/);assert.match(flow,/FISTERRA CHILE S\.P\.A\./);
    assert.match(flow,/Saldo inicial conjunto/);assert.match(flow,/350,00/);
    if(process.env.CONSOLIDATED_SCREENSHOT)await page.screenshot({path:process.env.CONSOLIDATED_SCREENSHOT,fullPage:true});
    await page.locator('nav.tabs button[data-t="ven"]').click();
    await page.getByText('Vencimientos consolidados').waitFor();
    const today=await page.locator('#pRef').inputValue();
    assert.match(await page.locator(`#v-ven [data-f="${today}"]`).innerText(),/100,00/);
    assert.match(await page.locator(`#v-ven [data-f="${today}"]`).innerText(),/−50,00/);
    if(process.env.CONSOLIDATED_CALENDAR_SCREENSHOT)await page.screenshot({path:process.env.CONSOLIDATED_CALENDAR_SCREENSHOT,fullPage:true});
    await page.locator(`#v-ven [data-f="${today}"]`).click();
    const detail=await page.locator('#drawerHost').innerText();
    assert.match(detail,/FISTERRA SRL/);assert.match(detail,/FISTERRA CHILE S\.P\.A\./);
    await page.locator('#drawerHost [data-x].btn').click();
    await page.evaluate(()=>{
      const state=CONS.workspaces[1].state;
      const row=state.data.CLI.rows[0];
      state.excludedDocuments=[{key:documentKey(row),document:'Factura excluida',organization:row.p,company:row.company,category:row.cat,date:row.f,amount:row.m,currency:row.c}];
      renderVen();
    });
    const day=page.locator(`#v-ven .day[data-f="${today}"]`);
    assert.match(await day.innerText(),/\+40,00/);
    assert.doesNotMatch(await day.innerText(),/\+100,00/);
    await page.getByRole('button',{name:'Documentos excluidos',exact:true}).click();
    assert.match(await page.locator('#drawerHost').innerText(),/Factura excluida/);
    assert.equal(await page.getByRole('button',{name:'Reincorporar Factura excluida'}).count(),0);
    await page.locator('#drawerHost [data-x].btn').click();
    await page.evaluate(()=>{CONS.workspaces[1].state.excludedDocuments=[];renderVen()});
    await page.locator('nav.tabs button[data-t="eje"]').click();
    await page.getByText('Ejecutado consolidado · cobros y pagos').waitFor();
    const executed=await page.locator('#v-eje').innerText();
    assert.match(executed,/FISTERRA SRL/);assert.match(executed,/FISTERRA CHILE S\.P\.A\./);
    assert.match(executed,/\$ 160/);assert.match(executed,/−\$ 80/);assert.match(executed,/\$ 80/);
    assert.match(executed,/Aplicaciones a comprobantes \(2\)/);
    await page.locator('#v-eje details').last().locator('summary').click();
    assert.equal(await page.locator('#v-eje details').last().locator('tbody tr').count(),2);
    if(process.env.CONSOLIDATED_EXECUTED_SCREENSHOT)await page.screenshot({path:process.env.CONSOLIDATED_EXECUTED_SCREENSHOT,fullPage:true});
    await page.evaluate(()=>{CONS.workspaces[1].state.fx.CLP=0;renderExecuted()});
    assert.match(await page.locator('#v-eje').innerText(),/FALTAN COTIZACIONES/);
    await page.evaluate(()=>{CONS.workspaces[1].state.fx.CLP=2;CONS.workspaces[1].state.data.EJP.period.from=reportToday();renderExecuted()});
    assert.match(await page.locator('#v-eje').innerText(),/El neto y la cobertura se ocultan/);
    await page.evaluate(()=>{CONS.workspaces[1].state.data.EJP.period.from=reportToday().slice(0,7)+'-01';renderExecuted()});
    await page.reload();await page.locator('nav.tabs button[data-t="flu"]').waitFor({state:'visible'});
    await page.locator('nav.tabs button[data-t="flu"]').click();
    assert.equal(await page.locator(`[data-cons-company="${second.id}"]`).isVisible(),true);
    assert.equal(await page.locator(`[data-cons-company="${second.id}"]`).evaluate(input=>input.checked),true);
    await page.getByText('Flujo de fondos consolidado').waitFor();
    const onboarding=await browser.newContext({viewport:{width:1280,height:850}});
    await onboarding.addCookies([{name:'cashflow_no_company',value:'1',url:`http://127.0.0.1:${server.address().port}`}]);
    const adminPage=await onboarding.newPage();await adminPage.goto(`http://127.0.0.1:${server.address().port}`);
    await adminPage.locator('#authEmail').fill(user.email);await adminPage.locator('#authPassword').fill('correct long password');await adminPage.getByRole('button',{name:'Iniciar sesión'}).click();
    await adminPage.locator('#authAdminGate h2').waitFor();
    assert.equal(await adminPage.locator('#authCompanySelect').isVisible(),false);
    assert.equal(await adminPage.getByRole('button',{name:'Cerrar sesión'}).isVisible(),true);
    assert.ok(await adminPage.locator('.workspace-gate-card').evaluate(el=>el.getBoundingClientRect().width)>900);
    if(process.env.AUTH_SCREENSHOT)await adminPage.screenshot({path:process.env.AUTH_SCREENSHOT,fullPage:true});
    await adminPage.setViewportSize({width:390,height:844});
    assert.equal(await adminPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await adminPage.locator('#manualGateOpen').click();
    assert.equal(await adminPage.locator('#manualDialog').evaluate(dialog=>dialog.getBoundingClientRect().width<=innerWidth),true);
    await adminPage.locator('#manualClose').click();
    assert.equal(await adminPage.getByRole('button',{name:'Editar'}).isVisible(),true);
    await onboarding.close();
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({loginGate:true,passwordVisibility:true,invalidLoginMessage:true,companyWorkspaceStartsEmpty:true,adminView:true,noPageErrors:true}));
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);process.exitCode=1});
