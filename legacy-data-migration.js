'use strict';
const fs=require('fs');
const path=require('path');
const Database=require('better-sqlite3');
const {app,dialog}=require('electron');

// نقل اختياري وآمن من ملفات Judicial القديمة على نفس جهاز Windows.
// لا يستبدل أو يعدّل أي قاعدة بيانات موجودة في Judicial-Clean.
const dbPattern=/^judicial(?:-\d{4})?\.db$/i;
const legacyName=/judicial|التحقيق|الاجانب|الأجانب|مادبا/i;
const getAppData=()=>app.getPath('appData');
const cleanDir=()=>app.getPath('userData');
function isExistingClean(){
  const folder=cleanDir();
  if(!fs.existsSync(folder))return false;
  return fs.readdirSync(folder).some(f=>dbPattern.test(f));
}
function availableDbs(folder){
  if(!fs.existsSync(folder))return [];
  return fs.readdirSync(folder).filter(f=>dbPattern.test(f))
    .map(f=>path.join(folder,f));
}
function metadata(dbfile){
  let db;
  try{
    db=new Database(dbfile,{readonly:true,fileMustExist:true});
    const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name);
    if(!tables.includes('detainees')||!tables.includes('memos'))return null;
    // التحليل للعرض فقط؛ لا تغيير في مصدر البيانات.
    const detainees=db.prepare('SELECT COUNT(*) AS c FROM detainees').get().c;
    const memos=db.prepare('SELECT COUNT(*) AS c FROM memos').get().c;
    return {detainees,memos};
  }catch{return null;}finally{try{db?.close();}catch{}}
}
function discover(){
  const root=getAppData(),dest=path.resolve(cleanDir());
  if(!fs.existsSync(root))return [];
  return fs.readdirSync(root,{withFileTypes:true})
    .filter(e=>e.isDirectory() && legacyName.test(e.name))
    .map(e=>path.join(root,e.name))
    .filter(folder=>path.resolve(folder).toLowerCase()!==dest.toLowerCase())
    .map(folder=>{
      const dbs=availableDbs(folder);
      const main=dbs.find(f=>path.basename(f).toLowerCase()==='judicial.db')||dbs[0];
      const info=main&&metadata(main);
      return info?{folder,dbs,info}:null;
    })
    .filter(Boolean)
    .sort((a,b)=>fs.statSync(b.dbs[0]).mtimeMs-fs.statSync(a.dbs[0]).mtimeMs);
}
async function choose(candidates){
  if(!candidates.length)return null;
  const candidatesLimited=candidates.slice(0,5);
  const labels=candidatesLimited.map((x,i)=>String(i+1)+'. '+path.basename(x.folder));
  const box=await dialog.showMessageBox({
    type:'question',
    title:'استعادة بيانات Judicial القديمة',
    message:'النسخة الجديدة لا تحتوي على قاعدة بيانات بعد. تم العثور على بيانات سابقة على هذا الجهاز.',
    detail:'اختر مجلد البيانات المراد نسخه. سيتم الاحتفاظ ببيانات البرنامج القديم دون أي تعديل.\n\n'+
      candidatesLimited.map((x,i)=>
        String(i+1)+'. '+x.folder+'\nالمضبوطون: '+x.info.detainees+' | المذكرات: '+x.info.memos
      ).join('\n\n')+
      '\n\nإذا كنت لا تريد نقل البيانات الآن اختر «بدء بدون استيراد».',
    buttons:[...labels,'بدء بدون استيراد'],
    defaultId:candidates.length===1?0:candidatesLimited.length,
    cancelId:candidatesLimited.length,
    noLink:true
  });
  return box.response<candidatesLimited.length?candidatesLimited[box.response]:null;
}
async function copyCandidate(source){
  if(isExistingClean())throw Error('توجد بيانات للنسخة الجديدة؛ تم إيقاف النسخ لحمايتها.');
  const dst=cleanDir();
  fs.mkdirSync(dst,{recursive:true});
  const copies=[];
  try{
    // SQLite Backup API تنسخ قاعدة بيانات سليمة حتى لو كانت WAL مفعلة.
    for(const src of source.dbs){
      if(!metadata(src))throw Error('إحدى قواعد البيانات القديمة غير صالحة: '+path.basename(src));
      const target=path.join(dst,path.basename(src));
      if(fs.existsSync(target))throw Error('ملف هدف موجود: '+path.basename(src));
      const tmp=path.join(dst,'.'+path.basename(src)+'.importing-'+process.pid);
      const old=new Database(src,{readonly:true,fileMustExist:true});
      try{await old.backup(tmp);}finally{old.close();}
      fs.renameSync(tmp,target);
      copies.push(target);
    }
    const cfg=path.join(source.folder,'judicial-config.json');
    const dstCfg=path.join(dst,'judicial-config.json');
    if(fs.existsSync(cfg)&&!fs.existsSync(dstCfg)){
      const data=JSON.parse(fs.readFileSync(cfg,'utf8'));
      if(data&&typeof data==='object')fs.copyFileSync(cfg,dstCfg);
    }
    const templatesSrc=path.join(source.folder,'editable-templates');
    const templatesDst=path.join(dst,'editable-templates');
    if(fs.existsSync(templatesSrc)&&!fs.existsSync(templatesDst)){
      fs.cpSync(templatesSrc,templatesDst,{recursive:true,errorOnExist:true,force:false});
    }
    return {ok:true,source:source.folder,copied:copies.length};
  }catch(error){
    // rollback: only files created by this operation, never touch previous data.
    for(const f of copies){try{fs.rmSync(f,{force:true});}catch{}}
    for(const f of fs.readdirSync(dst).filter(x=>x.includes('.importing-'+process.pid))){
      try{fs.rmSync(path.join(dst,f),{force:true});}catch{}
    }
    throw error;
  }
}
async function migrateIfNeeded(){
  try{
    if(isExistingClean())return {ok:true,status:'already-current'};
    const found=discover();
    if(!found.length)return {ok:true,status:'no-legacy-found'};
    const source=await choose(found);
    if(!source)return {ok:true,status:'skipped'};
    const moved=await copyCandidate(source);
    await dialog.showMessageBox({
      type:'info',title:'تم نسخ البيانات القديمة',
      message:'تم نسخ بيانات Judicial القديمة بنجاح.',
      detail:'الأصل بقي كما هو. النسخة الجديدة ستقرأ البيانات المنسوخة داخل Judicial-Clean.',
      buttons:['موافق']
    });
    return moved;
  }catch(e){
    await dialog.showMessageBox({
      type:'warning',title:'لم يتم استيراد البيانات',
      message:'تعذر نسخ البيانات القديمة؛ لن يتم حذف أو تعديل البرنامج القديم.',
      detail:String(e?.message||e)
    });
    return {ok:false,error:String(e?.message||e)};
  }
}
module.exports={migrateIfNeeded};
