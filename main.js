
const {app,BrowserWindow,ipcMain,dialog,shell}=require('electron');
const path=require('path'), fs=require('fs'), crypto=require('crypto'), {spawnSync}=require('child_process'), Database=require('better-sqlite3');
// CLEAN edition: isolated data folder; never reads the original program database.
app.setPath('userData',path.join(app.getPath('appData'),'Judicial-Clean'));
let db, mainWindow, currentYear=2026;
function configPath(){return path.join(app.getPath('userData'),'judicial-config.json')}
function loadConfig(){try{return JSON.parse(fs.readFileSync(configPath(),'utf8'))}catch{return {currentYear:2026,years:[2026],passwordHash:'',signatories:[]}}}
function saveConfig(c){fs.writeFileSync(configPath(),JSON.stringify(c,null,2),'utf8')}
function dbPathForYear(y){return Number(y)===2026?path.join(app.getPath('userData'),'judicial.db'):path.join(app.getPath('userData'),`judicial-${Number(y)}.db`)}
function hashPassword(s){return crypto.createHash('sha256').update(String(s||'')).digest('hex')}
const YEAR_ADMIN_CODE='108733';

// Use packaged extraResources after installation, and the project folder during development.
const resourceDir=(...parts)=>path.join(app.isPackaged?process.resourcesPath:__dirname,...parts);
const factoryTemplatePath=(name)=>resourceDir('templates',name);
const editableTemplatesDir=()=>path.join(app.getPath('userData'),'editable-templates');
function templatePath(name){
 const src=factoryTemplatePath(name),dst=path.join(editableTemplatesDir(),name);
 try{if(!fs.existsSync(dst)&&fs.existsSync(src)){fs.mkdirSync(path.dirname(dst),{recursive:true});fs.copyFileSync(src,dst)}}catch{}
 return fs.existsSync(dst)?dst:src;
}
function listFactoryTemplates(){
 const rels=["احصائية العمالة الوافدة للجنسيات المعتمدة لعام 2026.docx", "تعليمات النظارات احد واربعاء.docx", "احصائية العمالة الوافداة المعتمدة لعام 2026.docx", "المذكرة القديمة - احتفاظ.docx", "مخاطبة الوسط التقرير اليومي.docx", "المذكرة القديمة - افراج.docx"];
 return rels.map(relative=>({relative,name:path.basename(relative)}));
}
const pad=n=>String(n).padStart(2,'0');
const today=()=>{let d=new Date();return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`};
function legacyDate(s){
  if(!s)return '';
  let m=String(s).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); if(!m)return s;
  let y=+m[3]; if(y===2202)y=2026; // obvious transposition from source; shown in review list
  if(y===2025 && +m[2]===1)y=2026;
  if(y===2025 && +m[2]===2)y=2026;
  return `${y}-${pad(m[2])}-${pad(m[1])}`;
}
function init(year){
 currentYear=Number(year)||2026;
 if(db){try{db.close()}catch{}}
 db=new Database(dbPathForYear(currentYear)); db.pragma('journal_mode=WAL');
 db.exec(`CREATE TABLE IF NOT EXISTS detainees(id INTEGER PRIMARY KEY AUTOINCREMENT,personal_no TEXT,name TEXT NOT NULL,arrest_date TEXT NOT NULL,record_no TEXT,status TEXT NOT NULL,nationality TEXT,original_status TEXT,notes TEXT DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS status_history(id INTEGER PRIMARY KEY AUTOINCREMENT,detainee_id INTEGER,old_status TEXT,new_status TEXT,action_date TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS employees(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT,rank TEXT,military_no TEXT,role TEXT);
 CREATE TABLE IF NOT EXISTS memos(id INTEGER PRIMARY KEY AUTOINCREMENT,memo_type TEXT,memo_date TEXT,person_name TEXT,birth_year TEXT,nationality TEXT,charge TEXT,detention_date TEXT,national_no TEXT,data_entry_id INTEGER,duty_officer_id INTEGER,judicial_officer_id INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS memo_people(id INTEGER PRIMARY KEY AUTOINCREMENT,memo_id INTEGER,sort_order INTEGER DEFAULT 1,person_name TEXT,birth_year TEXT,nationality TEXT,charge TEXT,detention_date TEXT,national_no TEXT);
 CREATE TABLE IF NOT EXISTS stats_snapshot(detainee_id INTEGER PRIMARY KEY,status TEXT,nationality TEXT,arrest_date TEXT);`);
 require('./detention-register').init(db);
 const memoCols2=db.prepare("PRAGMA table_info(memos)").all().map(x=>x.name);
 if(!memoCols2.includes('approver_text')) db.exec("ALTER TABLE memos ADD COLUMN approver_text TEXT DEFAULT ''");
 // V5.4.1: add template choice to existing databases without deleting old memo records.
 const memoCols=db.prepare("PRAGMA table_info(memos)").all().map(x=>x.name);
 if(!memoCols.includes('memo_template')) db.exec("ALTER TABLE memos ADD COLUMN memo_template TEXT DEFAULT 'نموذج 1'");

 
 // V5.9: migrate existing one-person memos into memo_people once.
 const oldMemos=db.prepare(`SELECT * FROM memos m WHERE NOT EXISTS(SELECT 1 FROM memo_people p WHERE p.memo_id=m.id)`).all();
 const addMemoPerson=db.prepare(`INSERT INTO memo_people(memo_id,sort_order,person_name,birth_year,nationality,charge,detention_date,national_no) VALUES(?,?,?,?,?,?,?,?)`);
 for(const m of oldMemos) addMemoPerson.run(m.id,1,m.person_name||'',m.birth_year||'',m.nationality||'',m.charge||'',m.detention_date||'',m.national_no||'');

 // CLEAN edition: no imported/seeded campaign data.
 if(db.prepare('SELECT COUNT(*) c FROM stats_snapshot').get().c===0){const q=db.prepare('INSERT INTO stats_snapshot(detainee_id,status,nationality,arrest_date) VALUES(?,?,?,?)');db.transaction(()=>{for(const x of db.prepare('SELECT id,status,nationality,arrest_date FROM detainees').all())q.run(x.id,x.status,x.nationality||'',x.arrest_date||'')})();}
}
function win(){
 mainWindow=new BrowserWindow({width:1500,height:950,minWidth:1100,minHeight:700,icon:resourceDir('assets','icon.ico'),webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false}});
 mainWindow.loadFile('index.html');
 mainWindow.on('focus',()=>{try{mainWindow.webContents.focus()}catch{}});
 mainWindow.on('closed',()=>{mainWindow=null});
}

app.whenReady().then(async()=>{await require('./legacy-data-migration').migrateIfNeeded();let c=loadConfig();currentYear=Number(c.currentYear)||2026;init(currentYear);win()});app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});

ipcMain.handle('list',(_,q='')=>{let s=`%${q.trim()}%`;return db.prepare(`SELECT d.*,
 (SELECT h.action_date FROM status_history h WHERE h.detainee_id=d.id ORDER BY h.id DESC LIMIT 1) AS action_date
 FROM detainees d
 WHERE d.name LIKE ? OR d.personal_no LIKE ? OR d.record_no LIKE ?
 ORDER BY date(d.arrest_date) DESC,d.id DESC`).all(s,s,s)});
ipcMain.handle('add',(_,r)=>{if(r.personal_no){let d=db.prepare('SELECT name FROM detainees WHERE personal_no=?').get(r.personal_no);if(d)return {ok:false,error:'الرقم الشخصي موجود باسم '+d.name}};let x=db.prepare(`INSERT INTO detainees(personal_no,name,arrest_date,record_no,status,nationality,notes)VALUES(?,?,?,?,?,?,?)`).run(r.personal_no||'',r.name,r.arrest_date,r.record_no||'',r.status,r.nationality||'',r.notes||'');return {ok:true,id:x.lastInsertRowid}});
ipcMain.handle('add-many',(_,items)=>{try{
 const list=(Array.isArray(items)?items:[]).filter(r=>String(r?.name||'').trim());
 if(!list.length)return {ok:false,error:'أدخل شخصاً واحداً على الأقل'};
 const find=db.prepare('SELECT name FROM detainees WHERE personal_no=?');
 const ins=db.prepare(`INSERT INTO detainees(personal_no,name,arrest_date,record_no,status,nationality,original_status,notes)VALUES(?,?,?,?,?,?,?,?)`);
 const tx=db.transaction(()=>{
   for(const r of list){
     const personal=String(r.personal_no||'').trim();
     if(personal){const d=find.get(personal);if(d)throw new Error('الرقم الشخصي '+personal+' موجود باسم '+d.name)}
     ins.run(personal,String(r.name||'').trim(),r.arrest_date||today(),r.record_no||'',r.status||'منتظر',r.nationality||'',r.status||'منتظر',r.notes||'');
   }
 });
 tx();return {ok:true,count:list.length};
}catch(e){return {ok:false,error:String(e?.message||e)}}});
ipcMain.handle('update',(_,r)=>{let o=db.prepare('SELECT * FROM detainees WHERE id=?').get(r.id);if(!o)return {ok:false,error:'السجل غير موجود'};db.prepare(`UPDATE detainees SET personal_no=?,name=?,arrest_date=?,record_no=?,status=?,nationality=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(r.personal_no||'',r.name,r.arrest_date,r.record_no||'',r.status,r.nationality||'',r.notes||'',r.id);if(o.status!==r.status)db.prepare(`INSERT INTO status_history(detainee_id,old_status,new_status,action_date)VALUES(?,?,?,?)`).run(r.id,o.status,r.status,r.action_date||today());return {ok:true}});
ipcMain.handle('del',(_,id)=>{try{let o=db.prepare('SELECT * FROM detainees WHERE id=?').get(id);if(!o)return {ok:false,error:'السجل غير موجود'};db.prepare('DELETE FROM status_history WHERE detainee_id=?').run(id);db.prepare('DELETE FROM detainees WHERE id=?').run(id);return {ok:true}}catch(e){return {ok:false,error:String(e?.message||e)}}});

function currentDayStats(d){
 const norm=n=>String(n||'').trim().replace('اثيوبية','اثيوبي')||'غير محدد';
 const byNat={};
 const bucket=n=>{n=norm(n);if(!byNat[n])byNat[n]={nationality:n,total:0,deported:0,released:0,waiting:0};return byNat[n]};

 // 1) المضبوطون يومياً: فقط من كان تاريخ ضبطه هو التاريخ المختار.
 const arrests=db.prepare('SELECT id,status,nationality FROM detainees WHERE arrest_date=?').all(d);
 for(const x of arrests){
   const b=bucket(x.nationality);
   b.total++;
   if(x.status==='منتظر') b.waiting++;
 }

 // 2) الإجراء اليومي: الشخص يُحسب فقط إذا تغيرت حالته في هذا اليوم
 //    وكانت حالته الحالية النهائية ما زالت "أبعد" أو "مكفل/إخلاء سبيل".
 //    لذلك منتظر -> مكفل -> منتظر في نفس اليوم = صفر، ولا يبقى أثر قديم.
 const changed=db.prepare(`
   SELECT DISTINCT d.id,d.status,d.nationality
   FROM detainees d
   JOIN status_history h ON h.detainee_id=d.id
   WHERE h.action_date=?
 `).all(d);

 let deported=0,released=0;
 for(const x of changed){
   const b=bucket(x.nationality);
   if(x.status==='ابعد'){deported++;b.deported++}
   else if(x.status==='مكفل'||x.status==='اخلاء سبيل'){released++;b.released++}
 }

 return {
   total:arrests.length,
   deported,
   released,
   waiting:arrests.filter(x=>x.status==='منتظر').length,
   byNat:Object.values(byNat)
 };
}
function approvedCumulative(){
 const rowsMap={};
 const norm=n=>String(n||'').trim().replace('اثيوبية','اثيوبي')||'غير محدد';
 for(const r of db.prepare('SELECT status,nationality FROM detainees').all()){
   const n=norm(r.nationality);
   if(!rowsMap[n])rowsMap[n]={nationality:n,total:0,deported:0,released:0,waiting:0};
   const x=rowsMap[n];x.total++;
   if(r.status==='ابعد')x.deported++;
   else if(r.status==='مكفل'||r.status==='اخلاء سبيل')x.released++;
   else if(r.status==='منتظر')x.waiting++;
 }
 const rows=Object.values(rowsMap);
 const totals=rows.reduce((a,x)=>({total:a.total+x.total,deported:a.deported+x.deported,released:a.released+x.released,waiting:a.waiting+x.waiting}),{total:0,deported:0,released:0,waiting:0});
 return {rows,totals};
}
ipcMain.handle('stats',(_,d=today())=>{try{
 const c=approvedCumulative(),day=currentDayStats(d);
 return {ok:true,date:d,total:c.totals.total,deported:c.totals.deported,released:c.totals.released,waiting:c.totals.waiting,dailyArrests:day.total,dailyDeported:day.deported,dailyReleased:day.released,dailyWaiting:day.waiting,byNat:c.rows,dailyByNat:day.byNat,dailyChangesByNat:day.byNat};
}catch(e){return {ok:false,error:String(e?.message||e)}}});
ipcMain.handle('year-info',()=>{let c=loadConfig();return {currentYear,years:[...new Set([...(c.years||[]),2026,currentYear])].sort((a,b)=>b-a),passwordSet:!!c.passwordHash}});
ipcMain.handle('set-year-password',(_,r)=>{let admin=String(r?.admin_code||'').trim(),pass=String(r?.password||'').trim();if(admin!==YEAR_ADMIN_CODE)return {ok:false,error:'رمز الإدارة غير صحيح'};if(pass.length<4)return {ok:false,error:'الرقم السري يجب أن يكون 4 خانات على الأقل'};let c=loadConfig();c.passwordHash=hashPassword(pass);saveConfig(c);return {ok:true}});
ipcMain.handle('create-year',(_,r)=>{try{let y=Number(r?.year),pass=String(r?.password||'');let c=loadConfig();if(!c.passwordHash)return {ok:false,error:'حدد الرقم السري للسنوات من الإعدادات أولاً'};if(hashPassword(pass)!==c.passwordHash)return {ok:false,error:'الرقم السري غير صحيح'};if(!Number.isInteger(y)||y<2026||y>2100)return {ok:false,error:'السنة غير صحيحة'};if((c.years||[]).map(Number).includes(y)||fs.existsSync(dbPathForYear(y)))return {ok:false,error:'هذه السنة موجودة مسبقاً'};db.pragma('wal_checkpoint(FULL)');let bd=path.join(app.getPath('userData'),'year-backups');fs.mkdirSync(bd,{recursive:true});fs.copyFileSync(dbPathForYear(currentYear),path.join(bd,`judicial-${currentYear}-before-${y}-${Date.now()}.db`));let oldEmps=db.prepare('SELECT name,rank,military_no,role FROM employees').all();init(y);let ins=db.prepare('INSERT INTO employees(name,rank,military_no,role) VALUES(?,?,?,?)');db.transaction(()=>oldEmps.forEach(e=>ins.run(e.name,e.rank,e.military_no,e.role)))();c=loadConfig();c.years=[...new Set([...(c.years||[]),2026,y])].sort((a,b)=>a-b);c.currentYear=y;saveConfig(c);return {ok:true,currentYear:y}}catch(e){return {ok:false,error:String(e?.message||e)}}});
ipcMain.handle('switch-year',(_,y)=>{try{y=Number(y);let c=loadConfig();if(!(c.years||[]).map(Number).includes(y)&&y!==2026)return {ok:false,error:'السنة غير موجودة'};init(y);c=loadConfig();c.currentYear=y;c.years=[...new Set([...(c.years||[]),2026,y])];saveConfig(c);return {ok:true,currentYear:y}}catch(e){return {ok:false,error:String(e?.message||e)}}});
ipcMain.handle('signatories',()=>loadConfig().signatories||[]);
ipcMain.handle('signatory-add',(_,r)=>{let text=String(r?.text||'').trim();if(!text)return {ok:false,error:'أدخل الرتبة والاسم'};let c=loadConfig();c.signatories=c.signatories||[];if(!c.signatories.includes(text))c.signatories.push(text);saveConfig(c);return {ok:true}});
ipcMain.handle('signatory-del',(_,text)=>{let c=loadConfig();c.signatories=(c.signatories||[]).filter(x=>x!==text);saveConfig(c);return {ok:true}});
ipcMain.handle('retained-people',()=>db.prepare(`SELECT p.*,m.memo_date FROM memo_people p JOIN memos m ON m.id=p.memo_id WHERE m.memo_type='احتفاظ' ORDER BY m.memo_date DESC,p.id DESC`).all());
ipcMain.handle('emps',()=>db.prepare('SELECT * FROM employees ORDER BY role,name').all());
ipcMain.handle('empadd',(_,r)=>{db.prepare('INSERT INTO employees(name,rank,military_no,role)VALUES(?,?,?,?)').run(r.name,r.rank||'',r.military_no||'',r.role||'');return {ok:true}});
ipcMain.handle('empdel',(_,id)=>{db.prepare('DELETE FROM employees WHERE id=?').run(id);return {ok:true}});
ipcMain.handle('memos',()=>db.prepare(`SELECT m.*,a.name data_entry_name,b.name duty_name,c.name judicial_name,
 (SELECT COUNT(*) FROM memo_people p WHERE p.memo_id=m.id) person_count
 FROM memos m LEFT JOIN employees a ON a.id=m.data_entry_id LEFT JOIN employees b ON b.id=m.duty_officer_id LEFT JOIN employees c ON c.id=m.judicial_officer_id ORDER BY memo_date DESC,id DESC`).all());
ipcMain.handle('memopeople',(_,id)=>db.prepare('SELECT * FROM memo_people WHERE memo_id=? ORDER BY sort_order,id').all(id));

function finalizeSingleMemo(docx,dateStr,isModel2,isRelease){
 const work=path.join(app.getPath('temp'),`memo-final-${Date.now()}-${process.pid}`);
 const ps1=path.join(app.getPath('temp'),`memo-final-${Date.now()}.ps1`);
 const [y,m,d]=String(dateStr||today()).split('-');
 const nd=`${Number(d)}/${Number(m)}/${y}`;
 const keepStart=isModel2?(isRelease?0:61):(isRelease?58:0);
 const keepEnd=isModel2?(isRelease?60:9999):(isRelease?9999:55);
 const script=`$ErrorActionPreference='Stop'\r\n`+
`Add-Type -AssemblyName System.IO.Compression.FileSystem\r\n`+
`$docx=${psQuote(docx)}\r\n$work=${psQuote(work)}\r\n$newDate=${psQuote(nd)}\r\n$ks=${keepStart}\r\n$ke=${keepEnd}\r\n`+
`try{\r\n`+
` if(Test-Path -LiteralPath $work){Remove-Item -LiteralPath $work -Recurse -Force}\r\n`+
` New-Item -ItemType Directory -Path $work -Force|Out-Null\r\n`+
` [IO.Compression.ZipFile]::ExtractToDirectory($docx,$work)\r\n`+
` $xp=Join-Path $work 'word\\\\document.xml';[xml]$x=Get-Content -LiteralPath $xp -Raw -Encoding UTF8\r\n`+
` $ns=New-Object Xml.XmlNamespaceManager($x.NameTable);$ns.AddNamespace('w','http://schemas.openxmlformats.org/wordprocessingml/2006/main')\r\n`+
` $body=$x.SelectSingleNode('//w:body',$ns);$kids=@($body.ChildNodes)\r\n`+
` for($i=$kids.Count-1;$i -ge 0;$i--){$keepLogo=(${isModel2?'$true':'$false'} -and $i -eq 0);if($kids[$i].LocalName -ne 'sectPr' -and -not $keepLogo -and ($i -lt $ks -or $i -gt $ke)){[void]$body.RemoveChild($kids[$i])}}\r\n`+
` foreach($p in $x.SelectNodes('//w:body/w:p',$ns)){\r\n`+
`   $ts=$p.SelectNodes('.//w:t',$ns);if($ts.Count -eq 0){continue};$j='';foreach($t in $ts){$j+=$t.InnerText}\r\n`+
`   if($j -match 'التاريخ\\s*:' -or $j -match 'الموافق\\s*:'){\r\n`+
`     $c=[regex]::Replace($j,'[0-9٠-٩]{1,2}\\s*/\\s*[0-9٠-٩]{1,2}\\s*/\\s*[0-9٠-٩]{4}',$newDate)\r\n`+
`     if($c -ne $j){$ts[0].InnerText=$c;for($q=1;$q -lt $ts.Count;$q++){$ts[$q].InnerText=''}}\r\n`+
`   }\r\n`+
` }\r\n`+
` $set=New-Object Xml.XmlWriterSettings;$set.Encoding=New-Object Text.UTF8Encoding($false);$set.Indent=$false;$wr=[Xml.XmlWriter]::Create($xp,$set);$x.Save($wr);$wr.Close()\r\n`+
` Remove-Item -LiteralPath $docx -Force;[IO.Compression.ZipFile]::CreateFromDirectory($work,$docx,[IO.Compression.CompressionLevel]::Optimal,$false)\r\n`+
`}catch{Write-Error $_.Exception.Message;exit 1}finally{if(Test-Path -LiteralPath $work){Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue}}\r\n`;
 fs.writeFileSync(ps1,'\ufeff'+script,'utf8');
 const r=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',ps1],{encoding:'utf8',windowsHide:true});
 try{fs.unlinkSync(ps1)}catch{}
 return r.status===0?{ok:true}:{ok:false,error:(r.stderr||r.stdout||'تعذر تجهيز صفحة المذكرة').trim()};
}
function patchPrintedMemoDate(docx,dateStr){
 const work=path.join(app.getPath('temp'),`memo-date-${Date.now()}-${process.pid}`);
 const ps1=path.join(app.getPath('temp'),`memo-date-${Date.now()}.ps1`);
 const [y,m,d]=String(dateStr||today()).split('-');const nd=`${Number(d)}/${Number(m)}/${y}`;
 const script=`$ErrorActionPreference='Stop'\r\nAdd-Type -AssemblyName System.IO.Compression.FileSystem\r\n$docx=${psQuote(docx)}\r\n$work=${psQuote(work)}\r\n$newDate=${psQuote(nd)}\r\ntry{\r\n`+
`New-Item -ItemType Directory -Path $work -Force|Out-Null;[IO.Compression.ZipFile]::ExtractToDirectory($docx,$work);$xp=Join-Path $work 'word\\\\document.xml';[xml]$x=Get-Content $xp -Raw -Encoding UTF8;$ns=New-Object Xml.XmlNamespaceManager($x.NameTable);$ns.AddNamespace('w','http://schemas.openxmlformats.org/wordprocessingml/2006/main');foreach($p in $x.SelectNodes('//w:body/w:p',$ns)){$ts=$p.SelectNodes('.//w:t',$ns);if($ts.Count -eq 0){continue};$j='';foreach($t in $ts){$j+=$t.InnerText};if($j -match '(الموافق|التاريخ|تحريرا في)'){$c=[regex]::Replace($j,'[0-9٠-٩]{1,2}\\s*/\\s*[0-9٠-٩]{1,2}\\s*/\\s*[0-9٠-٩]{4}',$newDate);if($j -match 'تحريرا في'){$c=[regex]::Replace($c,'تحريرا في\\s*[0-9٠-٩]*\\s*/\\s*[0-9٠-٩]*\\s*/\\s*[0-9٠-٩]{4}م?','تحريرا في '+$newDate+'م')};if($c -ne $j){$ts[0].InnerText=$c;for($i=1;$i -lt $ts.Count;$i++){$ts[$i].InnerText=''}}}};$set=New-Object Xml.XmlWriterSettings;$set.Encoding=New-Object Text.UTF8Encoding($false);$wr=[Xml.XmlWriter]::Create($xp,$set);$x.Save($wr);$wr.Close();Remove-Item $docx -Force;[IO.Compression.ZipFile]::CreateFromDirectory($work,$docx,[IO.Compression.CompressionLevel]::Optimal,$false)\r\n`+
`}catch{Write-Error $_.Exception.Message;exit 1}finally{if(Test-Path $work){Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue}}\r\n`;
 fs.writeFileSync(ps1,'\ufeff'+script,'utf8');const r=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',ps1],{encoding:'utf8',windowsHide:true});try{fs.unlinkSync(ps1)}catch{};return r.status===0?{ok:true}:{ok:false,error:(r.stderr||r.stdout||'تعذر تعديل التاريخ').trim()};
}
function removeUnusedMemoRows(docx,tableIndex,usedCount){
 if(usedCount<1)return {ok:true};
 const work=path.join(app.getPath('temp'),`memo-rows-${Date.now()}-${process.pid}`);
 const ps1=path.join(app.getPath('temp'),`memo-rows-${Date.now()}.ps1`);
 const script=`$ErrorActionPreference='Stop'\r\nAdd-Type -AssemblyName System.IO.Compression.FileSystem\r\n$docx=${psQuote(docx)}\r\n$work=${psQuote(work)}\r\n$ti=${tableIndex}\r\n$used=${usedCount}\r\ntry{\r\n`+
`New-Item -ItemType Directory -Path $work -Force|Out-Null;[IO.Compression.ZipFile]::ExtractToDirectory($docx,$work);$xp=Join-Path $work 'word\\\\document.xml';[xml]$x=Get-Content $xp -Raw -Encoding UTF8;$ns=New-Object Xml.XmlNamespaceManager($x.NameTable);$ns.AddNamespace('w','http://schemas.openxmlformats.org/wordprocessingml/2006/main');$tables=@($x.SelectNodes('//w:body/w:tbl',$ns));$tbl=$tables[$ti-1];$rows=@($tbl.SelectNodes('./w:tr',$ns));for($i=$rows.Count-1;$i -ge ($used+1);$i--){[void]$tbl.RemoveChild($rows[$i])};$set=New-Object Xml.XmlWriterSettings;$set.Encoding=New-Object Text.UTF8Encoding($false);$wr=[Xml.XmlWriter]::Create($xp,$set);$x.Save($wr);$wr.Close();Remove-Item $docx -Force;[IO.Compression.ZipFile]::CreateFromDirectory($work,$docx,[IO.Compression.CompressionLevel]::Optimal,$false)\r\n`+
`}catch{Write-Error $_.Exception.Message;exit 1}finally{if(Test-Path $work){Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue}}\r\n`;
 fs.writeFileSync(ps1,'\ufeff'+script,'utf8');const r=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',ps1],{encoding:'utf8',windowsHide:true});try{fs.unlinkSync(ps1)}catch{};return r.status===0?{ok:true}:{ok:false,error:(r.stderr||r.stdout||'تعذر حذف الصفوف الفارغة').trim()};
}
function patchMemoApprover(docx,name){
 
 const work=path.join(app.getPath('temp'),`memo-approver-${Date.now()}-${process.pid}`),ps1=path.join(app.getPath('temp'),`memo-approver-${Date.now()}.ps1`);
 const script=`$ErrorActionPreference='Stop'\r\nAdd-Type -AssemblyName System.IO.Compression.FileSystem\r\n$docx=${psQuote(docx)}\r\n$work=${psQuote(work)}\r\n$name=${psQuote(String(name).trim())}\r\ntry{New-Item -ItemType Directory -Path $work -Force|Out-Null;[IO.Compression.ZipFile]::ExtractToDirectory($docx,$work);$xp=Join-Path $work 'word\\document.xml';[xml]$x=Get-Content $xp -Raw -Encoding UTF8;$ns=New-Object Xml.XmlNamespaceManager($x.NameTable);$ns.AddNamespace('w','http://schemas.openxmlformats.org/wordprocessingml/2006/main');$done=$false;foreach($p in $x.SelectNodes('//w:p',$ns)){if($done){break};$ts=$p.SelectNodes('.//w:t',$ns);$j='';foreach($t in $ts){$j+=$t.InnerText};if($j -match '__MEMO_APPROVER__'){foreach($t in $ts){if($t.InnerText -match '__MEMO_APPROVER__'){$t.InnerText=$t.InnerText.Replace('__MEMO_APPROVER__',$name)}};$done=$true}elseif($name -and $j -match 'رئيس قسم التحقيق والأجانب|رئيس قسم التحقيق.*الأجانب'){$np=$p.CloneNode($true);$nts=$np.SelectNodes('.//w:t',$ns);$replaced=$false;foreach($nt in $nts){if($nt.InnerText -match '\S'){if(-not $replaced){$lead='';if($nt.InnerText -match '^(\s*)'){$lead=$Matches[1]};$nt.InnerText=$lead+$name;$replaced=$true}else{$nt.InnerText=''}}};if($replaced){[void]$p.ParentNode.InsertAfter($np,$p);$done=$true}}};$set=New-Object Xml.XmlWriterSettings;$set.Encoding=New-Object Text.UTF8Encoding($false);$wr=[Xml.XmlWriter]::Create($xp,$set);$body=$x.SelectSingleNode('//w:body',$ns);$children=@($body.ChildNodes);for($i=$children.Count-1;$i-ge 0;$i--){$n=$children[$i];if($n.LocalName -eq 'sectPr'){continue};if($n.LocalName -ne 'p'){break};$pt='';foreach($tt in $n.SelectNodes('.//w:t',$ns)){$pt+=$tt.InnerText};if([string]::IsNullOrWhiteSpace($pt)){[void]$body.RemoveChild($n)}else{break}};$x.Save($wr);$wr.Close();Remove-Item $docx -Force;[IO.Compression.ZipFile]::CreateFromDirectory($work,$docx,[IO.Compression.CompressionLevel]::Optimal,$false)}catch{Write-Error $_.Exception.Message;exit 1}finally{if(Test-Path $work){Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue}}\r\n`;
 fs.writeFileSync(ps1,'\ufeff'+script,'utf8');const r=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',ps1],{encoding:'utf8',windowsHide:true});try{fs.unlinkSync(ps1)}catch{};return r.status===0?{ok:true}:{ok:false,error:(r.stderr||r.stdout||'تعذر إضافة المصدق').trim()};
}
ipcMain.handle('memoprint',(_,id)=>{
 const m=db.prepare('SELECT * FROM memos WHERE id=?').get(id);if(!m)return {ok:false,error:'المذكرة غير موجودة'};
 const isRelease=String(m.memo_type).includes('افراج')||String(m.memo_type).includes('إفراج');
 const people=db.prepare(`SELECT * FROM memo_people WHERE memo_id=? ORDER BY sort_order,id LIMIT ${isRelease?20:8}`).all(id);
 if(!people.length)people.push({person_name:m.person_name,birth_year:m.birth_year,nationality:m.nationality,charge:m.charge,detention_date:m.detention_date,national_no:m.national_no});
 const emp=id=>id?db.prepare('SELECT * FROM employees WHERE id=?').get(id):null;
 const de=emp(m.data_entry_id),duty=emp(m.duty_officer_id),jo=emp(m.judicial_officer_id);
 const isOld=true;
 let template,updates=[],t,et;
 template=isRelease?'المذكرة القديمة - افراج.docx':'المذكرة القديمة - احتفاظ.docx';t=isRelease?1:2;et=isRelease?2:3;
 people.forEach((p,i)=>{
   const r=i+2;
   if(!isOld){
     updates.push({t,r,c:1,v:String(i+1)},{t,r,c:2,v:p.person_name||''},{t,r,c:3,v:p.birth_year||''},{t,r,c:4,v:p.national_no||''},{t,r,c:5,v:p.nationality||''},{t,r,c:6,v:p.charge||''},{t,r,c:7,v:p.detention_date||m.memo_date||''});
   }else{
     updates.push({t,r,c:1,v:String(i+1)},{t,r,c:2,v:p.person_name||''},{t,r,c:3,v:p.birth_year||''},{t,r,c:4,v:p.nationality||''},{t,r,c:5,v:p.charge||''},{t,r,c:6,v:p.detention_date||m.memo_date||''});
   }
 });
 if(!isOld){
   if(de)updates.push({t:et,r:1,c:1,labels:[de.name||'',de.rank||'',de.military_no||'']});
   if(duty)updates.push({t:et,r:1,c:2,labels:[duty.name||'',duty.rank||'',duty.military_no||'']});
   if(jo)updates.push({t:et,r:1,c:3,labels:[jo.name||'',jo.rank||'',jo.military_no||'']});
 }else{
   if(de){updates.push({t:et,r:2,c:1,v:'الاسم : '+(de.name||'')},{t:et,r:3,c:1,v:'الرتبة : '+(de.rank||'')},{t:et,r:4,c:1,v:'الرقم العسكري: '+(de.military_no||'')})}
   if(jo){updates.push({t:et,r:2,c:3,v:'الاسم: '+(jo.name||'')},{t:et,r:3,c:3,v:'الرتبة: '+(jo.rank||'')},{t:et,r:4,c:3,v:'الرقم : '+(jo.military_no||'')})}
 }
 const first=people[0]?.person_name||'مذكرة';
 const out=safeReportName(`مذكرة-${m.memo_type}-${first}`,m.memo_date||today());
 const made=runWordReport(template,out,updates,false);if(!made.ok)return made;
 const trimmed=removeUnusedMemoRows(made.path,t,people.length);if(!trimmed.ok)return trimmed;
 const dated=patchPrintedMemoDate(made.path,m.memo_date||today());if(!dated.ok)return dated;
 const signed=patchMemoApprover(made.path,m.approver_text||'');if(!signed.ok)return signed;
 shell.openPath(made.path);return made;
});
ipcMain.handle('memoadd',(_,r)=>{try{
 const maxPeople=(String(r.memo_type).includes('افراج')||String(r.memo_type).includes('إفراج'))?20:8;const people=(Array.isArray(r.people)?r.people:[]).filter(p=>String(p.person_name||'').trim()).slice(0,maxPeople);if(!people.length)return {ok:false,error:'أدخل شخصاً واحداً على الأقل'};
 const p=people[0];const tx=db.transaction(()=>{const x=db.prepare(`INSERT INTO memos(memo_type,memo_date,person_name,birth_year,nationality,charge,detention_date,national_no,data_entry_id,duty_officer_id,judicial_officer_id,memo_template,approver_text)VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(r.memo_type,r.memo_date,p.person_name,p.birth_year||'',p.nationality||'',p.charge||'',p.detention_date||'',p.national_no||'',r.data_entry_id||null,r.duty_officer_id||null,r.judicial_officer_id||null,'نموذج 2',r.approver_text||'');const ins=db.prepare(`INSERT INTO memo_people(memo_id,sort_order,person_name,birth_year,nationality,charge,detention_date,national_no)VALUES(?,?,?,?,?,?,?,?)`);people.forEach((q,i)=>ins.run(x.lastInsertRowid,i+1,q.person_name,q.birth_year||'',q.nationality||'',q.charge||'',q.detention_date||'',q.national_no||''));return x.lastInsertRowid});return {ok:true,id:tx()}
 }catch(e){return {ok:false,error:e.message}}});
ipcMain.handle('memoupdate',(_,r)=>{try{
 const maxPeople=(String(r.memo_type).includes('افراج')||String(r.memo_type).includes('إفراج'))?20:8;const people=(Array.isArray(r.people)?r.people:[]).filter(p=>String(p.person_name||'').trim()).slice(0,maxPeople);if(!people.length)return {ok:false,error:'أدخل شخصاً واحداً على الأقل'};
 const p=people[0];db.transaction(()=>{db.prepare(`UPDATE memos SET memo_type=?,memo_date=?,person_name=?,birth_year=?,nationality=?,charge=?,detention_date=?,national_no=?,data_entry_id=?,duty_officer_id=?,judicial_officer_id=?,memo_template=?,approver_text=? WHERE id=?`).run(r.memo_type,r.memo_date,p.person_name,p.birth_year||'',p.nationality||'',p.charge||'',p.detention_date||'',p.national_no||'',r.data_entry_id||null,r.duty_officer_id||null,r.judicial_officer_id||null,'نموذج 2',r.approver_text||'',r.id);db.prepare('DELETE FROM memo_people WHERE memo_id=?').run(r.id);const ins=db.prepare(`INSERT INTO memo_people(memo_id,sort_order,person_name,birth_year,nationality,charge,detention_date,national_no)VALUES(?,?,?,?,?,?,?,?)`);people.forEach((q,i)=>ins.run(r.id,i+1,q.person_name,q.birth_year||'',q.nationality||'',q.charge||'',q.detention_date||'',q.national_no||''));})();return {ok:true}
 }catch(e){return {ok:false,error:e.message}}});
ipcMain.handle('memodelete',(_,id)=>{try{db.transaction(()=>{db.prepare('DELETE FROM memo_people WHERE memo_id=?').run(id);db.prepare('DELETE FROM memos WHERE id=?').run(id)})();return {ok:true}}catch(e){return {ok:false,error:e.message}}});

ipcMain.handle('backup',async()=>{try{
 const z=await dialog.showOpenDialog({title:'اختر مكان حفظ النسخة الاحتياطية',properties:['openDirectory','createDirectory']});if(z.canceled||!z.filePaths?.[0])return {ok:false,canceled:true};
 db.pragma('wal_checkpoint(FULL)');
 const stamp=new Date().toISOString().replace(/[:T]/g,'-').slice(0,16);
 const dir=path.join(z.filePaths[0],`JudicialBackup-${stamp}`);fs.mkdirSync(dir,{recursive:true});
 for(const f of fs.readdirSync(app.getPath('userData')).filter(x=>/^judicial(?:-\d{4})?\.db$/.test(x)))fs.copyFileSync(path.join(app.getPath('userData'),f),path.join(dir,f));
 if(fs.existsSync(configPath()))fs.copyFileSync(configPath(),path.join(dir,'judicial-config.json'));
 const ed=path.join(app.getPath('userData'),'editable-templates');if(fs.existsSync(ed))fs.cpSync(ed,path.join(dir,'editable-templates'),{recursive:true});
 fs.writeFileSync(path.join(dir,'backup-info.txt'),`قسم التحقيق والأجانب\r\nتاريخ النسخة: ${new Date().toLocaleString('ar-JO')}\r\nتشمل: جميع السنوات + الإعدادات + النماذج المعدلة\r\n`,'utf8');
 return {ok:true,path:dir};
 }catch(e){return {ok:false,error:String(e?.message||e)}}});
ipcMain.handle('restore-backup',async()=>{try{
 const z=await dialog.showOpenDialog({title:'اختر مجلد النسخة الاحتياطية',properties:['openDirectory']});if(z.canceled||!z.filePaths?.[0])return {ok:false,canceled:true};
 const src=z.filePaths[0],srcDb=path.join(src,'judicial.db');if(!fs.existsSync(srcDb))return {ok:false,error:'المجلد المحدد لا يحتوي على ملف judicial.db'};
 const answer=await dialog.showMessageBox({type:'warning',buttons:['استعادة النسخة','إلغاء'],defaultId:1,cancelId:1,title:'استعادة النسخة الاحتياطية',message:'سيتم استبدال البيانات الحالية ببيانات النسخة الاحتياطية ثم إعادة تشغيل البرنامج. هل تريد المتابعة؟'});if(answer.response!==0)return {ok:false,canceled:true};
 db.pragma('wal_checkpoint(FULL)');db.close();
 const userDir=app.getPath('userData'),dstDb=path.join(userDir,'judicial.db');
 for(const f of fs.readdirSync(userDir).filter(x=>/^judicial(?:-\d{4})?\.db(?:-wal|-shm)?$/.test(x))){try{fs.rmSync(path.join(userDir,f),{force:true})}catch{}}
 for(const f of fs.readdirSync(src).filter(x=>/^judicial(?:-\d{4})?\.db$/.test(x)))fs.copyFileSync(path.join(src,f),path.join(userDir,f));
 const srcCfg=path.join(src,'judicial-config.json');if(fs.existsSync(srcCfg))fs.copyFileSync(srcCfg,configPath());else {try{if(fs.existsSync(configPath()))fs.rmSync(configPath(),{force:true})}catch{}}
 const srcEd=path.join(src,'editable-templates'),dstEd=path.join(userDir,'editable-templates');if(fs.existsSync(srcEd)){if(fs.existsSync(dstEd))fs.rmSync(dstEd,{recursive:true,force:true});fs.cpSync(srcEd,dstEd,{recursive:true})}
 setTimeout(()=>{app.relaunch();app.exit(0)},250);return {ok:true,restarting:true};
 }catch(e){return {ok:false,error:String(e?.message||e)}}});
ipcMain.handle('open-template',async(_,name)=>{let p=templatePath(name);if(!fs.existsSync(p))return {ok:false,error:'النموذج غير موجود'};await shell.openPath(p);return {ok:true}});
ipcMain.handle('templates-list',async()=>{try{return {ok:true,items:listFactoryTemplates().map(x=>({...x,path:templatePath(x.relative)}))}}catch(e){return {ok:false,error:String(e?.message||e)}}});
ipcMain.handle('template-open-edit',async(_,rel)=>{try{const p=templatePath(String(rel||''));if(!fs.existsSync(p))return {ok:false,error:'النموذج غير موجود'};const err=await shell.openPath(p);return err?{ok:false,error:err}:{ok:true,path:p}}catch(e){return {ok:false,error:String(e?.message||e)}}});
ipcMain.handle('template-restore-one',async(_,rel)=>{try{rel=String(rel||'').replace(/\//g,path.sep);const src=factoryTemplatePath(rel),dst=path.join(editableTemplatesDir(),rel);if(!fs.existsSync(src))return {ok:false,error:'النسخة الأصلية غير موجودة'};fs.mkdirSync(path.dirname(dst),{recursive:true});fs.copyFileSync(src,dst);return {ok:true,path:dst}}catch(e){return {ok:false,error:String(e?.message||e)}}});
ipcMain.handle('templates-open-folder',async()=>{try{const dir=editableTemplatesDir();fs.mkdirSync(dir,{recursive:true});for(const x of listFactoryTemplates())templatePath(x.relative);const err=await shell.openPath(dir);return err?{ok:false,error:err}:{ok:true,path:dir}}catch(e){return {ok:false,error:String(e?.message||e)}}});


function psQuote(v){return "'"+String(v??'').replace(/'/g,"''")+"'"}
function displayVal(v,dashes='---------'){return Number(v||0)>0?String(v):dashes}
function safeReportName(base,date){return `${base}-${date}.docx`.replace(/[\\/:*?"<>|]/g,'-')}
function uniqueReportPath(dir,fileName){
 const ext=path.extname(fileName),stem=path.basename(fileName,ext);
 let candidate=path.join(dir,fileName),n=2;
 while(fs.existsSync(candidate)){candidate=path.join(dir,`${stem} (${n++})${ext}`)}
 return candidate;
}

/*
  إنشاء التقرير مباشرة من ملف DOCX الأصلي بدون تشغيل Microsoft Word.
  DOCX عبارة عن ZIP؛ نفك نسخة مؤقتة، نغيّر نص الخلايا المطلوبة في word/document.xml،
  ثم نعيد ضغطها. بذلك تبقى الهوامش والخطوط والجداول والشعارات والتواقيع من النموذج الأصلي.
*/
function runWordReport(templateName,outName,cellUpdates,openAfter=true){
 const template=templatePath(templateName);
 if(!fs.existsSync(template))return {ok:false,error:'النموذج الأصلي غير موجود'};
 const reportDir=path.join(app.getPath('documents'),'تقارير قسم التحقيق والأجانب');
 fs.mkdirSync(reportDir,{recursive:true});
 const out=uniqueReportPath(reportDir,outName);
 const work=path.join(app.getPath('temp'),`judicial-docx-${Date.now()}-${process.pid}`);
 const ps1=path.join(app.getPath('temp'),`judicial-docx-${Date.now()}.ps1`);
 const updatesJson=JSON.stringify(cellUpdates).replace(/'/g,"''");
 const script=`$ErrorActionPreference='Stop'\r\n`+
`Add-Type -AssemblyName System.IO.Compression.FileSystem\r\n`+
`$template=${psQuote(template)}\r\n$out=${psQuote(out)}\r\n$work=${psQuote(work)}\r\n`+
`try {\r\n`+
` if(Test-Path -LiteralPath $work){Remove-Item -LiteralPath $work -Recurse -Force}\r\n`+
` New-Item -ItemType Directory -Path $work -Force | Out-Null\r\n`+
` [System.IO.Compression.ZipFile]::ExtractToDirectory($template,$work)\r\n`+
` $xmlPath=Join-Path $work 'word\\\\document.xml'\r\n`+
` [xml]$xml=Get-Content -LiteralPath $xmlPath -Raw -Encoding UTF8\r\n`+
` $ns=New-Object System.Xml.XmlNamespaceManager($xml.NameTable)\r\n`+
` $ns.AddNamespace('w','http://schemas.openxmlformats.org/wordprocessingml/2006/main')\r\n`+
` $updates=ConvertFrom-Json '${updatesJson}'\r\n`+
` $tables=$xml.SelectNodes('//w:body/w:tbl',$ns)\r\n`+
` foreach($u in $updates){\r\n`+
`   $tbl=$tables[[int]$u.t-1]; if($null -eq $tbl){throw "Table index not found: $($u.t)"}\r\n`+
`   $rows=$tbl.SelectNodes('./w:tr',$ns); $row=$rows[[int]$u.r-1]; if($null -eq $row){throw "Row index not found: $($u.r)"}\r\n`+
`   $cells=$row.SelectNodes('./w:tc',$ns); $cell=$cells[[int]$u.c-1]; if($null -eq $cell){throw "Cell index not found: $($u.c)"}\r\n`+
`   $texts=$cell.SelectNodes('.//w:t',$ns)\r\n`+
`   if($null -ne $u.labels){$vals=@($u.labels);$ps=$cell.SelectNodes('./w:p',$ns);foreach($pp in $ps){$pts=$pp.SelectNodes('.//w:t',$ns);if($pts.Count -eq 0){continue};$pj='';foreach($pt in $pts){$pj+=$pt.InnerText};$val=$null;if($pj -match '^\\s*الاسم\\s*:'){$val=[string]$vals[0]}elseif($pj -match '^\\s*الرتبة\\s*:'){$val=[string]$vals[1]}elseif($pj -match '^\\s*الرقم\\s*:'){$val=[string]$vals[2]};if($null -ne $val){$label=($pj -replace ':.*$',':');$pts[0].InnerText=$label+' '+$val;for($jj=1;$jj -lt $pts.Count;$jj++){$pts[$jj].InnerText=''}}};continue}\r\n`+
`   if($texts.Count -eq 0){\r\n`+
`     $p=$cell.SelectSingleNode('./w:p',$ns); if($null -eq $p){$p=$xml.CreateElement('w','p',$ns.LookupNamespace('w')); [void]$cell.AppendChild($p)}\r\n`+
`     $run=$xml.CreateElement('w','r',$ns.LookupNamespace('w')); $tx=$xml.CreateElement('w','t',$ns.LookupNamespace('w')); $tx.InnerText=[string]$u.v; [void]$run.AppendChild($tx); [void]$p.AppendChild($run)\r\n`+
`   } else {\r\n`+
`     $texts[0].InnerText=[string]$u.v\r\n`+
`     for($i=1;$i -lt $texts.Count;$i++){$texts[$i].InnerText=''}\r\n`+
`   }\r\n`+
` }\r\n`+
` $settings=New-Object System.Xml.XmlWriterSettings; $settings.Encoding=New-Object System.Text.UTF8Encoding($false); $settings.Indent=$false\r\n`+
` $writer=[System.Xml.XmlWriter]::Create($xmlPath,$settings); $xml.Save($writer); $writer.Close()\r\n`+
` if(Test-Path -LiteralPath $out){Remove-Item -LiteralPath $out -Force}\r\n`+
` [System.IO.Compression.ZipFile]::CreateFromDirectory($work,$out,[System.IO.Compression.CompressionLevel]::Optimal,$false)\r\n`+
`} catch { Write-Error $_.Exception.Message; exit 1 } finally { if(Test-Path -LiteralPath $work){Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue} }\r\n`;
 fs.writeFileSync(ps1,'\ufeff'+script,'utf8');
 const r=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',ps1],{encoding:'utf8',windowsHide:true});
 try{fs.unlinkSync(ps1)}catch{}
 if(r.status!==0)return {ok:false,error:(r.stderr||r.stdout||'تعذر إنشاء ملف Word').trim()};
 if(openAfter)shell.openPath(out);
 return {ok:true,path:out};
}

function arDayName(dateStr){
 const days=['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
 const d=new Date(dateStr+'T12:00:00');
 return days[d.getDay()];
}
function runWordDateOnlyReport(templateName,outName,dateStr,changeDay,templateIsPath=false){
 const template=templateIsPath?templateName:templatePath(templateName);
 if(!fs.existsSync(template))return {ok:false,error:'النموذج الأصلي غير موجود'};
 const reportDir=path.join(app.getPath('documents'),'تقارير قسم التحقيق والأجانب');
 fs.mkdirSync(reportDir,{recursive:true});
 const out=uniqueReportPath(reportDir,outName);
 const work=path.join(app.getPath('temp'),`judicial-date-docx-${Date.now()}-${process.pid}`);
 const ps1=path.join(app.getPath('temp'),`judicial-date-docx-${Date.now()}.ps1`);
 const [yy,mm,dd]=dateStr.split('-');
 const newDate=`${Number(dd)}/${Number(mm)}/${yy}`;
 const newDay=arDayName(dateStr);
 const script=`$ErrorActionPreference='Stop'\r\n`+
`Add-Type -AssemblyName System.IO.Compression.FileSystem\r\n`+
`$template=${psQuote(template)}\r\n$out=${psQuote(out)}\r\n$work=${psQuote(work)}\r\n`+
`try {\r\n`+
` if(Test-Path -LiteralPath $work){Remove-Item -LiteralPath $work -Recurse -Force}\r\n`+
` New-Item -ItemType Directory -Path $work -Force | Out-Null\r\n`+
` [System.IO.Compression.ZipFile]::ExtractToDirectory($template,$work)\r\n`+
` $xmlFiles=Get-ChildItem -LiteralPath (Join-Path $work 'word') -Filter '*.xml' -File | Where-Object { $_.Name -eq 'document.xml' -or $_.Name -like 'header*.xml' -or $_.Name -like 'footer*.xml' }\r\n`+
` foreach($xf in $xmlFiles){\r\n`+
`  [xml]$xml=Get-Content -LiteralPath $xf.FullName -Raw -Encoding UTF8\r\n`+
`  $ns=New-Object System.Xml.XmlNamespaceManager($xml.NameTable)\r\n`+
`  $ns.AddNamespace('w','http://schemas.openxmlformats.org/wordprocessingml/2006/main')\r\n`+
`  $paras=$xml.SelectNodes('//w:p',$ns)\r\n`+
`  foreach($p in $paras){\r\n`+
`   $texts=$p.SelectNodes('.//w:t',$ns); if($texts.Count -eq 0){continue}\r\n`+
`   $joined=''; foreach($tx in $texts){$joined += $tx.InnerText}\r\n`+
`   $changed=$joined.Replace('20/9/2026',${psQuote(newDate)}).Replace('20 / 9 / 2026',${psQuote(newDate)}).Replace('20/09/2026',${psQuote(newDate)})\r\n`+
(changeDay?`   if($changed -ne $joined){$changed=$changed.Replace('الاحد',${psQuote(newDay)}).Replace('الأحد',${psQuote(newDay)})}\r\n`:'')+
`   if($changed -ne $joined){$texts[0].InnerText=$changed; for($i=1;$i -lt $texts.Count;$i++){$texts[$i].InnerText=''}}\r\n`+
`  }\r\n`+
`  $settings=New-Object System.Xml.XmlWriterSettings; $settings.Encoding=New-Object System.Text.UTF8Encoding($false); $settings.Indent=$false\r\n`+
`  $writer=[System.Xml.XmlWriter]::Create($xf.FullName,$settings); $xml.Save($writer); $writer.Close()\r\n`+
` }\r\n`+
` if(Test-Path -LiteralPath $out){Remove-Item -LiteralPath $out -Force}\r\n`+
` [System.IO.Compression.ZipFile]::CreateFromDirectory($work,$out,[System.IO.Compression.CompressionLevel]::Optimal,$false)\r\n`+
`} catch { Write-Error $_.Exception.Message; exit 1 } finally { if(Test-Path -LiteralPath $work){Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue} }\r\n`;
 fs.writeFileSync(ps1,'\ufeff'+script,'utf8');
 const r=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',ps1],{encoding:'utf8',windowsHide:true});
 try{fs.unlinkSync(ps1)}catch{}
 if(r.status!==0)return {ok:false,error:(r.stderr||r.stdout||'تعذر إنشاء ملف Word').trim()};
 shell.openPath(out);
 return {ok:true,path:out};
}
function dailyLetterOriginalTemplate(){return factoryTemplatePath('مخاطبة الوسط التقرير اليومي.docx')}
function dailyLetterActiveTemplate(){
 const dir=path.join(app.getPath('userData'),'editable-templates');fs.mkdirSync(dir,{recursive:true});
 const active=path.join(dir,'مخاطبة الوسط التقرير اليومي.docx');
 if(!fs.existsSync(active))fs.copyFileSync(dailyLetterOriginalTemplate(),active);
 return active;
}
ipcMain.handle('open-daily-letter-template',async()=>{try{const p=dailyLetterActiveTemplate();const err=await shell.openPath(p);return err?{ok:false,error:err}:{ok:true,path:p}}catch(e){return {ok:false,error:String(e?.message||e)}}});
ipcMain.handle('restore-daily-letter-template',async()=>{try{const src=dailyLetterOriginalTemplate(),dst=dailyLetterActiveTemplate();fs.copyFileSync(src,dst);return {ok:true,path:dst}}catch(e){return {ok:false,error:String(e?.message||e)}}});
ipcMain.handle('generate-daily-letter',(_,date=today())=>runWordDateOnlyReport(dailyLetterActiveTemplate(),safeReportName('المخاطبات اليومية',date),date,true,true));
ipcMain.handle('generate-sunwed-letter',(_,date=today())=>runWordDateOnlyReport('تعليمات النظارات احد واربعاء.docx',safeReportName('تعليمات النظارات',date),date,false));

ipcMain.handle('generate-word-general',(_,date=today())=>{try{
 const d=currentDayStats(date),c=approvedCumulative().totals;
 const u=[
  {t:1,r:3,c:3,v:displayVal(d.total,'--------')},{t:1,r:3,c:4,v:displayVal(d.deported,'------')},{t:1,r:3,c:5,v:displayVal(d.released,'------')},{t:1,r:3,c:6,v:displayVal(d.waiting,'--------')},
  {t:3,r:3,c:3,v:c.total},{t:3,r:3,c:4,v:c.deported},{t:3,r:3,c:5,v:c.released},{t:3,r:3,c:6,v:c.waiting}
 ];
 return runWordReport('احصائية العمالة الوافداة المعتمدة لعام 2026.docx',safeReportName('الإحصائية العامة',date),u);
}catch(e){return {ok:false,error:String(e?.message||e)}}});
ipcMain.handle('generate-word-detail',(_,date=today())=>{try{
 const norm=n=>String(n||'').trim().replace('اثيوبية','اثيوبي');
 const day=currentDayStats(date),D=Object.fromEntries(day.byNat.map(x=>[norm(x.nationality),x]));
 const dailyRows=[['مصري',3],['يمني',4],['سوداني',5],['باكستاني',6],['هندي',7],['بنقالي',8],['اثيوبي',9],['فلبيني',10],['عراقي',11],['جنسيات أخرى',12]];
 let u=[];
 for(const [n,r] of dailyRows){const x=D[n]||{};u.push({t:1,r,c:2,v:displayVal(x.total,'--------')},{t:1,r,c:3,v:displayVal(x.deported,'------')},{t:1,r,c:4,v:displayVal(x.released,'------')},{t:1,r,c:5,v:displayVal(x.waiting,'--------')});}
 u.push({t:1,r:13,c:2,v:displayVal(day.total,'--------')},{t:1,r:13,c:3,v:displayVal(day.deported,'------')},{t:1,r:13,c:4,v:displayVal(day.released,'------')},{t:1,r:13,c:5,v:displayVal(day.waiting,'--------')});
 const cum=approvedCumulative(),A=Object.fromEntries(cum.rows.map(x=>[norm(x.nationality),x]));
 const cumRows=[['مصري',3],['يمني',4],['سوداني',5],['اثيوبي',6],['هندي',7],['بنقالي',8],['سريلانكي',9],['فلبيني',10],['عراقي',11],['جنسيات أخرى',12]];
 for(const [n,r] of cumRows){const x=A[n]||{};u.push({t:2,r,c:2,v:displayVal(x.total,'-----')},{t:2,r,c:3,v:displayVal(x.deported,'-----')},{t:2,r,c:4,v:displayVal(x.released,'-----')},{t:2,r,c:5,v:displayVal(x.waiting,'-----')});}
 const z=cum.totals;u.push({t:2,r:13,c:2,v:z.total},{t:2,r:13,c:3,v:z.deported},{t:2,r:13,c:4,v:z.released},{t:2,r:13,c:5,v:z.waiting});
 return runWordReport('احصائية العمالة الوافدة للجنسيات المعتمدة لعام 2026.docx',safeReportName('الإحصائية حسب الجنسية',date),u);
}catch(e){return {ok:false,error:String(e?.message||e)}}});;
// كشف المواقيف: قنوات مستقلة تعمل على قاعدة بيانات سنة العمل الحالية.
require('./detention-register').register(ipcMain,()=>db);
