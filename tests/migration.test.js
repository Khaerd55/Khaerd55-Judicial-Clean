'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const Module=require('node:module');
const {DatabaseSync}=require('node:sqlite');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'judicial-migrate-test-'));
const appData=path.join(root,'Roaming');
const clean=path.join(appData,'Judicial-Clean');
const previous=path.join(appData,'Judicial');
fs.mkdirSync(previous,{recursive:true});
let choice=0;
const mockApp={getPath:key=>key==='appData'?appData:key==='userData'?clean:root};
const mockDialog={
  showMessageBox:async()=>({response:choice})
};
class FakeDatabase{
  constructor(file,options={}){
    this.db=new DatabaseSync(file,{readOnly:!!options.readonly,allowExtension:false});
  }
  prepare(s){return this.db.prepare(s);}
  close(){this.db.close();}
  backup(dst){
    this.db.exec("VACUUM INTO '"+dst.replace(/'/g,"''")+"'");
    return Promise.resolve();
  }
}
const load=Module._load;
Module._load=function(request,parent,isMain){
  if(request==='electron')return {app:mockApp,dialog:mockDialog};
  if(request==='better-sqlite3')return FakeDatabase;
  return load.call(this,request,parent,isMain);
};
const migration=require('../legacy-data-migration');
Module._load=load;
function makeSource(){
  const file=path.join(previous,'judicial.db');
  const db=new DatabaseSync(file);
  db.exec("CREATE TABLE detainees(id INTEGER PRIMARY KEY,name TEXT); CREATE TABLE memos(id INTEGER PRIMARY KEY,memo_type TEXT);");
  db.prepare("INSERT INTO detainees VALUES(?,?)").run(1,'شخص تجريبي');
  db.prepare("INSERT INTO memos VALUES(?,?)").run(1,'احتفاظ');
  db.close();
  return file;
}
test('نسخ قاعدة بيانات Judicial القديمة بأمان وعدم المساس بالأصل',async()=>{
  const src=makeSource();
  choice=0;
  const r=await migration.migrateIfNeeded();
  assert.equal(r.ok,true);
  assert.equal(r.copied,1);
  const target=path.join(clean,'judicial.db');
  assert.equal(fs.existsSync(src),true);
  assert.equal(fs.existsSync(target),true);
  const oldDb=new DatabaseSync(src,{readOnly:true});
  const newDb=new DatabaseSync(target,{readOnly:true});
  assert.equal(oldDb.prepare('SELECT COUNT(*) AS c FROM detainees').get().c,1);
  assert.equal(newDb.prepare('SELECT COUNT(*) AS c FROM detainees').get().c,1);
  oldDb.close();newDb.close();
});
test('التحديث لا يكتب فوق قاعدة بيانات Judicial-Clean الموجودة',async()=>{
  const target=path.join(clean,'judicial.db');
  const before=fs.readFileSync(target);
  const r=await migration.migrateIfNeeded();
  assert.equal(r.status,'already-current');
  assert.deepEqual(fs.readFileSync(target),before);
});
test('عند رفض المستخدم لا يتم نقل شيء',async()=>{
  fs.rmSync(clean,{recursive:true,force:true});
  choice=1;
  const r=await migration.migrateIfNeeded();
  assert.equal(r.status,'skipped');
  assert.equal(fs.existsSync(path.join(clean,'judicial.db')),false);
});
test.after(()=>fs.rmSync(root,{recursive:true,force:true}));
