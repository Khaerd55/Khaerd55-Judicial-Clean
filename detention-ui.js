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
  container.innerHTML=detCenters.map(([center,title])=>{
    const people=detRows.map((r,index)=>({...r,_index:index})).filter(r=>r.center===center);
    const data=people.length?people.map((r,i)=>
      '<tr><td>'+(i+1)+'</td><td>'+esc(r.name)+'</td><td>'+esc(r.nationality||'')+
      '</td><td>قضائي</td><td>القضائية</td><td>'+esc(r.detention_date||'')+
      '</td><td>'+esc(r.center)+'</td><td><span class="badge '+(r.released?'rel':'wait')+'">'+(r.released?'نعم':'لا')+
      '</span></td><td><button class="smallBtn detEdit" data-idx="'+r._index+'">تعديل</button> '+
      '<button class="smallBtn danger detRemove" data-idx="'+r._index+'">حذف</button></td></tr>').join(''):
      '<tr class="detEmpty"><td>1</td><td>*******</td><td>*****</td><td>*****</td><td>******</td><td>*******</td><td>'+esc(center)+'</td><td>********</td><td>—</td></tr>';
    return '<div class="detGroup"><h3>'+esc(title)+' <small>('+people.length+')</small></h3>'+
      '<div class="tableWrap"><table class="detTable"><thead><tr>'+
      '<th>ت</th><th>الاسم</th><th>الجنسية</th><th>نوع القضية</th><th>أمر التوقيف</th>'+
      '<th>تاريخ التوقيف</th><th>موقوف لدى</th><th>مفرج عنه</th><th>إدارة</th>'+
      '</tr></thead><tbody>'+data+'</tbody></table></div></div>';
  }).join('');
  document.getElementById('detCount').textContent='عدد الأشخاص في الكشف: '+detRows.length;
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
    if(match>=0){chooser.value=String(match);released.disabled=true;}
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
    released.disabled=true;
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
      released:p?Number(p.released):Number(released.value)
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
document.getElementById('detAdd').onclick=async()=>{await detRefreshSources();detForm();};
document.getElementById('detSave').onclick=()=>detSave();
document.getElementById('detWord').onclick=async()=>{
  if(!await detSave(false))return;
  const r=await api.detentionWord(detReportId);
  if(!r?.ok)return detAlert(r?.error||'تعذر إنشاء ملف Word');
  detAlert('تم إنشاء الكشف وفتح ملف Word');
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
