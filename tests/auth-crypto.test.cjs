'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {normalizeEmail,validPassword,hashPassword,verifyPassword,randomToken,tokenHash}=require('../lib/auth-crypto.cjs');

test('email identity is normalized and invalid addresses are rejected',()=>{
  assert.equal(normalizeEmail('  Admin@Example.COM '),'admin@example.com');
  for(const value of ['',null,'not-an-email','a@@b.com','a@b','a b@example.com'])assert.equal(normalizeEmail(value),null);
});
test('password hashes are salted and verified without storing plaintext',async()=>{
  assert.equal(validPassword('short'),false);
  const first=await hashPassword('a long private password 1'),second=await hashPassword('a long private password 1');
  assert.notEqual(first,second);assert.ok(!first.includes('private password'));
  assert.equal(await verifyPassword('a long private password 1',first),true);
  assert.equal(await verifyPassword('wrong password',first),false);
  assert.equal(await verifyPassword('a long private password 1','invalid'),false);
});
test('session and recovery tokens are random and stored by hash',()=>{
  const a=randomToken(),b=randomToken();assert.notEqual(a,b);
  assert.notEqual(tokenHash(a),a);assert.notEqual(tokenHash(a),tokenHash(b));
});
