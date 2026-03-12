Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-DataEntry {
  param($Zip)
  $entry = $Zip.Entries | Where-Object { $_.FullName -match '(^|/|\\)data\.xml$' } | Select-Object -First 1
  if (-not $entry) { $entry = $Zip.Entries | Where-Object { $_.Name -ieq 'data.xml' } | Select-Object -First 1 }
  if (-not $entry) { throw 'No data.xml entry found in zip archive.' }
  return $entry
}

function Get-XmlFromZip {
  param([string]$ZipPath, [string]$OutPath)
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
  try {
    $entry = Get-DataEntry -Zip $zip
    $reader = New-Object System.IO.StreamReader($entry.Open())
    try { $xmlText = $reader.ReadToEnd() } finally { $reader.Close() }
  }
  finally { $zip.Dispose() }
  Set-Content -Path $OutPath -Value $xmlText -Encoding UTF8
}

function Save-XmlToZip {
  param([string]$ZipPath, [string]$XmlPath)
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = [System.IO.Compression.ZipFile]::Open($ZipPath, [System.IO.Compression.ZipArchiveMode]::Update)
  try {
    $entry = Get-DataEntry -Zip $zip
    $entryName = $entry.FullName
    $entry.Delete()
    $newEntry = $zip.CreateEntry($entryName)
    $writer = New-Object System.IO.StreamWriter($newEntry.Open())
    try { $writer.Write((Get-Content -Path $XmlPath -Raw)) } finally { $writer.Close() }
  }
  finally { $zip.Dispose() }
}

function Set-Field {
  param([System.Xml.XmlElement]$Record,[string]$Name,[string]$Value,[string]$LookupEntity,[string]$LookupEntityName)
  $field = $null
  foreach ($node in @($Record.SelectNodes('field'))) { if ($node.name -eq $Name) { $field = $node; break } }
  if (-not $field) {
    $field = $Record.OwnerDocument.CreateElement('field')
    [void]$field.SetAttribute('name', $Name)
    [void]$Record.AppendChild($field)
  }
  if ($null -ne $Value -and $Value -ne '') { [void]$field.SetAttribute('value', $Value) }
  if ($LookupEntity) { [void]$field.SetAttribute('lookupentity', $LookupEntity) }
  if ($LookupEntityName) { [void]$field.SetAttribute('lookupentityname', $LookupEntityName) }
}

function Get-FieldValue {
  param([System.Xml.XmlElement]$Record, [string]$Name)
  foreach ($f in $Record.field) { if ($f.name -eq $Name) { return [string]$f.value } }
  return ''
}

function Invoke-PacImport {
  param([string]$DataZip)
  pac data import --data $DataZip
  if ($LASTEXITCODE -ne 0) { throw "pac data import failed for $DataZip" }
}

$schemaDir = Join-Path $PSScriptRoot 'dataverse-schema'
$projectsZip = Join-Path $schemaDir 'projects_enrich_export.zip'
$assetsZip = Join-Path $schemaDir 'assets_enrich_export.zip'
$activitiesZip = Join-Path $schemaDir 'activities_enrich_export.zip'
$projectsXmlPath = Join-Path $schemaDir 'projects_enrich_export_data.xml'
$assetsXmlPath = Join-Path $schemaDir 'assets_enrich_export_data.xml'
$activitiesXmlPath = Join-Path $schemaDir 'activities_enrich_export_data.xml'

pac data export --schemaFile (Join-Path $schemaDir 'project-enrich-schema.xml') --dataFile $projectsZip --overwrite
pac data export --schemaFile (Join-Path $schemaDir 'asset-enrich-schema.xml') --dataFile $assetsZip --overwrite
pac data export --schemaFile (Join-Path $schemaDir 'activity-enrich-schema.xml') --dataFile $activitiesZip --overwrite

Get-XmlFromZip -ZipPath $projectsZip -OutPath $projectsXmlPath
Get-XmlFromZip -ZipPath $assetsZip -OutPath $assetsXmlPath
Get-XmlFromZip -ZipPath $activitiesZip -OutPath $activitiesXmlPath

[xml]$projectsXml = Get-Content $projectsXmlPath -Raw
[xml]$assetsXml = Get-Content $assetsXmlPath -Raw
[xml]$activitiesXml = Get-Content $activitiesXmlPath -Raw

$projectName = 'Material Handling AGV Deployment'
$projectNumber = 'PRJ-AGV-001'
$projectRecord = $projectsXml.entities.entity.records.record | Where-Object { (Get-FieldValue $_ 'cr809_projectname') -eq $projectName } | Select-Object -First 1
if (-not $projectRecord) { throw 'AGV project not found' }
$projectId = Get-FieldValue $projectRecord 'cr809_projectid'

$agvAssets = @($assetsXml.entities.entity.records.record | Where-Object { (Get-FieldValue $_ 'cr809_project') -eq $projectId })
$agvAssetIds = @{}
foreach ($asset in $agvAssets) { $agvAssetIds[(Get-FieldValue $asset 'cr809_assetid')] = $true }

$agvActivities = @($activitiesXml.entities.entity.records.record | Where-Object {
  $aid = Get-FieldValue $_ 'cr809_asset'
  ((Get-FieldValue $_ 'cr809_project') -eq $projectId) -or ($aid -and $agvAssetIds.ContainsKey($aid))
})

