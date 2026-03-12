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

function Set-Field {
  param(
    [System.Xml.XmlElement]$Record,
    [string]$Name,
    [string]$Value,
    [string]$LookupEntity,
    [string]$LookupEntityName
  )

  $field = $null
  $existingFields = @($Record.SelectNodes('field'))
  foreach ($node in $existingFields) {
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

function Get-FieldValue {
  param([System.Xml.XmlElement]$Record, [string]$Name)
  foreach ($f in $Record.field) {
    if ($f.name -eq $Name) { return [string]$f.value }
  }
  return ''
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

pac data export --schemaFile $projectSchema --dataFile $projectsZip --overwrite
pac data export --schemaFile $assetSchema --dataFile $assetsZip --overwrite
pac data export --schemaFile $activitySchema --dataFile $activitiesZip --overwrite

Get-XmlFromZip -ZipPath $projectsZip -OutPath $projectsXmlPath
Get-XmlFromZip -ZipPath $assetsZip -OutPath $assetsXmlPath
Get-XmlFromZip -ZipPath $activitiesZip -OutPath $activitiesXmlPath

[xml]$projectsXml = Get-Content $projectsXmlPath -Raw
[xml]$assetsXml = Get-Content $assetsXmlPath -Raw
[xml]$activitiesXml = Get-Content $activitiesXmlPath -Raw

$USER_ALLAN = '2c184834-3109-f111-8406-000d3a353b05'
$AGV_PROJECT_NAME = 'Material Handling AGV Deployment'
$AGV_PROJECT_NUMBER = 'PRJ-AGV-001'
$AGV_TEMPLATE_PREFIX = 'PRJ-AGV-001-TPL-'

$projectRecord = $projectsXml.entities.entity.records.record | Where-Object {
  (Get-FieldValue $_ 'cr809_projectname') -eq $AGV_PROJECT_NAME
} | Select-Object -First 1

if (-not $projectRecord) {
  throw "Project '$AGV_PROJECT_NAME' not found."
}

$projectId = Get-FieldValue $projectRecord 'cr809_projectid'

$agvAssets = @($assetsXml.entities.entity.records.record | Where-Object {
    (Get-FieldValue $_ 'cr809_project') -eq $projectId
  })

if ($agvAssets.Count -eq 0) {
  throw 'No assets linked to AGV project.'
}

$allActivities = @($activitiesXml.entities.entity.records.record)
$templateActivities = @($allActivities | Where-Object {
    $tpl = Get-FieldValue $_ 'cr809_template'
    (Get-FieldValue $_ 'cr809_project') -eq $projectId -and $tpl.StartsWith($AGV_TEMPLATE_PREFIX)
  })

if ($templateActivities.Count -eq 0) {
  throw 'No AGV template-pattern activities found to copy from.'
}

# Build a 5-step canonical template from existing AGV activities.
$templateBySeq = @{}
foreach ($activity in $templateActivities) {
  $seqText = Get-FieldValue $activity 'cr809_sequence'
  if (-not $seqText) { continue }
  $seq = 0
  [void][int]::TryParse($seqText, [ref]$seq)
  if ($seq -lt 1 -or $seq -gt 5) { continue }
  if (-not $templateBySeq.ContainsKey($seq)) {
    $templateBySeq[$seq] = $activity
  }
}

for ($i = 1; $i -le 5; $i++) {
  if (-not $templateBySeq.ContainsKey($i)) {
    throw "Missing AGV template step for sequence $i."
  }
}

$createdActivities = 0
$updatedActivities = 0
$blockedActivities = 0

$globalStart = [datetime]'2026-03-10T00:00:00'
$maxAssetEnd = $globalStart

$assetIndex = 0
foreach ($asset in $agvAssets) {
  $assetIndex++

  $assetId = Get-FieldValue $asset 'cr809_assetid'
  $assetName = Get-FieldValue $asset 'cr809_assetname'
  $assetSerial = Get-FieldValue $asset 'cr809_serialnumber'

  $assetActivities = @($activitiesXml.entities.entity.records.record | Where-Object {
      (Get-FieldValue $_ 'cr809_asset') -eq $assetId -and (Get-FieldValue $_ 'cr809_project') -eq $projectId
    })

  $activityBySeq = @{}
  foreach ($activity in $assetActivities) {
    $seqText = Get-FieldValue $activity 'cr809_sequence'
    if (-not $seqText) { continue }
    $seq = 0
    [void][int]::TryParse($seqText, [ref]$seq)
    if ($seq -ge 1 -and $seq -le 5 -and -not $activityBySeq.ContainsKey($seq)) {
      $activityBySeq[$seq] = $activity
    }
  }

  # Ensure every asset has all 5 template-copy activities.
  for ($seq = 1; $seq -le 5; $seq++) {
    if ($activityBySeq.ContainsKey($seq)) { continue }

    $template = $templateBySeq[$seq]
    $newId = ([guid]::NewGuid().ToString())
    $newRec = New-ActivityRecord -Doc $activitiesXml -Id $newId

    $name = Get-FieldValue $template 'cr809_activityname'
    if (-not $name) {
      switch ($seq) {
        1 { $name = 'Specification' }
        2 { $name = 'Design' }
        3 { $name = 'Parts Procurement' }
        4 { $name = 'Build/Assembly' }
        5 { $name = 'Install' }
      }
    }

    Set-Field -Record $newRec -Name 'cr809_activityid' -Value $newId
    Set-Field -Record $newRec -Name 'cr809_activityname' -Value $name
    Set-Field -Record $newRec -Name 'cr809_project' -Value $projectId -LookupEntity 'cr809_project' -LookupEntityName $AGV_PROJECT_NAME
    Set-Field -Record $newRec -Name 'cr809_asset' -Value $assetId -LookupEntity 'cr809_asset' -LookupEntityName $assetName
    Set-Field -Record $newRec -Name 'cr809_assetid' -Value $assetSerial
    Set-Field -Record $newRec -Name 'cr809_template' -Value ($AGV_TEMPLATE_PREFIX + $seq)
    Set-Field -Record $newRec -Name 'cr809_sequence' -Value "$seq"
    Set-Field -Record $newRec -Name 'cr809_duration' -Value (Get-FieldValue $template 'cr809_duration')
    Set-Field -Record $newRec -Name 'cr809_assignedto' -Value $USER_ALLAN -LookupEntity 'systemuser' -LookupEntityName 'Allan Deyoung'

    $activityBySeq[$seq] = $newRec
    $createdActivities++
  }

  # Activity schedule drives asset and project dates.
  $baseStart = $globalStart.AddDays($assetIndex - 1)
  $durations = @(2, 3, 4, 3, 2)
  $cursor = $baseStart
  $assetStatus = '804270001'
  $progressSum = 0

  for ($seq = 1; $seq -le 5; $seq++) {
    $activity = $activityBySeq[$seq]
    $durationDays = $durations[$seq - 1]
    $start = $cursor
    $end = $start.AddDays($durationDays)

    $status = '804270000'
    $progress = '0'
    $comment = "Execution step for $AGV_PROJECT_NAME on asset $assetSerial"

    if ($seq -eq 1) {
      $status = '804270002'
      $progress = '100'
    }
    elseif ($seq -eq 2) {
      $status = '804270001'
      $progress = '72'
    }
    elseif ($seq -eq 3) {
      if ($assetIndex % 6 -eq 0) {
        $status = '804270003'
        $progress = '38'
        $comment = "Blocked: AGV controller firmware handoff pending from vendor for asset $assetSerial."
        $blockedActivities++
        $assetStatus = '804270003'
      }
      else {
        $status = '804270001'
        $progress = '48'
      }
    }
    elseif ($seq -eq 4) {
      $status = '804270000'
      $progress = '12'
    }
    else {
      $status = '804270000'
      $progress = '0'
    }

    Set-Field -Record $activity -Name 'cr809_project' -Value $projectId -LookupEntity 'cr809_project' -LookupEntityName $AGV_PROJECT_NAME
    Set-Field -Record $activity -Name 'cr809_asset' -Value $assetId -LookupEntity 'cr809_asset' -LookupEntityName $assetName
    Set-Field -Record $activity -Name 'cr809_assetid' -Value $assetSerial
    Set-Field -Record $activity -Name 'cr809_template' -Value ($AGV_TEMPLATE_PREFIX + $seq)
    Set-Field -Record $activity -Name 'cr809_sequence' -Value "$seq"
    Set-Field -Record $activity -Name 'cr809_duration' -Value "$durationDays"
    Set-Field -Record $activity -Name 'cr809_startdate' -Value ($start.ToString('yyyy-MM-ddTHH:mm:ss'))
    Set-Field -Record $activity -Name 'cr809_enddate' -Value ($end.ToString('yyyy-MM-ddTHH:mm:ss'))
    Set-Field -Record $activity -Name 'cr809_duedate' -Value ($end.ToString('yyyy-MM-ddTHH:mm:ss'))
    Set-Field -Record $activity -Name 'cr809_status' -Value $status
    Set-Field -Record $activity -Name 'cr809_progress' -Value $progress
    Set-Field -Record $activity -Name 'cr809_assignedto' -Value $USER_ALLAN -LookupEntity 'systemuser' -LookupEntityName 'Allan Deyoung'
    Set-Field -Record $activity -Name 'cr809_comments' -Value $comment
    Set-Field -Record $activity -Name 'cr809_deliverables' -Value ("Deliverable package for sequence $seq in workflow context of $AGV_PROJECT_NUMBER")

    $progressSum += [int]$progress
    $updatedActivities++

    $cursor = $end.AddDays(1)
  }

  $assetStart = $baseStart
  $assetEnd = $cursor.AddDays(-1)
  if ($assetEnd -gt $maxAssetEnd) {
    $maxAssetEnd = $assetEnd
  }

  $assetProgress = [math]::Round($progressSum / 5)

  Set-Field -Record $asset -Name 'cr809_project' -Value $projectId -LookupEntity 'cr809_project' -LookupEntityName $AGV_PROJECT_NAME
  Set-Field -Record $asset -Name 'cr809_status' -Value $assetStatus
  Set-Field -Record $asset -Name 'cr809_startdate' -Value ($assetStart.ToString('yyyy-MM-ddTHH:mm:ss'))
  Set-Field -Record $asset -Name 'cr809_enddate' -Value ($assetEnd.ToString('yyyy-MM-ddTHH:mm:ss'))
  Set-Field -Record $asset -Name 'cr809_progress' -Value "$assetProgress"
  if (-not (Get-FieldValue $asset 'cr809_location')) {
    Set-Field -Record $asset -Name 'cr809_location' -Value ("Plant 1 - $AGV_PROJECT_NUMBER")
  }
  if (-not (Get-FieldValue $asset 'cr809_description')) {
    Set-Field -Record $asset -Name 'cr809_description' -Value ("Asset aligned to ${AGV_PROJECT_NAME}: $assetName")
  }
}

# Project dates/progress are driven by asset rollup, which is driven by activity schedule.
$projectStart = $globalStart
$projectEnd = $maxAssetEnd

$assetProgressValues = @()
foreach ($asset in $agvAssets) {
  $p = Get-FieldValue $asset 'cr809_progress'
  if ($p) { $assetProgressValues += [int]$p }
}
$projectProgress = 0
if ($assetProgressValues.Count -gt 0) {
  $projectProgress = [math]::Round(($assetProgressValues | Measure-Object -Average).Average)
}

$projectStatus = '804270001'
if ($blockedActivities -gt 0) {
  $projectStatus = '804270003'
}

Set-Field -Record $projectRecord -Name 'cr809_startdate' -Value ($projectStart.ToString('yyyy-MM-ddTHH:mm:ss'))
Set-Field -Record $projectRecord -Name 'cr809_enddate' -Value ($projectEnd.ToString('yyyy-MM-ddTHH:mm:ss'))
Set-Field -Record $projectRecord -Name 'cr809_progress' -Value "$projectProgress"
Set-Field -Record $projectRecord -Name 'cr809_status' -Value $projectStatus
Set-Field -Record $projectRecord -Name 'cr809_projectnumber' -Value $AGV_PROJECT_NUMBER
Set-Field -Record $projectRecord -Name 'cr809_description' -Value 'AGV deployment demo timeline: asset schedules are rolled up from activity dates, with in-progress and blocked work clearly represented.'

$projectsXml.Save($projectsXmlPath)
$assetsXml.Save($assetsXmlPath)
$activitiesXml.Save($activitiesXmlPath)

Save-XmlToZip -ZipPath $projectsZip -XmlPath $projectsXmlPath
Save-XmlToZip -ZipPath $assetsZip -XmlPath $assetsXmlPath
Save-XmlToZip -ZipPath $activitiesZip -XmlPath $activitiesXmlPath

Write-Host "AGV Focused Update Summary:"
Write-Host "  Assets in AGV project: $($agvAssets.Count)"
Write-Host "  Activities created: $createdActivities"
Write-Host "  Activities updated: $updatedActivities"
Write-Host "  Blocked activities set: $blockedActivities"
Write-Host "  Project end date set to: $($projectEnd.ToString('yyyy-MM-dd'))"

if ($DryRun) {
  Write-Host 'Dry run complete. XML and zip files were updated locally only.'
  exit 0
}

Invoke-PacImport -DataZip $projectsZip
Invoke-PacImport -DataZip $assetsZip
Invoke-PacImport -DataZip $activitiesZip

Write-Host 'AGV-focused data seeding complete.'
