param()

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

pac data export --schemaFile (Join-Path $schemaDir 'project-enrich-schema.xml') --dataFile $projectsZip --overwrite
pac data export --schemaFile (Join-Path $schemaDir 'asset-enrich-schema.xml') --dataFile $assetsZip --overwrite
pac data export --schemaFile (Join-Path $schemaDir 'activity-enrich-schema.xml') --dataFile $activitiesZip --overwrite

Get-XmlFromZip -ZipPath $projectsZip -OutPath $projectsXmlPath
Get-XmlFromZip -ZipPath $assetsZip -OutPath $assetsXmlPath
Get-XmlFromZip -ZipPath $activitiesZip -OutPath $activitiesXmlPath

[xml]$projectsXml = Get-Content $projectsXmlPath -Raw
[xml]$assetsXml = Get-Content $assetsXmlPath -Raw
[xml]$activitiesXml = Get-Content $activitiesXmlPath -Raw

$AGV_PROJECT_NAME = 'Material Handling AGV Deployment'
$AGV_PROJECT_NUMBER = 'PRJ-AGV-001'
$projectRecord = $projectsXml.entities.entity.records.record | Where-Object {
  (Get-FieldValue $_ 'cr809_projectname') -eq $AGV_PROJECT_NAME
} | Select-Object -First 1
if (-not $projectRecord) { throw 'AGV project not found.' }
$projectId = Get-FieldValue $projectRecord 'cr809_projectid'

$agvAssets = @($assetsXml.entities.entity.records.record | Where-Object {
    (Get-FieldValue $_ 'cr809_project') -eq $projectId
  })

$agvActivities = @($activitiesXml.entities.entity.records.record | Where-Object {
    (Get-FieldValue $_ 'cr809_project') -eq $projectId
  })

$activitiesByAsset = @{}
foreach ($asset in $agvAssets) {
  $aid = Get-FieldValue $asset 'cr809_assetid'
  $activitiesByAsset[$aid] = @()
}
foreach ($activity in $agvActivities) {
  $aid = Get-FieldValue $activity 'cr809_asset'
  if ($aid -and $activitiesByAsset.ContainsKey($aid)) {
    $activitiesByAsset[$aid] += $activity
  }
}

$missingAssets = @($agvAssets | Where-Object {
    $aid = Get-FieldValue $_ 'cr809_assetid'
    $activitiesByAsset[$aid].Count -eq 0
  })

$reassigned = 0
$baseStart = [datetime]'2026-03-20T00:00:00'
$targetIndex = 0

foreach ($targetAsset in $missingAssets) {
  $targetIndex++
  $targetAssetId = Get-FieldValue $targetAsset 'cr809_assetid'
  $targetAssetName = Get-FieldValue $targetAsset 'cr809_assetname'
  $targetSerial = Get-FieldValue $targetAsset 'cr809_serialnumber'

  $donorEntry = $null
  foreach ($key in $activitiesByAsset.Keys) {
    if ($activitiesByAsset[$key].Count -gt 3) {
      $candidate = $activitiesByAsset[$key] | Where-Object { (Get-FieldValue $_ 'cr809_status') -ne '804270003' } | Select-Object -Last 1
      if (-not $candidate) {
        $candidate = $activitiesByAsset[$key] | Select-Object -Last 1
      }
      if ($candidate) {
        $donorEntry = @{ AssetId = $key; Activity = $candidate }
        break
      }
    }
  }

  if (-not $donorEntry) {
    continue
  }

  $activity = $donorEntry.Activity

  $start = $baseStart.AddDays($targetIndex)
  $end = $start.AddDays(2)

  Set-Field -Record $activity -Name 'cr809_asset' -Value $targetAssetId -LookupEntity 'cr809_asset' -LookupEntityName $targetAssetName
  Set-Field -Record $activity -Name 'cr809_assetid' -Value $targetSerial
  Set-Field -Record $activity -Name 'cr809_project' -Value $projectId -LookupEntity 'cr809_project' -LookupEntityName $AGV_PROJECT_NAME
  Set-Field -Record $activity -Name 'cr809_template' -Value 'PRJ-AGV-001-TPL-1'
  Set-Field -Record $activity -Name 'cr809_sequence' -Value '1'
  Set-Field -Record $activity -Name 'cr809_duration' -Value '2'
  Set-Field -Record $activity -Name 'cr809_startdate' -Value ($start.ToString('yyyy-MM-ddTHH:mm:ss'))
  Set-Field -Record $activity -Name 'cr809_enddate' -Value ($end.ToString('yyyy-MM-ddTHH:mm:ss'))
  Set-Field -Record $activity -Name 'cr809_duedate' -Value ($end.ToString('yyyy-MM-ddTHH:mm:ss'))
  Set-Field -Record $activity -Name 'cr809_status' -Value '804270001'
  Set-Field -Record $activity -Name 'cr809_progress' -Value '42'
  Set-Field -Record $activity -Name 'cr809_comments' -Value ("Execution step for $AGV_PROJECT_NAME on asset $targetSerial")

  $activitiesByAsset[$donorEntry.AssetId] = @($activitiesByAsset[$donorEntry.AssetId] | Where-Object { $_.id -ne $activity.id })
  $activitiesByAsset[$targetAssetId] += $activity
  $reassigned++
}