# Mark a subset of activities as behind by elapsed duration and keep some blocked.
$targets = @($agvActivities | Where-Object {
  $seq = Get-FieldValue $_ 'cr809_sequence'
  $seq -eq '2' -or $seq -eq '3'
} | Select-Object -First 8)

$offset = 0
foreach ($activity in $targets) {
  $offset++
  $start = ([datetime]'2026-03-04T00:00:00').AddDays($offset - 1)
  $end = $start.AddDays(8)

  Set-Field -Record $activity -Name 'cr809_startdate' -Value ($start.ToString('yyyy-MM-ddTHH:mm:ss'))
  Set-Field -Record $activity -Name 'cr809_enddate' -Value ($end.ToString('yyyy-MM-ddTHH:mm:ss'))
  Set-Field -Record $activity -Name 'cr809_duedate' -Value ($end.ToString('yyyy-MM-ddTHH:mm:ss'))

  if ($offset -le 3) {
    Set-Field -Record $activity -Name 'cr809_status' -Value '804270003'
    Set-Field -Record $activity -Name 'cr809_progress' -Value '28'
    Set-Field -Record $activity -Name 'cr809_comments' -Value ('Blocked: vendor integration test bench unavailable; awaiting slot confirmation for ' + (Get-FieldValue $activity 'cr809_assetid'))
  }
  else {
    Set-Field -Record $activity -Name 'cr809_status' -Value '804270001'
    Set-Field -Record $activity -Name 'cr809_progress' -Value '32'
    Set-Field -Record $activity -Name 'cr809_comments' -Value ('Execution step is behind schedule for ' + (Get-FieldValue $activity 'cr809_assetid') + ' due to late parts receipt.')
  }
}

# Roll up asset and project dates/progress/status from activity data.
$maxAssetEnd = [datetime]'2026-03-10T00:00:00'
$minAssetStart = [datetime]'2026-12-31T00:00:00'
$projectProgressAccumulator = @()

foreach ($asset in $agvAssets) {
  $aid = Get-FieldValue $asset 'cr809_assetid'
  $linked = @($agvActivities | Where-Object { (Get-FieldValue $_ 'cr809_asset') -eq $aid })
  if ($linked.Count -eq 0) { continue }

  $minStart = $null
  $maxEnd = $null
  $sum = 0
  $blocked = $false
  foreach ($activity in $linked) {
    $s = Get-FieldValue $activity 'cr809_startdate'
    $e = Get-FieldValue $activity 'cr809_enddate'
    if ($s) {
      $d = [datetime]$s
      if (-not $minStart -or $d -lt $minStart) { $minStart = $d }
    }
    if ($e) {
      $d = [datetime]$e
      if (-not $maxEnd -or $d -gt $maxEnd) { $maxEnd = $d }
    }
    $sum += [int](Get-FieldValue $activity 'cr809_progress')
    if ((Get-FieldValue $activity 'cr809_status') -eq '804270003') { $blocked = $true }
  }

  if ($minStart -and $maxEnd) {
    Set-Field -Record $asset -Name 'cr809_startdate' -Value ($minStart.ToString('yyyy-MM-ddTHH:mm:ss'))
    Set-Field -Record $asset -Name 'cr809_enddate' -Value ($maxEnd.ToString('yyyy-MM-ddTHH:mm:ss'))
    if ($minStart -lt $minAssetStart) { $minAssetStart = $minStart }
    if ($maxEnd -gt $maxAssetEnd) { $maxAssetEnd = $maxEnd }
  }

  $assetProgress = [math]::Round($sum / $linked.Count)
  Set-Field -Record $asset -Name 'cr809_progress' -Value "$assetProgress"
  Set-Field -Record $asset -Name 'cr809_status' -Value ($(if ($blocked) { '804270003' } else { '804270001' }))
  $projectProgressAccumulator += $assetProgress
}

$projectProgress = [math]::Round(($projectProgressAccumulator | Measure-Object -Average).Average)
Set-Field -Record $projectRecord -Name 'cr809_startdate' -Value ($minAssetStart.ToString('yyyy-MM-ddTHH:mm:ss'))
Set-Field -Record $projectRecord -Name 'cr809_enddate' -Value ($maxAssetEnd.ToString('yyyy-MM-ddTHH:mm:ss'))
Set-Field -Record $projectRecord -Name 'cr809_progress' -Value "$projectProgress"
Set-Field -Record $projectRecord -Name 'cr809_status' -Value '804270003'
Set-Field -Record $projectRecord -Name 'cr809_projectnumber' -Value $projectNumber

$projectsXml.Save($projectsXmlPath)
$assetsXml.Save($assetsXmlPath)
$activitiesXml.Save($activitiesXmlPath)

Save-XmlToZip -ZipPath $projectsZip -XmlPath $projectsXmlPath
Save-XmlToZip -ZipPath $assetsZip -XmlPath $assetsXmlPath
Save-XmlToZip -ZipPath $activitiesZip -XmlPath $activitiesXmlPath

Invoke-PacImport -DataZip $projectsZip
Invoke-PacImport -DataZip $assetsZip
Invoke-PacImport -DataZip $activitiesZip

Write-Host 'AGV behind/blocked tuning complete.'
