'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');
const originalLoad=Module._load;
Module._load=function(request,parent,isMain){
  if(request==='electron')return {
    app:{isPackaged:false,getPath:()=>require('node:os').tmpdir()},
    dialog:{},shell:{openPath:()=>Promise.resolve('')}
  };
  return originalLoad.call(this,request,parent,isMain);
};
const {DatabaseSync}=require('node:sqlite');
const detention=require('../detention-register');
const database=new DatabaseSync(':memory:');
const db={
 exec:sql=>database.exec(sql),
 prepare:sql=>database.prepare(sql),
 transaction:fn=>(...args)=>{
  database.exec('BEGIN');
  try{const result=fn(...args);database.exec('COMMIT');return result;}
  catch(e){database.exec('ROLLBACK');throw e;}
 }
};
db.exec(
  "CREATE TABLE memos (id INTEGER PRIMARY KEY,memo_type TEXT,memo_date TEXT);"+
  "CREATE TABLE memo_people(id INTEGER PRIMARY KEY,memo_id INTEGER,person_name TEXT,birth_year TEXT,national_no TEXT,nationality TEXT,detention_date TEXT);"
);
detention.init(db);
db.prepare("INSERT INTO memos(id,memo_type,memo_date) VALUES(?,?,?)").run(1,'احتفاظ','2026-10-08');
db.prepare("INSERT INTO memos(id,memo_type,memo_date) VALUES(?,?,?)").run(2,'افراج','2026-10-11');
db.prepare("INSERT INTO memo_people(id,memo_id,person_name,birth_year,national_no,nationality,detention_date) VALUES(?,?,?,?,?,?,?)").run(10,1,'شخص تجريبي','2000','TEST-11','اردني','2026-10-08');
db.prepare("INSERT INTO memo_people(id,memo_id,person_name,birth_year,national_no,nationality,detention_date) VALUES(?,?,?,?,?,?,?)").run(11,2,'شخص تجريبي','2000','TEST-11','','2026-10-11');
const handlers={};
detention.register({handle:(name,handler)=>{handlers[name]=handler;}},()=>db);
const call=(name,...args)=>handlers[name]({},...args);

test('مذكرة الافراج الأحدث تجعل حالة الموقوف نعم',()=>{
  const r=call('detention-sources','2026-10-13');
  assert.equal(r.ok,true);
  assert.equal(r.items.length,1);
  assert.equal(r.items[0].released,1);
  assert.equal(r.items[0].detention_date,'2026-10-08');
  assert.equal(r.items[0].nationality,'اردني');
});

test('كشف تاريخ سابق لا يتأثر بإفراج وقع لاحقاً',()=>{
  const r=call('detention-sources','2026-10-09');
  assert.equal(r.ok,true);
  assert.equal(r.items[0].released,0);
});

test('الصفوف محفوظة داخل القسم الصحيح، ولا تتغير المذكرات',()=>{
  const r=call('detention-save',{
    report_date:'2026-10-13',rows:[
      {source_kind:'memo',source_person_id:11,name:'شخص تجريبي',nationality:'اردني',detention_date:'2026-10-08',center:'المديرية',released:1},
      {source_kind:'manual',name:'إدخال يدوي',nationality:'اردني',detention_date:'2026-10-13',center:'ذيبان',released:0}
    ]
  });
  assert.equal(r.ok,true);
  const get=call('detention-report',r.id);
  assert.equal(get.report.rows.length,2);
  assert.equal(get.report.rows[1].center,'ذيبان');
  assert.equal(db.prepare('SELECT COUNT(*) c FROM memos').get().c,2);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM memo_people').get().c,2);
});

test('المدخلات ذات الموقع غير المعتمد مرفوضة',()=>{
  const r=call('detention-save',{
    report_date:'2026-10-14',rows:[
      {source_kind:'manual',name:'اختبار',center:'مكان مجهول',released:0}
    ]
  });
  assert.equal(r.ok,false);
});

test('لا يسمح بكشفين منفصلين بنفس التاريخ',()=>{
  const r=call('detention-save',{report_date:'2026-10-13',rows:[]});
  assert.equal(r.ok,false);
});