# Roll up asset dates/progress from linked activities.
$maxAssetEnd = [datetime]'2026-03-10T00:00:00'
foreach ($asset in $agvAssets) {
  $aid = Get-FieldValue $asset 'cr809_assetid'
  $linked = @($activitiesXml.entities.entity.records.record | Where-Object {
      (Get-FieldValue $_ 'cr809_project') -eq $projectId -and (Get-FieldValue $_ 'cr809_asset') -eq $aid
    })
  if ($linked.Count -eq 0) { continue }

  $minStart = $null
  $maxEnd = $null
  $sum = 0
  $blocked = $false
  foreach ($activity in $linked) {
    $startText = Get-FieldValue $activity 'cr809_startdate'
    $endText = Get-FieldValue $activity 'cr809_enddate'
    $progText = Get-FieldValue $activity 'cr809_progress'
    $statusText = Get-FieldValue $activity 'cr809_status'

    if ($startText) {
      $d = [datetime]$startText
      if (-not $minStart -or $d -lt $minStart) { $minStart = $d }
    }
    if ($endText) {
      $d = [datetime]$endText
      if (-not $maxEnd -or $d -gt $maxEnd) { $maxEnd = $d }
    }
    if ($progText) { $sum += [int]$progText }
    if ($statusText -eq '804270003') { $blocked = $true }
  }

  if ($minStart -and $maxEnd) {
    Set-Field -Record $asset -Name 'cr809_startdate' -Value ($minStart.ToString('yyyy-MM-ddTHH:mm:ss'))
    Set-Field -Record $asset -Name 'cr809_enddate' -Value ($maxEnd.ToString('yyyy-MM-ddTHH:mm:ss'))
    if ($maxEnd -gt $maxAssetEnd) { $maxAssetEnd = $maxEnd }
  }

  $avg = [math]::Round($sum / $linked.Count)
  Set-Field -Record $asset -Name 'cr809_progress' -Value "$avg"
  Set-Field -Record $asset -Name 'cr809_status' -Value ($(if ($blocked) { '804270003' } else { '804270001' }))
}

Set-Field -Record $projectRecord -Name 'cr809_enddate' -Value ($maxAssetEnd.ToString('yyyy-MM-ddTHH:mm:ss'))
Set-Field -Record $projectRecord -Name 'cr809_status' -Value '804270003'
Set-Field -Record $projectRecord -Name 'cr809_projectnumber' -Value $AGV_PROJECT_NUMBER

$projectsXml.Save($projectsXmlPath)
$assetsXml.Save($assetsXmlPath)
$activitiesXml.Save($activitiesXmlPath)

Save-XmlToZip -ZipPath $projectsZip -XmlPath $projectsXmlPath
Save-XmlToZip -ZipPath $assetsZip -XmlPath $assetsXmlPath
Save-XmlToZip -ZipPath $activitiesZip -XmlPath $activitiesXmlPath

Write-Host "AGV coverage repair reassigned activities: $reassigned"

Invoke-PacImport -DataZip $projectsZip
Invoke-PacImport -DataZip $assetsZip
Invoke-PacImport -DataZip $activitiesZip

Write-Host 'AGV activity coverage repair complete.'
