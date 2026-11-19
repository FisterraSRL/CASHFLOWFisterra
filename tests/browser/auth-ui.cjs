const fs=require('node:fs'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
  const html=fs.readFileSync('dist/cashflow.html');
  const company={id:'a0000000-0000-4000-8000-000000000001',code:'EMPRE01',name:'FISTERRA SRL'};
  const user={id:'b0000000-0000-4000-8000-000000000001',name:'Administrador',email:'admin@example.com',role:'admin'};
  let revision=0,payload=null;
  const server=http.createServer(async(req,res)=>{
    const json=(status,body,cookie)=>{res.writeHead(status,{'content-type':'application/json',...(cookie?{'set-cookie':cookie}:{})});res.end(JSON.stringify(body))};
    const logged=req.headers.cookie?.includes('cashflow_session=test-session'),noCompany=req.headers.cookie?.includes('cashflow_no_company=1');
    if(req.url==='/api/auth'){
      if(req.method==='GET')return json(200,logged?{mode:'users',authenticated:true,user,company:noCompany?null:company,companies:noCompany?[]:[company]}:{mode:'users',authenticated:false,recoveryAvailable:false});
      let raw='';for await(const part of req)raw+=part;const body=JSON.parse(raw);
      if(body.action==='login')return body.email===user.email&&body.password==='correct long password'?json(200,{mode:'users',authenticated:true,user,company:noCompany?null:company,companies:noCompany?[]:[company]},'cashflow_session=test-session; HttpOnly; Path=/'):json(401,{error:'Email o contraseña incorrectos.'});
      if(body.action==='logout')return json(200,{authenticated:false},'cashflow_session=; Max-Age=0; Path=/');
      return json(400,{error:'Acción desconocida.'});
    }
    if(req.url==='/api/workspace'){
      if(!logged)return json(401,{error:'Iniciá sesión.'});
      if(req.method==='GET')return json(200,{revision,payload,updatedAt:null});
      let raw='';for await(const part of req)raw+=part;const next=JSON.parse(raw);payload=next.payload;revision++;return json(200,{revision,updatedAt:new Date().toISOString()});
    }
    if(req.url==='/api/finnegans-config')return json(200,{enabled:false,sources:{}});
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
    await page.locator('#authEmail').fill(user.email);await page.locator('#authPassword').fill('wrong long password');
    await page.locator('#authShowPassword').click();assert.equal(await page.locator('#authPassword').getAttribute('type'),'text');
    await page.getByRole('button',{name:'Iniciar sesión'}).click();await page.getByText('Email o contraseña incorrectos.').waitFor();
    await page.locator('#authPassword').fill('correct long password');await page.getByRole('button',{name:'Iniciar sesión'}).click();
    await page.waitForFunction(()=>WORKSPACE.mode==='ready');assert.equal(await page.locator('main').isVisible(),true);
    assert.equal(payload.state.data.CLI.rows.length,0);
    await page.getByText('Usuarios y empresas').waitFor();
    assert.equal(await page.locator('#authUsersTab').getAttribute('aria-selected'),'true');
    assert.equal(await page.locator('#v-res').isVisible(),false);
    assert.match(await page.locator('#v-usr').innerText(),/admin@example.com/);
    const onboarding=await browser.newContext({viewport:{width:1280,height:850}});
    await onboarding.addCookies([{name:'cashflow_no_company',value:'1',url:`http://127.0.0.1:${server.address().port}`}]);
    const adminPage=await onboarding.newPage();await adminPage.goto(`http://127.0.0.1:${server.address().port}`);
    await adminPage.locator('#authEmail').fill(user.email);await adminPage.locator('#authPassword').fill('correct long password');await adminPage.getByRole('button',{name:'Iniciar sesión'}).click();
    await adminPage.getByText('Usuarios y empresas').waitFor();
    assert.equal(await adminPage.locator('#authCompanySelect').isVisible(),false);
    assert.equal(await adminPage.getByRole('button',{name:'Cerrar sesión'}).isVisible(),true);
    assert.ok(await adminPage.locator('.workspace-gate-card').evaluate(el=>el.getBoundingClientRect().width)>900);
    if(process.env.AUTH_SCREENSHOT)await adminPage.screenshot({path:process.env.AUTH_SCREENSHOT,fullPage:true});
    await adminPage.setViewportSize({width:390,height:844});
    assert.equal(await adminPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.equal(await adminPage.getByRole('button',{name:'Editar'}).isVisible(),true);
    await onboarding.close();
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({loginGate:true,passwordVisibility:true,invalidLoginMessage:true,companyWorkspaceStartsEmpty:true,adminView:true,noPageErrors:true}));
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);process.exitCode=1});
