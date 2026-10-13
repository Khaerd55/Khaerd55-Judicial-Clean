param(
  [Parameter(Mandatory=$true)][string]$Template,
  [Parameter(Mandatory=$true)][string]$Output,
  [Parameter(Mandatory=$true)][string]$PayloadPath
)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$w='http://schemas.openxmlformats.org/wordprocessingml/2006/main'
$tmp=Join-Path ([IO.Path]::GetTempPath()) ('judicial-det-'+[guid]::NewGuid().ToString('N'))

function Set-CellText($xml,$ns,$cell,[string]$value) {
  $texts=@($cell.SelectNodes('.//w:t',$ns))
  if($texts.Count -eq 0) {
    $p=$cell.SelectSingleNode('./w:p',$ns)
    if($null -eq $p) {
      $p=$xml.CreateElement('w','p',$w)
      [void]$cell.AppendChild($p)
    }
    $run=$xml.CreateElement('w','r',$w)
    $newText=$xml.CreateElement('w','t',$w)
    [void]$run.AppendChild($newText)
    [void]$p.AppendChild($run)
    $texts=@($newText)
  }
  $texts[0].InnerText=$value
  for($i=1;$i -lt $texts.Count;$i++){$texts[$i].InnerText=''}
}
function Is-DataRow($row,$ns) {
  return ($row.SelectNodes('./w:tc',$ns).Count -eq 8)
}

try {
  $payload=Get-Content -LiteralPath $PayloadPath -Raw -Encoding UTF8 | ConvertFrom-Json
  if($payload.centers.Count -ne 5){throw 'Invalid center list'}
  New-Item -Path $tmp -ItemType Directory -Force | Out-Null
  [IO.Compression.ZipFile]::ExtractToDirectory($Template,$tmp)
  $document=Join-Path $tmp 'word\document.xml'
  if(-not (Test-Path -LiteralPath $document)){throw 'Invalid DOCX: missing document.xml'}
  [xml]$xml=Get-Content -LiteralPath $document -Raw -Encoding UTF8
  $ns=New-Object System.Xml.XmlNamespaceManager($xml.NameTable)
  $ns.AddNamespace('w',$w)
  $table=$null
  $baseRows=@()
  foreach($candidate in @($xml.SelectNodes('/w:document/w:body/w:tbl',$ns))) {
    $candidateRows=@($candidate.SelectNodes('./w:tr',$ns))
    if($candidateRows.Count -ge 11 -and (Is-DataRow $candidateRows[0] $ns)) {
      $table=$candidate
      $baseRows=$candidateRows
      break
    }
  }
  if($null -eq $table){throw 'Invalid detention template: missing 8-column table'}
  $sections=@()
  $blank=$null
  $prototype=$null
  for($i=1;$i -lt $baseRows.Count;$i++) {
    $row=$baseRows[$i]
    $cells=@($row.SelectNodes('./w:tc',$ns))
    if($cells.Count -eq 1) {
      $sections+=,$row
    } elseif($cells.Count -eq 8) {
      if($null -eq $prototype){$prototype=$row}
      $cellText=[string]$cells[1].InnerText
      if($null -eq $blank -and $cellText.Contains('*')){$blank=$row}
    }
  }
  if($sections.Count -lt 5 -or $null -eq $prototype) {
    throw 'Invalid detention template: five sections required'
  }
  if($null -eq $blank){$blank=$prototype}
  foreach($old in $baseRows){[void]$table.RemoveChild($old)}
  [void]$table.AppendChild($baseRows[0].CloneNode($true))
  for($sectionIndex=0;$sectionIndex -lt 5;$sectionIndex++){
    [void]$table.AppendChild($sections[$sectionIndex].CloneNode($true))
    $centerName=[string]$payload.centers[$sectionIndex]
    $selected=@($payload.rows | Where-Object { $_.center -eq $centerName })
    if($selected.Count -eq 0) {
      $row=$blank.CloneNode($true)
      $cells=@($row.SelectNodes('./w:tc',$ns))
      $placeholder=@('1','*******','*****','*****','******','*******','******','********')
      for($c=0;$c -lt 8;$c++){Set-CellText $xml $ns $cells[$c] $placeholder[$c]}
      [void]$table.AppendChild($row)
    } else {
      for($i=0;$i -lt $selected.Count;$i++){
        $person=$selected[$i]
        $row=$prototype.CloneNode($true)
        $cells=@($row.SelectNodes('./w:tc',$ns))
        $values=@(
          [string]($i+1),[string]$person.name,[string]$person.nationality,
          [string]$payload.case_type,[string]$payload.detention_order,
          [string]$person.detention_date,[string]$person.center,[string]$person.released
        )
        for($c=0;$c -lt 8;$c++){Set-CellText $xml $ns $cells[$c] $values[$c]}
        [void]$table.AppendChild($row)
      }
    }
  }
  $titleFound=$false
  foreach($p in @($xml.SelectNodes('/w:document/w:body/w:p',$ns))) {
    $nodes=@($p.SelectNodes('.//w:t',$ns))
    $text=($nodes | ForEach-Object {$_.InnerText}) -join ''
    if($nodes.Count -eq 0 -or $text.Trim().Length -lt 15){continue}
    $nodes[0].InnerText=[string]$payload.title
    for($i=1;$i -lt $nodes.Count;$i++){$nodes[$i].InnerText=''}
    $titleFound=$true
    break
  }
  if(-not $titleFound){throw 'Invalid template: heading paragraph not found'}
  $settings=New-Object System.Xml.XmlWriterSettings
  $settings.Encoding=New-Object System.Text.UTF8Encoding($false)
  $settings.Indent=$false
  $writer=[System.Xml.XmlWriter]::Create($document,$settings)
  try{$xml.Save($writer)}finally{$writer.Close()}
  [IO.Compression.ZipFile]::CreateFromDirectory($tmp,$Output,[IO.Compression.CompressionLevel]::Optimal,$false)
  Write-Output $Output
} catch {
  Write-Error $_.Exception.Message
  exit 1
} finally {
  if(Test-Path -LiteralPath $tmp) {
    Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
  }
}
