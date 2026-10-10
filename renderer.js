
// V5.10.6 - رسائل داخل البرنامج بدل alert حتى لا تفقد الخانات تركيز لوحة المفاتيح.
function appMessage(message){
 let box=document.getElementById('appToast');
 if(!box){box=document.createElement('div');box.id='appToast';box.className='appToast';document.body.appendChild(box)}
 box.textContent=String(message||'');
 box.classList.add('show');
 clearTimeout(appMessage._t);
 appMessage._t=setTimeout(()=>box.classList.remove('show'),3500);
}
window.alert=appMessage;

const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];let rows=[],emps=[];
const esc=(s='')=>String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const td=()=>{let d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
function tick(){let d=new Date();$('#day').textContent=d.toLocaleDateString('ar-JO',{weekday:'long'});$('#date').textContent=d.toLocaleDateString('en-GB');$('#time').textContent=d.toLocaleTimeString('ar-JO',{hour:'2-digit',minute:'2-digit'})}tick();setInterval(tick,30000);$('#statDate').value=td();
function go(p){if(p==='letters'&&!$('#letterDate').value)$('#letterDate').value=td();$$('.page').forEach(x=>x.classList.remove('active'));$('#'+p).classList.add('active');$$('.nav').forEach(x=>x.classList.toggle('active',x.dataset.page===p));if(p==='home')home();if(p==='campaigns')campaigns();if(p==='settings'){loadEmp();loadSignatories();loadTemplates();}if(p==='memos')loadMemos()}
$$('.nav').forEach(x=>x.onclick=()=>go(x.dataset.page));$$('[data-go]').forEach(x=>x.onclick=()=>go(x.dataset.go));$$('.back').forEach(x=>x.onclick=()=>go('home'));
const badge=s=>`<span class="badge ${s==='منتظر'?'wait':s==='ابعد'?'dep':'rel'}">${esc(s)}</span>`;
async function st(d=td()){try{let x=await api.stats(d);if(!x?.ok)throw new Error(x?.error||'تعذر قراءة الإحصائيات');return x}catch(e){console.error('stats',e);return {ok:false,date:d,total:182,deported:145,released:29,waiting:8,dailyArrests:0,dailyDeported:0,dailyReleased:0,dailyWaiting:0,byNat:[],dailyByNat:[],dailyChangesByNat:[]}}}
async function home(){let s=await st();$('#homeStats').innerHTML=[['إجمالي المضبوطين',s.total],['المنتظرون',s.waiting],['المبعدون',s.deported],['مكفل / إخلاء سبيل',s.released]].map(a=>`<div class="stat"><span>${a[0]}</span><b>${a[1]}</b></div>`).join('');let r=(await api.list('')).slice(0,5);$('#recent').innerHTML=tableMini(r)}
function tableMini(r){return `<div class="tableWrap"><table><tr><th>الرقم الشخصي</th><th>الاسم</th><th>تاريخ الضبط</th><th>رقم القيد</th><th>الإجراء</th></tr>${r.map(x=>`<tr><td>${esc(x.personal_no)}</td><td>${esc(x.name)}</td><td>${esc(x.arrest_date)}</td><td>${esc(x.record_no)}</td><td>${badge(x.status)}</td></tr>`).join('')}</table></div>`}
async function campaigns(){
 rows=await api.list($('#search').value||'');
 const statusFilter=$('#statusFilter')?.value||'';
 if(statusFilter) rows=rows.filter(x=>x.status===statusFilter);
 let s=await st($('#statDate').value||td());
 $('#campaignStats').innerHTML=`
 <section class="statGroup">
   <h3>الإحصائية اليومية – ${esc($('#statDate').value||td())}</h3>
   <div class="statGrid">
     <div class="stat"><span>المضبوطون</span><b>${s.dailyArrests}</b></div>
     <div class="stat"><span>المبعدون</span><b>${s.dailyDeported}</b></div>
     <div class="stat"><span>ألغي قرار إبعادهم<br><small>مكفل / إخلاء سبيل</small></span><b>${s.dailyReleased}</b></div>
     <div class="stat"><span>المنتظرون</span><b>${s.dailyWaiting}</b></div>
   </div>
 </section>
 <section class="statGroup">
   <h3>الإحصائية التراكمية الحالية</h3>
   <div class="statGrid">
     <div class="stat"><span>إجمالي المضبوطين</span><b>${s.total}</b></div>
     <div class="stat"><span>المبعدون</span><b>${s.deported}</b></div>
     <div class="stat"><span>ألغي قرار إبعادهم<br><small>مكفل / إخلاء سبيل</small></span><b>${s.released}</b></div>
     <div class="stat"><span>المنتظرون</span><b>${s.waiting}</b></div>
   </div>
 </section>`;
 $('#body').innerHTML=rows.map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.personal_no)}</td><td>${esc(r.name)}</td><td>${esc(r.arrest_date)}</td><td>${esc(r.record_no)}</td><td>${badge(r.status)}</td><td>${esc(r.nationality)}</td><td><button class="smallBtn" onclick="editD(${r.id})">تعديل</button> <button class="smallBtn danger" onclick="delD(${r.id})">حذف</button></td></tr>`).join('')
}
$('#search').oninput=campaigns;$('#statusFilter').onchange=campaigns;$('#statDate').onchange=campaigns;
$('#printDetainees').onclick=printDetaineesRegister;
function printDetaineesRegister(){
 const data=rows;
 if(!data.length){appMessage('لا توجد سجلات للطباعة حسب الفلتر الحالي');return}
 const sc=x=>x==='ابعد'?'st-dep':x==='مكفل'?'st-bail':x==='اخلاء سبيل'?'st-release':'st-wait';
 const st=x=>x==='ابعد'?'مبعد':x==='اخلاء سبيل'?'إخلاء سبيل':x;
 const w=window.open('','_blank','width=1200,height=850');
 w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>سجل المضبوطين</title><style>
 @page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{font-family:Arial,Tahoma,sans-serif;color:#111;margin:0;background:#fff}
 h1{text-align:center;font-size:26px;margin:0 0 14px}table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:13px}
 th,td{border:1px solid #666;padding:6px 5px;text-align:center;vertical-align:middle;word-wrap:break-word}th{background:#d9e8f5;font-weight:700;font-size:14px}
 tbody tr:nth-child(even) td:not(.statusCell){background:#f7f7f7}.num{width:4%}.name{width:19%}.nat{width:10%}.date{width:12%}.record{width:11%}.status{width:12%}.actionDate{width:12%}.notes{width:20%}
 .statusCell{font-weight:700}.st-dep{background:#ff5a49!important}.st-bail{background:#55c873!important}.st-release{background:#4db5e8!important}.st-wait{background:#ffd42a!important}
 .total{text-align:right;font-weight:700;font-size:15px;margin-top:10px}</style></head><body><h1>سجل المضبوطين</h1><table><thead><tr>
 <th class="num">#</th><th class="name">الاسم الكامل</th><th class="nat">الجنسية</th><th class="date">تاريخ الضبط</th><th class="record">رقم القيد</th><th class="status">الإجراء الحالي</th><th class="actionDate">تاريخ الإجراء</th><th class="notes">الملاحظات</th>
 </tr></thead><tbody>${data.map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.name)}</td><td>${esc(r.nationality)}</td><td>${esc(r.arrest_date)}</td><td>${esc(r.record_no)}</td><td class="statusCell ${sc(r.status)}">${esc(st(r.status))}</td><td>${esc(r.action_date||r.status_date||'--------')}</td><td>${esc((()=>{const n=String(r.notes??'').trim();return (!n||/^مستورد من كشف أسماء المضبوطين(?:\s+2026)?$/i.test(n))?'--------':n})())}</td></tr>`).join('')}</tbody></table><div class="total">العدد الكلي: ${data.length}</div><script>window.onload=()=>window.print()<\/script></body></html>`);
 w.document.close();
}

function modal(h){$('#mc').innerHTML=h;$('#modal').classList.add('show')}$('#close').onclick=()=>$('#modal').classList.remove('show');
const nats=['مصري','يمني','سوداني','باكستاني','هندي','بنقالي','اثيوبي','فلبيني','عراقي','سريلانكي','جنسيات أخرى'];
function form(r={}){return `<h2>${r.id?'تعديل سجل':'إضافة شخص مضبوط'}</h2><form id="df" class="gridForm"><input type="hidden" name="id" value="${r.id||''}"><label>الرقم الشخصي<input name="personal_no" value="${esc(r.personal_no||'')}"></label><label>الاسم<input name="name" required value="${esc(r.name||'')}"></label><label>تاريخ الضبط<input type="date" name="arrest_date" required value="${r.arrest_date||td()}"></label><label>رقم القيد<input name="record_no" value="${esc(r.record_no||'')}"></label><label>الإجراء<select name="status">${['منتظر','ابعد','مكفل','اخلاء سبيل'].map(s=>`<option ${r.status===s?'selected':''}>${s}</option>`)}</select></label><label>الجنسية<select name="nationality">${nats.map(n=>`<option ${r.nationality===n?'selected':''}>${n}</option>`)}</select></label><label class="full">ملاحظات<input name="notes" value="${esc(r.notes||'')}"></label>${r.id?`<label>تاريخ تغيير الإجراء<input type="date" name="action_date" value="${td()}"></label>`:''}<button class="primary full">حفظ</button></form>`}
function bind(){ $('#df').onsubmit=async e=>{e.preventDefault();let r=Object.fromEntries(new FormData(e.target));r.id=+r.id||0;let z=r.id?await api.update(r):await api.add(r);if(!z.ok)return alert(z.error);$('#modal').classList.remove('show');campaigns();home()}}
function batchDetaineeForm(){
 const item=(i=0)=>`<div class="batchPerson"><div class="personHead"><b>الشخص ${i+1}</b>${i?'<button type="button" class="removeBatch danger">مسح الشخص</button>':''}</div><div class="personGrid"><label>الرقم الشخصي<input class="b_personal"></label><label>الاسم<input class="b_name" required></label><label>تاريخ الضبط<input type="date" class="b_date" value="${td()}" required></label><label>رقم القيد<input class="b_record"></label><label>الإجراء<select class="b_status">${['منتظر','ابعد','مكفل','اخلاء سبيل'].map(s=>`<option>${s}</option>`).join('')}</select></label><label>الجنسية<select class="b_nat">${nats.map(n=>`<option>${n}</option>`).join('')}</select></label><label class="full">ملاحظات<input class="b_notes"></label></div></div>`;
 modal(`<h2>إضافة أشخاص مضبوطين</h2><form id="batchDf"><div id="batchBox">${item(0)}</div><button type="button" id="addBatchPerson" class="addPersonBtn">+ إضافة شخص آخر</button><small class="hint">يمكنك إضافة عدة أشخاص وحفظهم دفعة واحدة.</small><button class="primary batchSave">حفظ جميع الأشخاص</button></form>`);
 const ren=()=>document.querySelectorAll('.batchPerson').forEach((x,i)=>x.querySelector('.personHead b').textContent='الشخص '+(i+1));
 const bindRemove=()=>document.querySelectorAll('.removeBatch').forEach(b=>b.onclick=()=>{b.closest('.batchPerson').remove();ren()});
 $('#addBatchPerson').onclick=()=>{let box=$('#batchBox'),n=box.querySelectorAll('.batchPerson').length;box.insertAdjacentHTML('beforeend',item(n));bindRemove();box.lastElementChild.querySelector('.b_name')?.focus()};
 $('#batchDf').onsubmit=async e=>{e.preventDefault();let items=[...document.querySelectorAll('.batchPerson')].map(x=>({personal_no:x.querySelector('.b_personal').value.trim(),name:x.querySelector('.b_name').value.trim(),arrest_date:x.querySelector('.b_date').value,record_no:x.querySelector('.b_record').value.trim(),status:x.querySelector('.b_status').value,nationality:x.querySelector('.b_nat').value,notes:x.querySelector('.b_notes').value.trim()})).filter(x=>x.name);if(!items.length)return appMessage('أدخل شخصاً واحداً على الأقل');let z=await api.addMany(items);if(!z?.ok)return appMessage('تعذر الحفظ: '+(z?.error||''));$('#modal').classList.remove('show');appMessage('تم حفظ '+z.count+' شخص بنجاح');campaigns();home()};
}
$('#add').onclick=batchDetaineeForm;window.editD=id=>{modal(form(rows.find(x=>x.id===id)));bind()};window.delD=async id=>{if(confirm('متأكد من الحذف؟')){let z=await api.del(id);if(!z?.ok)return alert('تعذر الحذف: '+(z?.error||'خطأ غير معروف'));await campaigns();await home()}};

function pw(title,body){let w=window.open('','','width=1050,height=850');w.document.write(`<html dir="rtl"><head><meta charset="utf-8"><title>${title}</title><style>@page{size:A4;margin:18mm}body{font-family:"Traditional Arabic",Tahoma;font-size:18px}h1,h2{text-align:center}table{width:100%;border-collapse:collapse;margin:14px 0}th,td{border:1px solid #000;padding:7px;text-align:center}.head{text-align:right;line-height:1.6}.sig{margin-top:40px;text-align:left}</style></head><body>${body}</body></html>`);w.document.close();setTimeout(()=>w.print(),350)}
$('#general').onclick=async()=>{try{let r=await api.generateWordGeneral($('#statDate').value||td());if(!r?.ok)return alert('تعذر إنشاء الإحصائية العامة: '+(r?.error||'خطأ غير معروف'))}catch(e){alert('تعذر إنشاء الإحصائية العامة: '+e.message)}};
$('#detail').onclick=async()=>{try{let r=await api.generateWordDetail($('#statDate').value||td());if(!r?.ok)return alert('تعذر إنشاء الإحصائية المفصلة: '+(r?.error||'خطأ غير معروف'))}catch(e){alert('تعذر إنشاء الإحصائية المفصلة: '+e.message)}};

$('#dailyWord').onclick=async()=>{let r=await api.generateDailyLetter($('#letterDate').value||td());if(!r.ok)alert('تعذر إنشاء التقرير اليومي: '+r.error)};
$('#sunWedWord').onclick=async()=>{let r=await api.generateSunWedLetter($('#letterDate').value||td());if(!r.ok)alert('تعذر إنشاء تعليمات النظارات: '+r.error)};
$('#editDailyTemplate').onclick=async()=>{let r=await api.openDailyLetterTemplate();if(!r?.ok)alert('تعذر فتح النموذج المعتمد: '+(r?.error||''))};
$('#restoreDailyTemplate').onclick=async()=>{if(!confirm('سيتم حذف تعديلاتك على نموذج التقرير اليومي وإرجاع النموذج الأصلي. هل تريد المتابعة؟'))return;let r=await api.restoreDailyLetterTemplate();if(!r?.ok)return alert('تعذر استعادة النموذج الأصلي: '+(r?.error||''));alert('تمت استعادة النموذج الأصلي بنجاح')};

async function loadEmp(){emps=await api.emps();$('#empTable').innerHTML=`<div class="tableWrap"><table><tr><th>الاسم</th><th>الرتبة</th><th>الرقم العسكري</th><th>الصفة</th><th></th></tr>${emps.map(x=>`<tr><td>${esc(x.name)}</td><td>${esc(x.rank)}</td><td>${esc(x.military_no)}</td><td>${esc(x.role)}</td><td><button class="smallBtn danger" onclick="delE(${x.id})">حذف</button></td></tr>`).join('')}</table></div>`}$('#empForm').onsubmit=async e=>{e.preventDefault();await api.empadd(Object.fromEntries(new FormData(e.target)));e.target.reset();loadEmp()};window.delE=async id=>{await api.empdel(id);loadEmp()};
async function loadMemos(){emps=await api.emps();let a=await api.memos();$('#memosTable').innerHTML=`<div class="tableWrap"><table><tr><th>النوع</th><th>التاريخ</th><th>الأشخاص</th><th>الاسم الأول</th><th>المصدق</th><th>إجراء</th></tr>${a.map(x=>`<tr><td>${x.memo_type}</td><td>${x.memo_date}</td><td>${x.person_count||1}</td><td>${esc(x.person_name)}</td><td>${esc(x.approver_text||'')}</td><td><button class="memoPrint" data-id="${x.id}">طباعة</button> <button class="memoEdit" data-id="${x.id}">تعديل</button> <button class="memoDelete danger" data-id="${x.id}">مسح</button></td></tr>`).join('')}</table></div>`;document.querySelectorAll('.memoPrint').forEach(b=>b.onclick=async()=>{let r=await api.memoPrint(+b.dataset.id);if(!r?.ok)alert('تعذر الطباعة: '+(r?.error||''))});document.querySelectorAll('.memoEdit').forEach(b=>b.onclick=()=>memoForm(a.find(x=>x.id==b.dataset.id)));document.querySelectorAll('.memoDelete').forEach(b=>b.onclick=async()=>{let x=a.find(v=>v.id==b.dataset.id);if(!confirm('هل أنت متأكد من مسح مذكرة '+(x?.person_name||'')+'؟'))return;let r=await api.memoDelete(+b.dataset.id);if(!r?.ok)return alert('تعذر المسح');loadMemos()})}
async function memoForm(edit=null){
 emps=await api.emps();let signatories=await api.signatories();let retained=await api.retainedPeople();let existing=edit?await api.memoPeople(edit.id):[];if(!existing.length)existing=[edit||{}];
 let o=(role,id)=>`<option value="">-- اختر --</option>`+emps.filter(x=>x.role===role).map(x=>`<option value="${x.id}" ${+id===x.id?'selected':''}>${esc(x.name)} - ${esc(x.rank)}</option>`).join('');
 const personHtml=(p={},i=0)=>`<div class="memoPerson" data-i="${i}"><div class="personHead"><b>الشخص ${i+1}</b>${i?'<button type="button" class="removePerson danger">مسح الشخص</button>':''}</div><div class="personGrid"><label>الاسم<input class="p_name" value="${esc(p.person_name||'')}" required></label><label>مواليد<input class="p_birth" value="${esc(p.birth_year||'')}"></label><label>الجنسية<input class="p_nat" value="${esc(p.nationality||'')}"></label><label>التهمة<input class="p_charge" value="${esc(p.charge||'')}"></label><label>تاريخ الاحتفاظ/الإفراج<input type="date" class="p_date" value="${esc(p.detention_date||'')}"></label><label>الرقم الوطني<input class="p_national" value="${esc(p.national_no||'')}"></label></div></div>`;
 const retainedOpts=retained.map((x,i)=>`<option value="${i}">${esc(x.person_name)} — ${esc(x.memo_date||'')}</option>`).join('');
 const approverOpts=`<option value="">-- بدون --</option>`+signatories.map(x=>`<option value="${esc(x)}" ${edit?.approver_text===x?'selected':''}>${esc(x)}</option>`).join('');
 modal(`<h2>${edit?'تعديل المذكرة':'مذكرة جديدة'}</h2><form id="mf" class="gridForm"><label>النوع<select name="memo_type" id="memoType"><option ${edit?.memo_type==='احتفاظ'?'selected':''}>احتفاظ</option><option ${edit?.memo_type==='افراج'?'selected':''}>افراج</option></select></label><label>تاريخ المذكرة<input type="date" name="memo_date" value="${edit?.memo_date||td()}" required></label><div class="full" id="retainedChooser"><label>اختيار من مذكرات الاحتفاظ السابقة<select id="retainedSelect"><option value="">-- اختر شخصاً --</option>${retainedOpts}</select></label> <button type="button" id="addRetained" class="addPersonBtn">+ إضافة المختار للمذكرة</button></div><div class="full"><div id="peopleBox">${existing.slice(0,(edit?.memo_type==='افراج'||edit?.memo_type==='إفراج')?20:8).map(personHtml).join('')}</div><button type="button" id="addPerson" class="addPersonBtn">+ إضافة شخص يدوياً</button><small class="hint" id="memoLimitHint"></small></div><label>مدخل البيانات<select name="data_entry_id">${o('مدخل البيانات',edit?.data_entry_id)}</select></label><label>ضابط القضائية<select name="judicial_officer_id">${o('ضابط القضائية',edit?.judicial_officer_id)}</select></label><label>المصدق<select name="approver_text">${approverOpts}</select></label><button class="primary full">${edit?'حفظ التعديل':'حفظ المذكرة'}</button></form>`);
 const renumber=()=>document.querySelectorAll('.memoPerson').forEach((x,i)=>{x.dataset.i=i;x.querySelector('.personHead b').textContent='الشخص '+(i+1)});
 const bindRemove=()=>document.querySelectorAll('.removePerson').forEach(b=>b.onclick=()=>{b.closest('.memoPerson').remove();renumber()});bindRemove();
 const maxPeople=()=>($('#memoType').value==='افراج'||$('#memoType').value==='إفراج')?20:8;const updateChooser=()=>{$('#retainedChooser').style.display=($('#memoType').value==='افراج'||$('#memoType').value==='إفراج')?'block':'none';$('#memoLimitHint').textContent='يمكن إضافة حتى '+maxPeople()+' أشخاص في نفس المذكرة.'};$('#memoType').onchange=updateChooser;updateChooser();
 $('#addPerson').onclick=()=>{let box=$('#peopleBox'),n=box.querySelectorAll('.memoPerson').length;if(n>=maxPeople())return alert('الحد الأقصى '+maxPeople()+' أشخاص في المذكرة الواحدة');box.insertAdjacentHTML('beforeend',personHtml({},n));bindRemove()};
 $('#addRetained').onclick=()=>{let v=$('#retainedSelect').value;if(v==='')return alert('اختر شخصاً من مذكرات الاحتفاظ');let x=retained[+v],box=$('#peopleBox'),n=box.querySelectorAll('.memoPerson').length;if(n>=maxPeople())return alert('الحد الأقصى '+maxPeople()+' أشخاص في المذكرة الواحدة');let blank=n===1&&!box.querySelector('.p_name').value.trim();if(blank)box.innerHTML=personHtml(x,0);else box.insertAdjacentHTML('beforeend',personHtml(x,n));bindRemove();renumber()};
 $('#mf').onsubmit=async e=>{e.preventDefault();let d=Object.fromEntries(new FormData(e.target));d.memo_template='نموذج 2';d.people=[...document.querySelectorAll('.memoPerson')].map(x=>({person_name:x.querySelector('.p_name').value.trim(),birth_year:x.querySelector('.p_birth').value.trim(),nationality:x.querySelector('.p_nat').value.trim(),charge:x.querySelector('.p_charge').value.trim(),detention_date:x.querySelector('.p_date').value,national_no:x.querySelector('.p_national').value.trim()})).filter(x=>x.person_name);if(!d.people.length)return alert('أدخل شخصاً واحداً على الأقل');if(d.people.length>maxPeople())return alert('الحد الأقصى '+maxPeople()+' أشخاص في المذكرة الواحدة');if(edit)d.id=edit.id;let z=edit?await api.memoUpdate(d):await api.memoadd(d);if(!z?.ok)return alert('تعذر حفظ المذكرة: '+(z?.error||''));$('#modal').classList.remove('show');loadMemos()}
};$('#newMemo').onclick=()=>memoForm();

async function loadSignatories(){let a=await api.signatories();$('#signatoryTable').innerHTML=`<div class="tableWrap"><table><tr><th>المصدق</th><th></th></tr>${a.map(x=>`<tr><td>${esc(x)}</td><td><button class="smallBtn danger signDel" data-v="${esc(x)}">حذف</button></td></tr>`).join('')}</table></div>`;document.querySelectorAll('.signDel').forEach(b=>b.onclick=async()=>{await api.signatoryDel(b.dataset.v);loadSignatories()})}
$('#signatoryForm').onsubmit=async e=>{e.preventDefault();let z=await api.signatoryAdd(Object.fromEntries(new FormData(e.target)));if(!z?.ok)return alert(z?.error||'تعذر الحفظ');e.target.reset();loadSignatories()};
$('#yearPasswordForm').onsubmit=async e=>{e.preventDefault();let z=await api.setYearPassword(Object.fromEntries(new FormData(e.target)));if(!z?.ok)return alert(z?.error||'تعذر حفظ الرقم السري');e.target.reset();alert('تم حفظ الرقم السري لإضافة السنوات')};
async function refreshYears(){let x=await api.yearInfo();$('#yearSelect').innerHTML=x.years.map(y=>`<option value="${y}" ${+y===+x.currentYear?'selected':''}>${y}</option>`).join('');$('#yearBadge').textContent='أنت الآن تعمل على سنة '+x.currentYear}
$('#yearSelect').onchange=async()=>{let y=+$('#yearSelect').value;if(!confirm('الانتقال إلى سنة '+y+'؟'))return refreshYears();let z=await api.switchYear(y);if(!z?.ok)return alert(z?.error||'تعذر تغيير السنة');await refreshYears();await home();if($('#campaigns').classList.contains('active'))await campaigns();if($('#memos').classList.contains('active'))await loadMemos()};
$('#newYearBtn').onclick=()=>{modal(`<h2>بدء سنة جديدة</h2><form id="newYearForm" class="gridForm"><label>السنة الجديدة<input type="number" name="year" min="2026" max="2100" value="${new Date().getFullYear()+1}" required></label><label>الرقم السري<input type="password" name="password" required></label><div class="notice full">سيتم أخذ نسخة احتياطية تلقائية من سنة العمل الحالية قبل إنشاء السنة الجديدة. لن يتم حذف السنة السابقة.</div><button class="primary full">إنشاء السنة الجديدة</button></form>`);$('#newYearForm').onsubmit=async e=>{e.preventDefault();if(!confirm('متأكد من إنشاء سنة جديدة؟'))return;let z=await api.createYear(Object.fromEntries(new FormData(e.target)));if(!z?.ok)return alert(z?.error||'تعذر إنشاء السنة');$('#modal').classList.remove('show');await refreshYears();await home();alert('تم إنشاء سنة '+z.currentYear+' وأصبحت سنة العمل الحالية')}};
refreshYears();
$('#backup').onclick=async()=>{let r=await api.backup();if(r?.ok)alert('تم حفظ النسخة الاحتياطية كاملة بنجاح\n\n'+r.path);else if(!r?.canceled)alert('تعذر حفظ النسخة الاحتياطية: '+(r?.error||''))};
$('#restoreBackup').onclick=async()=>{let r=await api.restoreBackup();if(!r?.ok&&!r?.canceled)alert('تعذر استعادة النسخة الاحتياطية: '+(r?.error||''))};home();

// V5.10.5 - استعادة تركيز الكتابة إذا فقدته نافذة Electron.
document.addEventListener('mousedown',e=>{
 const el=e.target.closest('input,textarea,select');
 if(el) setTimeout(()=>{try{el.focus({preventScroll:true})}catch{}},0);
},true);
window.addEventListener('focus',()=>{
 setTimeout(()=>{try{
   const el=document.activeElement;
   if(!el || el===document.body || el===document.documentElement){
     const first=document.querySelector('.modal.show input:not([type="hidden"]), .modal.show textarea, .modal.show select, .page.active input, .page.active textarea, .page.active select');
     if(first) first.focus({preventScroll:true});
   }
 }catch{}},50);
});


// V5.11.10 - إدارة النماذج: فتح كل نموذج وتعديله أو استعادته بشكل مستقل.
async function loadTemplates(){
 const box=$('#templatesTable');if(!box)return;
 const r=await api.templatesList();if(!r?.ok){box.innerHTML='<div class="notice">تعذر قراءة النماذج</div>';return}
 box.innerHTML=`<div class="tableWrap"><table><tr><th>النموذج</th><th>الإجراءات</th></tr>${r.items.map(x=>`<tr><td>${esc(x.name)}</td><td><button type="button" class="smallBtn" onclick="openTemplateEdit(${JSON.stringify(x.relative).replace(/"/g,'&quot;')})">فتح وتعديل</button> <button type="button" class="smallBtn danger" onclick="restoreTemplateOne(${JSON.stringify(x.relative).replace(/"/g,'&quot;')})">استعادة الأصلي</button></td></tr>`).join('')}</table></div>`;
}
async function openTemplateEdit(rel){const r=await api.templateOpenEdit(rel);if(!r?.ok)appMessage(r?.error||'تعذر فتح النموذج')}
async function restoreTemplateOne(rel){if(!confirm('استعادة النسخة الأصلية لهذا النموذج فقط؟'))return;const r=await api.templateRestoreOne(rel);appMessage(r?.ok?'تمت استعادة النموذج الأصلي':(r?.error||'تعذرت الاستعادة'));if(r?.ok)loadTemplates()}
const otf=$('#openTemplatesFolder');if(otf)otf.onclick=async()=>{const r=await api.templatesOpenFolder();if(!r?.ok)appMessage(r?.error||'تعذر فتح مجلد النماذج')};
