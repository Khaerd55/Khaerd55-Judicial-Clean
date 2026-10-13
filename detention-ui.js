'use strict';
// كشف المواقيف: العرض والحفظ مستقلان عن سجلات المذكرات الأصلية.
const detCenters=[
  ['المديرية','نظارة المديرية'],
  ['الغربي','نظارة مركز أمن مادبا الغربي'],
  ['الشرقي','نظارة مركز أمن مادبا الشرقي'],
  ['مليح','نظارة مركز أمن مليح'],
  ['ذيبان','نظارة مركز أمن ذيبان']
];
let detRows=[],detReportId=null,detSources=[],detYear=null;
const detAlert=s=>appMessage(s);
const detOpt=(v,selected)=>'<option value="'+esc(v)+'" '+(v===selected?'selected':'')+'>'+esc(v)+'</option>';
const detCenterOptions=selected=>detCenters.map(([value])=>detOpt(value,selected)).join('');
const detReportDate=()=>document.getElementById('detDate').value||td();
const detIso=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s||''));
function detRender(){
  const container=document.getElementById('detTables');
  // عرض أسماء مختصر للتحرير فقط؛ الكشف الرسمي لا يُعرض داخل البرنامج.
  const groups=detCenters.map(([center,title])=>{
    const people=detRows.map((r,index)=>({...r,_index:index})).filter(r=>r.center===center);
    if(!people.length)return '';
    const items=people.map(r=>
      '<div class="detRosterPerson"><div><b>'+esc(r.name)+'</b>'+
      '<small>الجنسية: '+esc(r.nationality||'غير محددة')+' — مفرج عنه: '+(r.released?'نعم':'لا')+'</small></div>'+
      '<div><button class="smallBtn detEdit" data-idx="'+r._index+'">تعديل</button> '+
      '<button class="smallBtn danger detRemove" data-idx="'+r._index+'">حذف</button></div></div>'
    ).join('');
    return '<details class="detRosterGroup" open><summary>'+esc(title)+' ('+people.length+')</summary>'+items+'</details>';
  }).filter(Boolean);
  container.innerHTML=groups.length?'<h3>الأشخاص الذين سيتم إدراجهم في الكشف عند الطباعة</h3>'+groups.join(''):
    '<div class="notice">ما أضفت أشخاص للكشف بعد. اضغط «إضافة موقوف» لاختيارهم.</div>';
  document.getElementById('detCount').textContent='عدد الأشخاص المختارين: '+detRows.length;
  container.querySelectorAll('.detEdit').forEach(btn=>btn.onclick=()=>detForm(Number(btn.dataset.idx)));
  container.querySelectorAll('.detRemove').forEach(btn=>btn.onclick=()=>{
    const i=Number(btn.dataset.idx);
    detRows.splice(i,1);detRender();
  });
}
async function detRefreshHistory(){
  const r=await api.detentionReports();
  if(!r?.ok)return detAlert(r?.error||'تعذر تحميل الكشوف');
  document.getElementById('detHistory').innerHTML='<option value="">-- اختر كشفاً محفوظاً --</option>'+
    r.items.map(x=>'<option value="'+x.id+'" '+(Number(x.id)===detReportId?'selected':'')+'>'+
    esc(x.report_date)+'</option>').join('');
}
async function detRefreshSources(){
  const r=await api.detentionSources(detReportDate());
  if(!r?.ok){detSources=[];return detAlert(r?.error||'تعذر قراءة مذكرات الاحتفاظ والإفراج');}
  detSources=r.items;
}
async function loadDetention(){
  const yr=document.getElementById('yearSelect').value;
  if(yr!==detYear){detYear=yr;detReportId=null;detRows=[];document.getElementById('detDate').value=td();}
  if(!document.getElementById('detDate').value)document.getElementById('detDate').value=td();
  await detRefreshHistory();
  await detRefreshSources();
  detRender();
  const st=await api.detentionTemplateStatus();
  document.getElementById('detTemplateState').textContent=st.exists?
    'النموذج الأصلي محفوظ على الجهاز':'يلزم استيراد ملف Word الأصلي مرة واحدة قبل إخراج الكشف';
}
function detForm(index=-1){
  const prev=index>=0?detRows[index]:null;
  const options='<option value="">-- إضافة يدوية --</option>'+detSources.map((p,i)=>
    '<option value="'+i+'">'+esc(p.name)+' — '+esc(p.status)+
    ' — '+esc(p.memo_date||'')+(p.has_national_no?'':' (تحقق من تطابق الاسم)')+'</option>').join('');
  modal('<h2>'+(prev?'تعديل موقوف':'إضافة موقوف للكشف')+'</h2>'+
    '<form id="detPersonForm" class="gridForm">'+
    '<label class="full">اختيار من مذكرات الاحتفاظ والإفراج<select id="detSourceSelect">'+options+'</select></label>'+
    '<label class="full">الاسم<input id="detName" required maxlength="200" value="'+esc(prev?.name||'')+'"></label>'+
    '<label>الجنسية<input id="detNat" maxlength="80" value="'+esc(prev?.nationality||'')+'"></label>'+
    '<label>تاريخ التوقيف<input id="detHoldDate" type="date" value="'+(detIso(prev?.detention_date)?esc(prev.detention_date):'')+'"></label>'+
    '<label>موقوف لدى<select id="detCenter">'+detCenterOptions(prev?.center||'المديرية')+'</select></label>'+
    '<label>مفرج عنه<select id="detReleased"><option value="0">لا</option><option value="1">نعم</option></select></label>'+
    '<div class="notice full">نوع القضية: <b>قضائي</b> — أمر التوقيف: <b>القضائية</b> (ثابتان)</div>'+
    '<button class="primary full" type="submit">إضافة / حفظ الشخص</button></form>');
  const released=document.getElementById('detReleased');
  released.value=prev?.released?'1':'0';
  const chooser=document.getElementById('detSourceSelect');
  if(prev?.source_kind==='memo'){
    const match=detSources.findIndex(p=>Number(p.source_person_id)===Number(prev.source_person_id));
    if(match>=0){chooser.value=String(match);released.disabled=false;}
  }
  chooser.onchange=()=>{
    const idx=chooser.value;
    if(idx===''){released.disabled=false;return;}
    const selected=detSources[Number(idx)];
    if(!selected)return;
    document.getElementById('detName').value=selected.name||'';
    document.getElementById('detNat').value=selected.nationality||'';
    document.getElementById('detHoldDate').value=detIso(selected.detention_date)?selected.detention_date:'';
    released.value=selected.released?'1':'0';
    released.disabled=false;
  };
  document.getElementById('detPersonForm').onsubmit=e=>{
    e.preventDefault();
    const idx=chooser.value,p=idx===''?null:detSources[Number(idx)];
    const obj={
      source_kind:p?'memo':(prev?.source_kind==='memo'&&idx===''?'manual':'manual'),
      source_person_id:p?p.source_person_id:null,
      name:document.getElementById('detName').value.trim(),
      nationality:document.getElementById('detNat').value.trim(),
      detention_date:document.getElementById('detHoldDate').value,
      center:document.getElementById('detCenter').value,
      released:Number(released.value)
    };
    if(!obj.name)return detAlert('أدخل اسم الموقوف');
    if(index>=0)detRows[index]=obj;else detRows.push(obj);
    document.getElementById('modal').classList.remove('show');
    detRender();
  };
}
async function detSave(showMessage=true){
  const r=await api.detentionSave({
    id:detReportId,report_date:detReportDate(),rows:detRows
  });
  if(!r?.ok){detAlert(r?.error||'تعذر حفظ الكشف');return false;}
  detReportId=Number(r.id);
  await detRefreshHistory();
  if(showMessage)detAlert('تم حفظ كشف المواقيف');
  return true;
}
function detBulkForm(){
  const memoOption=(p,i)=>'<option value="'+i+'">'+esc(p.name)+' — '+esc(p.status)+' — '+esc(p.memo_date||'')+'</option>';
  const allChoices=detSources.map(memoOption).join('');
  const rowHtml=(n,defaultCenter='المديرية')=>'<section class="detBatchPerson">'+
    '<div class="detBatchTitle"><b>الشخص '+n+'</b><button type="button" class="detBatchRemove smallBtn danger">إزالة</button></div>'+
    '<div class="gridForm">'+
    '<label class="full">بحث عن اسم من المذكرات<input class="detBatchSearch" placeholder="اكتب الاسم للبحث"></label>'+
    '<label class="full">اختر من مذكرات الاحتفاظ والإفراج (اختياري)<select class="detBatchSource"><option value="">-- إدخال يدوي --</option>'+allChoices+'</select></label>'+
    '<label class="full">الاسم<input class="detBatchName" maxlength="200" required></label>'+
    '<label>الجنسية<input class="detBatchNat" maxlength="80"></label>'+
    '<label>تاريخ التوقيف<input class="detBatchDate" type="date"></label>'+
    '<label>موقوف لدى<select class="detBatchCenter">'+detCenterOptions(defaultCenter)+'</select></label>'+
    '<label>مفرج عنه<select class="detBatchReleased"><option value="0">لا</option><option value="1">نعم</option></select></label>'+
    '</div></section>';
  modal('<h2>إضافة عدة مواقيف مرة واحدة</h2>'+
    '<div class="notice">اختر أشخاصاً من المذكرات أو اكتب أسماء يدوياً. حالة الإفراج تنسحب تلقائياً، ويمكنك تعديلها لكل شخص في الكشف فقط.</div>'+
    '<form id="detBulkForm"><div id="detBulkRows">'+rowHtml(1)+'</div>'+
    '<button type="button" id="detBulkAdd" class="addPersonBtn">+ إضافة شخص آخر</button>'+
    '<button type="submit" class="primary detBulkSave">إضافة جميع الأشخاص للكشف</button></form>');
  const root=document.getElementById('detBulkRows');
  const renumber=()=>[...root.querySelectorAll('.detBatchPerson')].forEach((r,i)=>r.querySelector('.detBatchTitle b').textContent='الشخص '+(i+1));
  function bindRow(row){
    const chooser=row.querySelector('.detBatchSource');
    const search=row.querySelector('.detBatchSearch');
    search.oninput=()=>{
      const current=chooser.value;
      const needle=search.value.trim().toLowerCase();
      chooser.innerHTML='<option value="">-- إدخال يدوي --</option>'+
        detSources.map((p,i)=>({p,i})).filter(({p})=>(p.name||'').toLowerCase().includes(needle)).map(({p,i})=>memoOption(p,i)).join('');
      if([...chooser.options].some(o=>o.value===current))chooser.value=current;
    };
    chooser.onchange=()=>{
      const idx=chooser.value;if(idx==='')return;
      const p=detSources[Number(idx)];if(!p)return;
      row.querySelector('.detBatchName').value=p.name||'';
      row.querySelector('.detBatchNat').value=p.nationality||'';
      row.querySelector('.detBatchDate').value=detIso(p.detention_date)?p.detention_date:'';
      row.querySelector('.detBatchReleased').value=p.released?'1':'0';
      // The release field deliberately remains editable.
    };
    row.querySelector('.detBatchRemove').onclick=()=>{
      if(root.querySelectorAll('.detBatchPerson').length===1){
        return detAlert('اترك شخصاً واحداً على الأقل في النموذج');
      }
      row.remove();renumber();
    };
  }
  bindRow(root.querySelector('.detBatchPerson'));
  document.getElementById('detBulkAdd').onclick=()=>{
    const n=root.querySelectorAll('.detBatchPerson').length;
    if(n>=100)return detAlert('الحد الأقصى 100 شخص في عملية واحدة');
    const previous=root.querySelector('.detBatchPerson:last-child');
    const center=previous?.querySelector('.detBatchCenter')?.value||'المديرية';
    root.insertAdjacentHTML('beforeend',rowHtml(n+1,center));
    bindRow(root.querySelector('.detBatchPerson:last-child'));
    renumber();
  };
  document.getElementById('detBulkForm').onsubmit=e=>{
    e.preventDefault();
    const people=[];
    for(const row of root.querySelectorAll('.detBatchPerson')){
      const chooser=row.querySelector('.detBatchSource');
      const p=chooser.value===''?null:detSources[Number(chooser.value)];
      const name=row.querySelector('.detBatchName').value.trim();
      if(!name)return detAlert('أدخل اسم كل شخص، أو احذف السطر الفارغ');
      const person={
        source_kind:p?'memo':'manual',
        source_person_id:p?p.source_person_id:null,
        name,nationality:row.querySelector('.detBatchNat').value.trim(),
        detention_date:row.querySelector('.detBatchDate').value,
        center:row.querySelector('.detBatchCenter').value,
        released:Number(row.querySelector('.detBatchReleased').value)
      };
      if(p&&(detRows.some(x=>x.source_kind==='memo'&&Number(x.source_person_id)===Number(p.source_person_id))||
        people.some(x=>x.source_kind==='memo'&&Number(x.source_person_id)===Number(p.source_person_id)))){
        return detAlert('الشخص '+name+' مُضاف مسبقاً إلى الكشف');
      }
      people.push(person);
    }
    if(detRows.length+people.length>500)return detAlert('الحد الأقصى 500 شخص في الكشف');
    detRows.push(...people);
    document.getElementById('modal').classList.remove('show');
    detRender();
    detAlert('تمت إضافة '+people.length+' شخص إلى الكشف');
  };
}
document.getElementById('detAdd').onclick=async()=>{await detRefreshSources();detBulkForm();};

