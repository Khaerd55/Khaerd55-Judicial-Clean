'use strict';
const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');
const {app,dialog,shell}=require('electron');

const CENTERS=['المديرية','الغربي','الشرقي','مليح','ذيبان'];
const TEMPLATE_NAME='كشف مواقيف.docx';
const iso=x=>/^\d{4}-\d{2}-\d{2}$/.test(String(x||''))&&!Number.isNaN(new Date(String(x)+'T12:00:00').getTime());
const norm=x=>String(x||'').trim();
const releasedType=x=>/[اإآ]فراج|إخلاء سبيل/.test(norm(x));
const wordDate=x=>{
  const s=norm(x);
  if(iso(s)){const [y,m,d]=s.split('-');return Number(d)+'/'+Number(m)+'/'+y+'م';}
  return s;
};
const dayName=s=>['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'][new Date(s+'T12:00:00').getDay()];
const err=e=>({ok:false,error:String(e&&e.message||e)});

function init(db){
  db.exec(
    "CREATE TABLE IF NOT EXISTS detention_reports ("+
    "id INTEGER PRIMARY KEY AUTOINCREMENT, report_date TEXT NOT NULL UNIQUE,"+
    "created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);"+
    "CREATE TABLE IF NOT EXISTS detention_report_rows ("+
    "id INTEGER PRIMARY KEY AUTOINCREMENT,report_id INTEGER NOT NULL,sort_order INTEGER NOT NULL,"+
    "source_kind TEXT NOT NULL,source_person_id INTEGER,name TEXT NOT NULL,nationality TEXT,"+
    "detention_date TEXT,center TEXT NOT NULL,released INTEGER NOT NULL DEFAULT 0);"+
    "CREATE INDEX IF NOT EXISTS idx_detention_report_rows ON detention_report_rows(report_id,sort_order);"
  );
}
function sources(db,date){
  const events=db.prepare(
    "SELECT p.id,p.person_name,p.birth_year,p.national_no,p.nationality,p.detention_date,"+
    "m.id AS memo_id,m.memo_type,m.memo_date FROM memo_people p "+
    "JOIN memos m ON m.id=p.memo_id "+
    "WHERE m.memo_date<=? AND (m.memo_type LIKE '%احتفاظ%' OR m.memo_type LIKE '%افراج%' OR m.memo_type LIKE '%إفراج%') "+
    "ORDER BY m.memo_date DESC,m.id DESC,p.id DESC"
  ).all(date);
  const groups=new Map();
  for(const p of events){
    const key=norm(p.national_no)?'num:'+norm(p.national_no):
      'name:'+norm(p.person_name).replace(/\s+/g,' ')+'|'+norm(p.birth_year);
    if(!norm(p.person_name))continue;
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(p);
  }
  return [...groups.values()].map(group=>{
    const newest=group[0],hold=group.find(x=>!releasedType(x.memo_type));
    const nat=group.find(x=>norm(x.nationality));
    return {
      source_person_id:newest.id,name:newest.person_name,
      nationality:(nat&&nat.nationality)||'',detention_date:hold?(norm(hold.detention_date)||norm(hold.memo_date)):'',
      released:releasedType(newest.memo_type)?1:0,
      status:releasedType(newest.memo_type)?'مفرج عنه':'موقوف',
      memo_date:newest.memo_date,has_national_no:!!norm(newest.national_no)
    };
  });
}
function reportRows(db,id){
  return db.prepare("SELECT id,sort_order,source_kind,source_person_id,name,nationality,detention_date,center,released FROM detention_report_rows WHERE report_id=? ORDER BY sort_order,id").all(id);
}
function checkRow(r){
  if(!CENTERS.includes(r.center))throw Error('موقع التوقيف غير صحيح');
  if(!norm(r.name)||norm(r.name).length>200)throw Error('الاسم مطلوب (بحد أقصى 200 حرف)');
  if(norm(r.nationality).length>80)throw Error('الجنسية طويلة جداً');
  if(norm(r.detention_date)&&!iso(r.detention_date))throw Error('تاريخ التوقيف غير صحيح');
  if(!['memo','manual'].includes(r.source_kind))throw Error('مصدر الشخص غير صحيح');
}
function safeFile(date){return 'كشف المواقيف-'+date+'.docx';}
function uniqueFile(dir,name){
  let f=path.join(dir,name),n=2;const ext=path.extname(name),base=path.basename(name,ext);
  while(fs.existsSync(f))f=path.join(dir,base+' ('+(n++)+')'+ext);
  return f;
}
function templatePath(){return path.join(app.getPath('userData'),'editable-templates',TEMPLATE_NAME);}
function originalTemplatePath(){return path.join(app.getPath('userData'),'editable-templates','.originals',TEMPLATE_NAME);}
function ensureOriginal(){
  const editable=templatePath(),original=originalTemplatePath();
  if(!fs.existsSync(original)&&fs.existsSync(editable)){
    fs.mkdirSync(path.dirname(original),{recursive:true});
    fs.copyFileSync(editable,original,fs.constants.COPYFILE_EXCL);
  }
  return fs.existsSync(original)?original:null;
}
function register(ipcMain,getDb){
  ipcMain.handle('detention-reports',()=>{
    try{return {ok:true,items:getDb().prepare('SELECT id,report_date,updated_at FROM detention_reports ORDER BY report_date DESC,id DESC').all()};}catch(e){return err(e);}
  });
  ipcMain.handle('detention-report',(_,id)=>{
    try{
      const db=getDb(),report=db.prepare('SELECT * FROM detention_reports WHERE id=?').get(Number(id));
      return report?{ok:true,report:{...report,rows:reportRows(db,report.id)}}:{ok:false,error:'الكشف غير موجود'};
    }catch(e){return err(e);}
  });
  ipcMain.handle('detention-sources',(_,date)=>{
    try{if(!iso(date))throw Error('تاريخ الكشف غير صحيح');return {ok:true,items:sources(getDb(),date)};}catch(e){return err(e);}
  });
  ipcMain.handle('detention-save',(_,payload)=>{
    try{
      const date=norm(payload&&payload.report_date),rows=payload&&payload.rows;
      if(!iso(date))throw Error('اختر تاريخاً صحيحاً للكشف');
      if(!Array.isArray(rows)||rows.length>500)throw Error('عدد الصفوف غير صحيح');
      rows.forEach(checkRow);
      const db=getDb();
      const result=db.transaction(()=>{
        let id=Number(payload.id)||0;
        if(id){
          if(!db.prepare('SELECT 1 FROM detention_reports WHERE id=?').get(id))throw Error('الكشف المحفوظ غير موجود');
          if(db.prepare('SELECT 1 FROM detention_reports WHERE report_date=? AND id<>?').get(date,id))throw Error('يوجد كشف آخر لنفس التاريخ');
          db.prepare("UPDATE detention_reports SET report_date=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(date,id);
          db.prepare('DELETE FROM detention_report_rows WHERE report_id=?').run(id);
        }else{
          if(db.prepare('SELECT 1 FROM detention_reports WHERE report_date=?').get(date))throw Error('يوجد كشف محفوظ لهذا التاريخ؛ افتحه للتعديل');
          id=Number(db.prepare('INSERT INTO detention_reports(report_date) VALUES(?)').run(date).lastInsertRowid);
        }
        const insert=db.prepare('INSERT INTO detention_report_rows(report_id,sort_order,source_kind,source_person_id,name,nationality,detention_date,center,released) VALUES(?,?,?,?,?,?,?,?,?)');
        rows.forEach((r,i)=>insert.run(id,i+1,r.source_kind,r.source_kind==='memo'?(Number(r.source_person_id)||null):null,norm(r.name),norm(r.nationality),norm(r.detention_date),r.center,r.released?1:0));
        return id;
      })();
      return {ok:true,id:result};
    }catch(e){return err(e);}
  });
  ipcMain.handle('detention-delete',(_,id)=>{
    try{
      const db=getDb(),n=Number(id);
      if(!db.prepare('SELECT 1 FROM detention_reports WHERE id=?').get(n))throw Error('الكشف غير موجود');
      db.transaction(()=>{db.prepare('DELETE FROM detention_report_rows WHERE report_id=?').run(n);db.prepare('DELETE FROM detention_reports WHERE id=?').run(n);})();
      return {ok:true};
    }catch(e){return err(e);}
  });
  ipcMain.handle('detention-import-template',async()=>{
    try{
      const pick=await dialog.showOpenDialog({title:'اختر نموذج كشف المواقيف الأصلي',properties:['openFile'],filters:[{name:'Word',extensions:['docx']}]});
      if(pick.canceled||!pick.filePaths[0])return {ok:false,canceled:true};
      const input=pick.filePaths[0];
      const fd=fs.openSync(input,'r');const header=Buffer.alloc(4);fs.readSync(fd,header,0,4,0);fs.closeSync(fd);
      if(header[0]!==0x50||header[1]!==0x4b)throw Error('الملف ليس نموذج Word DOCX صحيحاً');
      const dest=templatePath(),original=originalTemplatePath();
      fs.mkdirSync(path.dirname(dest),{recursive:true});
      const oldExists=fs.existsSync(dest);
      if(oldExists){
        const q=await dialog.showMessageBox({type:'warning',buttons:['تغيير النموذج المعتمد','إلغاء'],defaultId:1,cancelId:1,message:'سيتم استبدال النموذج المعتمد، مع الاحتفاظ بالأصل السابق قبل التغيير. هل تريد المتابعة؟'});
        if(q.response!==0)return {ok:false,canceled:true};
        ensureOriginal();
      }
      if(path.resolve(input)!==path.resolve(dest))fs.copyFileSync(input,dest);
      // First imported file becomes the restorable original, kept in backups.
      if(!fs.existsSync(original)){
        fs.mkdirSync(path.dirname(original),{recursive:true});
        fs.copyFileSync(dest,original,fs.constants.COPYFILE_EXCL);
      }
      return {ok:true};
    }catch(e){return err(e);}
  });
  ipcMain.handle('detention-template-status',()=>{const original=ensureOriginal();return {ok:true,exists:fs.existsSync(templatePath()),restorable:!!original};});
  ipcMain.handle('detention-word',(_,id)=>{
    let jsonPath='';
    try{
      const db=getDb(),report=db.prepare('SELECT * FROM detention_reports WHERE id=?').get(Number(id));
      if(!report)throw Error('احفظ الكشف أولاً');
      ensureOriginal();
      const source=templatePath();
      if(!fs.existsSync(source))throw Error('استورد نموذج كشف المواقيف الأصلي أولاً');
      const destDir=path.join(app.getPath('documents'),'تقارير قسم التحقيق والأجانب');
      fs.mkdirSync(destDir,{recursive:true});
      const out=uniqueFile(destDir,safeFile(report.report_date));
      const payload={
        report_date:report.report_date,day_name:dayName(report.report_date),
        title:'كشف بأعداد واسماء المواقيف داخل نظارة مديرية شرطة مادبا والمراكز الأمنية ليوم '+dayName(report.report_date)+' الموافق '+wordDate(report.report_date),
        case_type:'قضائي',detention_order:'القضائية',
        centers:CENTERS,
        rows:reportRows(db,report.id).map(r=>({
          ...r,detention_date:wordDate(r.detention_date),released:r.released?'نعم':'لا'
        }))
      };
      jsonPath=path.join(app.getPath('temp'),'detention-data-'+process.pid+'-'+Date.now()+'.json');
      fs.writeFileSync(jsonPath,JSON.stringify(payload),'utf8');
      const script=app.isPackaged?path.join(process.resourcesPath,'detention-word.ps1'):path.join(__dirname,'detention-word.ps1');
      const exec=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',script,source,out,jsonPath],{encoding:'utf8',windowsHide:true,timeout:120000});
      if(exec.error)throw exec.error;
      if(exec.status!==0)throw Error('تعذر إنشاء كشف Word: '+String(exec.stderr||exec.stdout||'خطأ غير معروف').trim().slice(-900));
      const opened=shell.openPath(out);if(opened&&typeof opened.catch==='function')opened.catch(()=>{});
      return {ok:true,path:out};
    }catch(e){return err(e);}
    finally{if(jsonPath)try{fs.rmSync(jsonPath,{force:true});}catch{}}
  });
}
module.exports={init,register};
