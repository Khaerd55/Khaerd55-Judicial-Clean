param(
 [Parameter(Mandatory=$true)][string]$Template,
 [Parameter(Mandatory=$true)][string]$Output,
 [Parameter(Mandatory=$true)][string]$PayloadPath
)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$nsUri='http://schemas.openxmlformats.org/wordprocessingml/2006/main'
$work=Join-Path ([IO.Path]::GetTempPath()) ('judicial-det-'+[guid]::NewGuid().ToString('N'))
try {
  $payload=Get-Content -LiteralPath $PayloadPath -Raw -Encoding UTF8 | ConvertFrom-Json
  New-Item -ItemType Directory -Path $work -Force | Out-Null
  [System.IO.Compression.ZipFile]::ExtractToDirectory($Template,$work)
  $document=Join-Path $work 'word\document.xml'
  if(!(Test-Path -LiteralPath $document)){throw 'ملف Word لا يحتوي على المستند الصحيح'}
  [xml]$xml=Get-Content -LiteralPath $document -Raw -Encoding UTF8
  $ns=New-Object System.Xml.XmlNamespaceManager($xml.NameTable)
  $ns.AddNamespace('w',$nsUri)
  $tbl=$xml.SelectSingleNode('/w:document/w:body/w:tbl',$ns)
  if($null -eq $tbl){throw 'نموذج Word لا يحتوي على جدول المواقيف'}
  $rows=@($tbl.SelectNodes('./w:tr',$ns))
  if($rows.Count -lt 16){throw 'النموذج غير مطابق: مطلوب جدول النموذج الأصلي (16 صفاً على الأقل)'}
  $headers=$rows[0].SelectNodes('./w:tc',$ns)
  if($headers.Count -ne 8){throw 'النموذج غير مطابق: ترتيب الأعمدة الثمانية مختلف'}
  $headerText=($headers | ForEach-Object {$_.InnerText}) -join ' '
  if($headerText -notmatch 'الجنسية' -or $headerText -notmatch 'التوقيف'){throw 'النموذج غير مطابق لكشف المواقيف المعتمد'}
  $templateRows=@($rows[1],$rows[6],$rows[8],$rows[12],$rows[14])
  $emptyRows=@($rows[7],$rows[7],$rows[7],$rows[13],$rows[15])
  $personRow=$rows[9]
  foreach($r in $rows){[void]$tbl.RemoveChild($r)}
  [void]$tbl.AppendChild($rows[0].CloneNode($true))
  $centers=@('المديرية','الغربي','الشرقي','مليح','ذيبان')
  for($group=0;$group -lt $centers.Count;$group++){
    [void]$tbl.AppendChild($templateRows[$group].CloneNode($true))
    $selected=@($payload.rows | Where-Object { $_.center -eq $centers[$group] })
    if($selected.Count -eq 0){
      [void]$tbl.AppendChild($emptyRows[$group].CloneNode($true))
      continue
    }
    for($i=0;$i -lt $selected.Count;$i++){
      $item=$selected[$i]
      $row=$personRow.CloneNode($true)
      $cells=@($row.SelectNodes('./w:tc',$ns))
      $values=@(
        [string]($i+1),
        [string]$item.name,
        [string]$item.nationality,
        'قضائي',
        'القضائية',
        [string]$item.detention_date,
        [string]$item.center,
        [string]$item.released
      )
      for($c=0;$c -lt 8;$c++){
        $txt=@($cells[$c].SelectNodes('.//w:t',$ns))
        if($txt.Count -eq 0){throw 'النموذج الأصلي يحتوي خلية غير قابلة للتعبئة'}
        $txt[0].InnerText=$values[$c]
        for($j=1;$j -lt $txt.Count;$j++){$txt[$j].InnerText=''}
      }
      [void]$tbl.AppendChild($row)
    }
  }
  $dateParts=$payload.report_date.Split('-')
  $displayDate=([int]$dateParts[2]).ToString()+'/'+([int]$dateParts[1]).ToString()+'/'+$dateParts[0]+'م'
  $title='كشف بأعداد واسماء المواقيف داخل نظارة مديرية شرطة مادبا والمراكز الأمنية ليوم '+$payload.day_name+' الموافق '+$displayDate
  $titleFound=$false
  foreach($p in @($xml.SelectNodes('/w:document/w:body/w:p',$ns))){
    $texts=@($p.SelectNodes('.//w:t',$ns))
    if($texts.Count -eq 0){continue}
    $joined=($texts | ForEach-Object {$_.InnerText}) -join ''
    if($joined -match 'كشف بأعداد واسماء المواقيف'){
      $texts[0].InnerText=$title
      for($j=1;$j -lt $texts.Count;$j++){$texts[$j].InnerText=''}
      $titleFound=$true
      break
    }
  }
  if(!$titleFound){throw 'عنوان الكشف غير موجود في النموذج الأصلي'}
  $writerSettings=New-Object System.Xml.XmlWriterSettings
  $writerSettings.Encoding=New-Object System.Text.UTF8Encoding($false)
  $writerSettings.Indent=$false
  $writer=[System.Xml.XmlWriter]::Create($document,$writerSettings)
  try{$xml.Save($writer)}finally{$writer.Close()}
  [System.IO.Compression.ZipFile]::CreateFromDirectory($work,$Output,[System.IO.Compression.CompressionLevel]::Optimal,$false)
  Write-Output $Output
}
catch {Write-Error $_.Exception.Message;exit 1}
finally {if(Test-Path -LiteralPath $work){Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue}}
