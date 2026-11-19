const fs=require('node:fs'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
  const html=fs.readFileSync('dist/cashflow.html');
  const company={id:'a0000000-0000-4000-8000-000000000001',code:'EMPRE01',name:'FISTERRA SRL'};
  const user={id:'b0000000-0000-4000-8000-000000000001',name:'Administrador',email:'admin@example.com',role:'admin'};
  let revision=0,payload=null;
  const server=http.createServer(async(req,res)=>{
    const json=(status,body,cookie)=>{res.writeHead(status,{'content-type':'application/json',...(cookie?{'set-cookie':cookie}:{})});res.end(JSON.stringify(body))};
    const logged=req.headers.cookie?.includes('cashflow_session=test-session');
    if(req.url==='/api/auth'){
      if(req.method==='GET')return json(200,logged?{mode:'users',authenticated:true,user,company,companies:[company]}:{mode:'users',authenticated:false,recoveryAvailable:false});
      let raw='';for await(const part of req)raw+=part;const body=JSON.parse(raw);
      if(body.action==='login')return body.email===user.email&&body.password==='correct long password'?json(200,{mode:'users',authenticated:true,user,company,companies:[company]},'cashflow_session=test-session; HttpOnly; Path=/'):json(401,{error:'Email o contraseña incorrectos.'});
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
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({loginGate:true,passwordVisibility:true,invalidLoginMessage:true,companyWorkspaceStartsEmpty:true,adminView:true,noPageErrors:true}));
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);process.exitCode=1});
