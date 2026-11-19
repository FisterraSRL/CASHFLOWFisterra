'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {randomBytes,pbkdf2Sync,createCipheriv}=require('node:crypto');
const {decryptLegacyVault}=require('../lib/legacy-credentials.cjs');

test('server opens the existing encrypted vault without returning it to the browser',()=>{
  const accessKey='example-access-key-123',salt=randomBytes(16),iv=randomBytes(12);
  const cipher=createCipheriv('aes-256-gcm',pbkdf2Sync(accessKey,salt,200000,32,'sha256'),iv);
  const data=Buffer.concat([cipher.update(JSON.stringify({clientId:'client-test',clientSecret:'secret-test'})),cipher.final(),cipher.getAuthTag()]);
  const vault={v:1,mode:'set',salt:salt.toString('base64'),iv:iv.toString('base64'),data:data.toString('base64')};
  assert.deepEqual(decryptLegacyVault(vault,accessKey),{clientId:'client-test',clientSecret:'secret-test'});
  assert.throws(()=>decryptLegacyVault(vault,'different-access-key-123'),/No se pudieron abrir/);
  assert.throws(()=>decryptLegacyVault({...vault,mode:'removed'},accessKey),/No hay credenciales/);
});