document.getElementById('detWord').onclick=async()=>{
  if(!await detSave(false))return;
  const r=await api.detentionWord(detReportId);
  if(!r?.ok)return detAlert(r?.error||'تعذر إنشاء ملف Word');
  detAlert('تم تجهيز كشف المواقيف وفتح ملف Word للطباعة');
};
document.getElementById('detImport').onclick=async()=>{
  const r=await api.detentionImportTemplate();
  if(!r?.ok&&!r.canceled)return detAlert(r.error||'تعذر استيراد النموذج');
  if(r?.ok){detAlert('تم حفظ النموذج الأصلي على الجهاز');await loadDetention();}
};
document.getElementById('detNew').onclick=async()=>{
  detReportId=null;detRows=[];document.getElementById('detDate').value=td();
  await loadDetention();
};
document.getElementById('detHistory').onchange=async e=>{
  const id=Number(e.target.value);if(!id)return;
  const r=await api.detentionReport(id);
  if(!r?.ok)return detAlert(r?.error||'تعذر فتح الكشف');
  detReportId=id;detRows=r.report.rows;
  document.getElementById('detDate').value=r.report.report_date;
  await detRefreshSources();detRender();
};
document.getElementById('detDate').onchange=()=>detRefreshSources();
document.getElementById('detDelete').onclick=async()=>{
  if(!detReportId)return detAlert('اختر كشفاً محفوظاً لحذفه');
  if(!confirm('هل أنت متأكد من حذف كشف المواقيف المحفوظ؟'))return;
  const r=await api.detentionDelete(detReportId);
  if(!r?.ok)return detAlert(r?.error||'تعذر حذف الكشف');
  detReportId=null;detRows=[];await loadDetention();
  detAlert('تم حذف الكشف فقط دون تغيير سجلات المذكرات');
};
document.querySelectorAll('[data-page="detention"],[data-go="detention"]').forEach(btn=>
  btn.addEventListener('click',()=>loadDetention())
);
