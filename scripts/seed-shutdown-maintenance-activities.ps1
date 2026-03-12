param(
  [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-DataEntry {
  param($Zip)
  $entry = $Zip.Entries | Where-Object {
    $_.FullName -match '(^|/|\\)data\.xml$'
  } | Select-Object -First 1
  if (-not $entry) {
    $entry = $Zip.Entries | Where-Object {
      $_.Name -ieq 'data.xml'
    } | Select-Object -First 1
  }
  if (-not $entry) {
    throw 'No data.xml entry found in zip archive.'
  }
  return $entry
}

function Get-XmlFromZip {
  param([string]$ZipPath, [string]$OutPath)
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
  try {
    $entry = Get-DataEntry -Zip $zip
    $reader = New-Object System.IO.StreamReader($entry.Open())
    try {
      $xmlText = $reader.ReadToEnd()
    }
    finally {
      $reader.Close()
    }
  }
  finally {
    $zip.Dispose()
  }
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
    try {
      $writer.Write((Get-Content -Path $XmlPath -Raw))
    }
    finally {
      $writer.Close()
    }
  }
  finally {
    $zip.Dispose()
  }
}

function Get-FieldValue {
  param([System.Xml.XmlElement]$Record, [string]$Name)
  foreach ($f in $Record.field) {
    if ($f.name -eq $Name) { return [string]$f.value }
  }
  return ''
}

function Set-Field {
  param(
    [System.Xml.XmlElement]$Record,
    [string]$Name,
    [string]$Value,
    [string]$LookupEntity,
    [string]$LookupEntityName
  )

  $field = $null
  foreach ($node in @($Record.SelectNodes('field'))) {
    if ($node.name -eq $Name) {
      $field = $node
      break
    }
  }

  if (-not $field) {
    $field = $Record.OwnerDocument.CreateElement('field')
    [void]$field.SetAttribute('name', $Name)
    [void]$Record.AppendChild($field)
  }

  if ($null -ne $Value -and $Value -ne '') {
    [void]$field.SetAttribute('value', $Value)
  }

  if ($LookupEntity) {
    [void]$field.SetAttribute('lookupentity', $LookupEntity)
  }
  if ($LookupEntityName) {
    [void]$field.SetAttribute('lookupentityname', $LookupEntityName)
  }
}

function New-ActivityRecord {
  param([xml]$Doc, [string]$Id)
  $record = $Doc.CreateElement('record')
  [void]$record.SetAttribute('id', $Id)
  [void]$record.SetAttribute('action', 'CreateOrUpdate')
  [void]$Doc.entities.entity.records.AppendChild($record)
  return $record
}

function Invoke-PacImport {
  param([string]$DataZip)
  pac data import --data $DataZip
  if ($LASTEXITCODE -ne 0) {
    throw "pac data import failed for $DataZip with exit code $LASTEXITCODE"
  }
}

function Invoke-PacExport {
  param(
    [string]$SchemaFile,
    [string]$DataFile
  )

  pac data export --schemaFile $SchemaFile --dataFile $DataFile --overwrite
  if ($LASTEXITCODE -ne 0) {
    if (Test-Path $DataFile) {
      Write-Warning "pac data export reported an error for $DataFile. Reusing existing export file."
      return
    }
    throw "pac data export failed for $DataFile and no existing file is available."
  }
}

$schemaDir = Join-Path $PSScriptRoot 'dataverse-schema'
$projectsZip = Join-Path $schemaDir 'projects_enrich_export.zip'
$assetsZip = Join-Path $schemaDir 'assets_enrich_export.zip'
$activitiesZip = Join-Path $schemaDir 'activities_enrich_export.zip'
$projectsXmlPath = Join-Path $schemaDir 'projects_enrich_export_data.xml'
$assetsXmlPath = Join-Path $schemaDir 'assets_enrich_export_data.xml'
$activitiesXmlPath = Join-Path $schemaDir 'activities_enrich_export_data.xml'

$projectSchema = Join-Path $schemaDir 'project-enrich-schema.xml'
$assetSchema = Join-Path $schemaDir 'asset-enrich-schema.xml'
$activitySchema = Join-Path $schemaDir 'activity-enrich-schema.xml'

Invoke-PacExport -SchemaFile $projectSchema -DataFile $projectsZip
Invoke-PacExport -SchemaFile $assetSchema -DataFile $assetsZip
Invoke-PacExport -SchemaFile $activitySchema -DataFile $activitiesZip

Get-XmlFromZip -ZipPath $projectsZip -OutPath $projectsXmlPath
Get-XmlFromZip -ZipPath $assetsZip -OutPath $assetsXmlPath
Get-XmlFromZip -ZipPath $activitiesZip -OutPath $activitiesXmlPath

[xml]$projectsXml = Get-Content $projectsXmlPath -Raw
[xml]$assetsXml = Get-Content $assetsXmlPath -Raw
[xml]$activitiesXml = Get-Content $activitiesXmlPath -Raw

$projectName = 'Shutdown Maintenance Planning System'
$hardProjectStart = [datetime]'2026-03-23T00:00:00'

$projectRecord = $projectsXml.entities.entity.records.record | Where-Object {
  (Get-FieldValue $_ 'cr809_projectname') -eq $projectName
} | Select-Object -First 1

if (-not $projectRecord) {
  throw "Project '$projectName' not found."
}

$projectId = Get-FieldValue $projectRecord 'cr809_projectid'
if (-not $projectId) {
  throw "Project '$projectName' does not have a project id in export."
}

$projectStart = $hardProjectStart
$projectEndText = Get-FieldValue $projectRecord 'cr809_enddate'
$projectEnd = $null
if ($projectEndText) {
  try {
    $projectEnd = [datetime]::Parse($projectEndText)
  }
  catch {
    $projectEnd = $null
  }
}
if (-not $projectEnd -or $projectEnd -lt $projectStart.AddDays(20)) {
  $projectEnd = $projectStart.AddDays(75)
}

$projectAssets = @($assetsXml.entities.entity.records.record | Where-Object {
    (Get-FieldValue $_ 'cr809_project') -eq $projectId
  } | Sort-Object { Get-FieldValue $_ 'cr809_assetname' })

if ($projectAssets.Count -eq 0) {
  throw "No assets found for project '$projectName'."
}

$existingProjectActivities = @($activitiesXml.entities.entity.records.record | Where-Object {
    (Get-FieldValue $_ 'cr809_project') -eq $projectId
  })

$activitiesByAsset = @{}
foreach ($asset in $projectAssets) {
  $assetId = Get-FieldValue $asset 'cr809_assetid'
  $activitiesByAsset[$assetId] = @($existingProjectActivities | Where-Object {
      (Get-FieldValue $_ 'cr809_asset') -eq $assetId
    })
}

$templates = @(
  @{ Name = 'Shutdown Scope Review'; DurationDays = 2; Status = '804270000'; Progress = '0' },
  @{ Name = 'Maintenance Task Planning'; DurationDays = 3; Status = '804270000'; Progress = '0' },
  @{ Name = 'Shutdown Readiness Verification'; DurationDays = 2; Status = '804270000'; Progress = '0' }
)

$createdCount = 0
$assetSummaries = @()

$windowDays = [math]::Max(12, [int]([math]::Floor(($projectEnd - $projectStart).TotalDays) - 7))

$assetIndex = 0
foreach ($asset in $projectAssets) {
  $assetIndex++

  $assetId = Get-FieldValue $asset 'cr809_assetid'
  $assetName = Get-FieldValue $asset 'cr809_assetname'
  $assetSerial = Get-FieldValue $asset 'cr809_serialnumber'

  $linked = @($activitiesByAsset[$assetId])

  $maxSeq = 0
  foreach ($act in $linked) {
    $seqText = Get-FieldValue $act 'cr809_sequence'
    $seq = 0
    if ([int]::TryParse($seqText, [ref]$seq) -and $seq -gt $maxSeq) {
      $maxSeq = $seq
    }
  }

  $targetCount = if ($assetIndex % 2 -eq 0) { 3 } else { 2 }
  $toCreate = [math]::Max(0, $targetCount)

  $stagger = (($assetIndex - 1) * 2) % $windowDays
  $assetStart = $projectStart.AddDays($stagger)

  $lastEnd = $null
  foreach ($act in $linked) {
    $endText = Get-FieldValue $act 'cr809_enddate'
    if (-not $endText) { continue }
    try {
      $endDate = [datetime]::Parse($endText)
      if (-not $lastEnd -or $endDate -gt $lastEnd) {
        $lastEnd = $endDate
      }
    }
    catch {
      continue
    }
  }

  if ($lastEnd -and $lastEnd -ge $assetStart) {
    $assetStart = $lastEnd.AddDays(1)
  }

  $sequenceStart = $maxSeq + 1
  $cursor = $assetStart

  $createdForAsset = 0
  for ($i = 0; $i -lt $toCreate; $i++) {
    $tpl = $templates[$i]
    $duration = [int]$tpl.DurationDays
    $start = $cursor
    $end = $start.AddDays($duration)

    if ($end -gt $projectEnd) {
      $backShiftDays = [int][math]::Ceiling(($end - $projectEnd).TotalDays)
      $start = $start.AddDays(-1 * $backShiftDays)
      if ($start -lt $projectStart) {
        $start = $projectStart
      }
      $end = $start.AddDays($duration)
      if ($end -gt $projectEnd) {
        $end = $projectEnd
      }
    }

    $seq = $sequenceStart + $i
    $newId = [guid]::NewGuid().ToString()

    $rec = New-ActivityRecord -Doc $activitiesXml -Id $newId
    Set-Field -Record $rec -Name 'cr809_activityid' -Value $newId
    Set-Field -Record $rec -Name 'cr809_activityname' -Value $tpl.Name
    Set-Field -Record $rec -Name 'cr809_project' -Value $projectId -LookupEntity 'cr809_project' -LookupEntityName $projectName
    Set-Field -Record $rec -Name 'cr809_asset' -Value $assetId -LookupEntity 'cr809_asset' -LookupEntityName $assetName
    Set-Field -Record $rec -Name 'cr809_assetid' -Value $assetSerial
    Set-Field -Record $rec -Name 'cr809_sequence' -Value "$seq"
    Set-Field -Record $rec -Name 'cr809_duration' -Value "$duration"
    Set-Field -Record $rec -Name 'cr809_startdate' -Value ($start.ToString('yyyy-MM-ddTHH:mm:ss'))
    Set-Field -Record $rec -Name 'cr809_enddate' -Value ($end.ToString('yyyy-MM-ddTHH:mm:ss'))
    Set-Field -Record $rec -Name 'cr809_duedate' -Value ($end.ToString('yyyy-MM-ddTHH:mm:ss'))
    Set-Field -Record $rec -Name 'cr809_status' -Value $tpl.Status
    Set-Field -Record $rec -Name 'cr809_progress' -Value $tpl.Progress
    Set-Field -Record $rec -Name 'cr809_comments' -Value ("$($tpl.Name) for shutdown planning on asset $assetName ($assetSerial).")

    $cursor = $end.AddDays(1)
    $createdForAsset++
    $createdCount++
  }

  $assetSummaries += [pscustomobject]@{
    Asset = $assetName
    Created = $createdForAsset
    FirstStart = if ($createdForAsset -gt 0) { $assetStart.ToString('yyyy-MM-dd') } else { '' }
    LastSequence = $maxSeq + $createdForAsset
  }
}

$activitiesXml.Save($activitiesXmlPath)

if (-not $DryRun) {
  Save-XmlToZip -ZipPath $activitiesZip -XmlPath $activitiesXmlPath
  Invoke-PacImport -DataZip $activitiesZip
}

Write-Host "Project: $projectName"
Write-Host "Assets processed: $($projectAssets.Count)"
Write-Host "Activities created: $createdCount"

$assetSummaries | Sort-Object Asset | Format-Table -AutoSize | Out-String | Write-Host

if ($DryRun) {
  Write-Host 'Dry run complete (no import executed).'
} else {
  Write-Host 'Shutdown Maintenance activities creation complete.'
}
