Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-PacExport {
  param(
    [string]$SchemaFile,
    [string]$DataFile
  )

  pac data export --schemaFile $SchemaFile --dataFile $DataFile --overwrite
  if ($LASTEXITCODE -ne 0) {
    if (Test-Path $DataFile) {
      Write-Warning "pac data export reported an error for $DataFile. Reusing existing file."
      return
    }
    throw "pac data export failed for $DataFile and no existing file is available."
  }
}

$schemaDir = Join-Path $PSScriptRoot 'dataverse-schema'
$projectsZip = Join-Path $schemaDir 'projects_enrich_audit_export.zip'
$assetsZip = Join-Path $schemaDir 'assets_enrich_audit_export.zip'
$activitiesZip = Join-Path $schemaDir 'activities_export.zip'

Invoke-PacExport -SchemaFile (Join-Path $schemaDir 'project-enrich-schema.xml') -DataFile $projectsZip
Invoke-PacExport -SchemaFile (Join-Path $schemaDir 'asset-enrich-schema.xml') -DataFile $assetsZip
Invoke-PacExport -SchemaFile (Join-Path $schemaDir 'activity-schema.xml') -DataFile $activitiesZip

Add-Type -AssemblyName System.IO.Compression.FileSystem

function GetDoc($zipPath) {
  $z = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
  try {
    $e = $z.Entries | Where-Object { $_.Name -ieq 'data.xml' } | Select-Object -First 1
    if (-not $e) { throw "data.xml not found in $zipPath" }
    $r = New-Object IO.StreamReader($e.Open())
    try {
      return [xml]$r.ReadToEnd()
    }
    finally {
      $r.Dispose()
    }
  }
  finally {
    $z.Dispose()
  }
}

function FV($rec, $name) {
  $field = $rec.field | Where-Object { $_.name -eq $name } | Select-Object -First 1
  if (-not $field) { return '' }
  return [string]$field.GetAttribute('value')
}

$p = GetDoc $projectsZip
$a = GetDoc $assetsZip
$t = GetDoc $activitiesZip

$projectName = 'Shutdown Maintenance Planning System'
$projRec = @($p.entities.entity.records.record | Where-Object { (FV $_ 'cr809_projectname') -eq $projectName })[0]
if (-not $projRec) { throw "Project '$projectName' not found." }
$projId = FV $projRec 'cr809_projectid'

$assets = @($a.entities.entity.records.record | Where-Object { (FV $_ 'cr809_project') -eq $projId })
$serialToName = @{}
foreach ($r in $assets) {
  $serial = FV $r 'cr809_serialnumber'
  if ($serial) {
    $serialToName[$serial] = FV $r 'cr809_assetname'
  }
}

$acts = @($t.entities.entity.records.record | Where-Object {
    $sid = FV $_ 'cr809_assetid'
    $sid -and $serialToName.ContainsKey($sid)
  })

$byAsset = @{}
foreach ($serial in $serialToName.Keys) {
  $byAsset[$serial] = @($acts | Where-Object { (FV $_ 'cr809_assetid') -eq $serial })
}

$firstStarts = @()
foreach ($serial in $byAsset.Keys) {
  $rows = @($byAsset[$serial] | Sort-Object { [datetime](FV $_ 'cr809_startdate') })
  if ($rows.Count -gt 0) {
    $firstStarts += (Get-Date (FV $rows[0] 'cr809_startdate') -Format yyyy-MM-dd)
  }
}

"PROJECT_START=$(FV $projRec 'cr809_startdate')"
"PROJECT_END=$(FV $projRec 'cr809_enddate')"
"ASSET_COUNT=$($assets.Count)"
"ACTIVITY_COUNT_FOR_PROJECT_ASSET_SERIALS=$($acts.Count)"
"DISTINCT_ASSET_START_DATES=$(@($firstStarts | Select-Object -Unique).Count)"

foreach ($serial in ($byAsset.Keys | Sort-Object)) {
  $rows = @($byAsset[$serial])
  $seqs = @($rows | ForEach-Object { [int](FV $_ 'cr809_sequence') } | Sort-Object)
  $name = $serialToName[$serial]
  $firstStart = if ($rows.Count -gt 0) {
    Get-Date ((@($rows | Sort-Object { [datetime](FV $_ 'cr809_startdate') }))[0] | ForEach-Object { FV $_ 'cr809_startdate' }) -Format yyyy-MM-dd
  }
  else {
    'NONE'
  }
  "ASSET=$name | ACTIVITIES=$($rows.Count) | SEQS=$($seqs -join ',') | FIRST_START=$firstStart"
}
