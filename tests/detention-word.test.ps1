$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$testDir=Join-Path ([IO.Path]::GetTempPath()) ('judicial-word-ci-'+[guid]::NewGuid().ToString('N'))
$inputDir=Join-Path $testDir 'input'
$source=Join-Path $testDir 'template.docx'
$out=Join-Path $testDir 'output.docx'
$data=Join-Path $testDir 'data.json'
New-Item -Path $inputDir -ItemType Directory -Force | Out-Null
New-Item -Path (Join-Path $inputDir 'word') -ItemType Directory -Force | Out-Null
try {
  $w='http://schemas.openxmlformats.org/wordprocessingml/2006/main'
  $xml='<w:document xmlns:w="'+$w+'"><w:body><w:p><w:r><w:t>Template heading for the detention report</w:t></w:r></w:p><w:tbl>'
  $row='<w:tr>'
  for($c=0;$c -lt 8;$c++){$row+='<w:tc><w:p><w:r><w:t>FIELD</w:t></w:r></w:p></w:tc>'}
  $row+='</w:tr>'
  $xml+=$row
  for($i=0;$i -lt 5;$i++){
    $xml+='<w:tr><w:tc><w:tcPr><w:gridSpan w:val="8"/></w:tcPr><w:p><w:r><w:t>SECTION'+$i+'</w:t></w:r></w:p></w:tc></w:tr>'
    $placeholder=if($i -eq 1){'*******'}else{'SAMPLE'}
    $drow='<w:tr>'
    for($c=0;$c -lt 8;$c++){$drow+='<w:tc><w:p><w:r><w:t>'+$placeholder+'</w:t></w:r></w:p></w:tc>'}
    $drow+='</w:tr>'
    $xml+=$drow
  }
  $xml+='</w:tbl><w:p><w:r><w:t>Signature</w:t></w:r></w:p></w:body></w:document>'
  [IO.File]::WriteAllText((Join-Path $inputDir 'word\document.xml'),$xml,[Text.UTF8Encoding]::new($false))
  $ct='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
  [IO.File]::WriteAllText((Join-Path $inputDir '[Content_Types].xml'),$ct)
  New-Item -Path (Join-Path $inputDir '_rels') -ItemType Directory -Force | Out-Null
  $rels='<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
  [IO.File]::WriteAllText((Join-Path $inputDir '_rels\.rels'),$rels)
  [IO.Compression.ZipFile]::CreateFromDirectory($inputDir,$source)
  $payload=@{
    title='Automated report 13/10/2026'
    case_type='Judicial'
    detention_order='Court'
    centers=@('directorate','west','east','maleeh','dhiban')
    rows=@(
      @{name='TESTPERSON';nationality='JO';center='directorate';detention_date='13/10/2026';released='YES'},
      @{name='PERSON2';nationality='JO';center='east';detention_date='12/10/2026';released='NO'}
    )
  } | ConvertTo-Json -Depth 8
  [IO.File]::WriteAllText($data,$payload,[Text.UTF8Encoding]::new($false))
  $script=Join-Path (Get-Location) 'detention-word.ps1'
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script $source $out $data
  if($LASTEXITCODE -ne 0){throw 'The Word generator returned an error'}
  if(-not(Test-Path -LiteralPath $out)){throw 'No Word output created'}
  $opened=Join-Path $testDir 'output'
  [IO.Compression.ZipFile]::ExtractToDirectory($out,$opened)
  [xml]$result=Get-Content -LiteralPath (Join-Path $opened 'word\document.xml') -Raw -Encoding UTF8
  $ns=New-Object Xml.XmlNamespaceManager($result.NameTable)
  $ns.AddNamespace('w',$w)
  $rows=@($result.SelectNodes('//w:body/w:tbl/w:tr',$ns))
  if($rows.Count -ne 11){throw "Expected 11 rows (1 header, 5 titles, 5 data rows), got $($rows.Count)"}
  $joined=$result.InnerText
  foreach($word in @('TESTPERSON','PERSON2','Judicial','Court','Automated report 13/10/2026','Signature')) {
    if(-not $joined.Contains($word)){throw "Missing data: $word"}
  }
  foreach($word in @('SAMPLE')) {
    if($joined.Contains($word)){throw "Old person data leaked into output"}
  }
  Write-Host 'Detention Word PowerShell generation passed'
} finally {
  Remove-Item -LiteralPath $testDir -Recurse -Force -ErrorAction SilentlyContinue
}
