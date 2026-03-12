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

function Invoke-PacImport {
  param([string]$DataZip)
  pac data import --data $DataZip
  if ($LASTEXITCODE -ne 0) {
    throw "pac data import failed for $DataZip with exit code $LASTEXITCODE"
  }
}

$schemaDir = Join-Path $PSScriptRoot 'dataverse-schema'
$projectsZip = Join-Path $schemaDir 'projects_enrich_export.zip'
$activitiesZip = Join-Path $schemaDir 'activities_enrich_export.zip'
$projectsXmlPath = Join-Path $schemaDir 'projects_enrich_export_data.xml'
$activitiesXmlPath = Join-Path $schemaDir 'activities_enrich_export_data.xml'

pac data export --schemaFile (Join-Path $schemaDir 'project-enrich-schema.xml') --dataFile $projectsZip --overwrite
pac data export --schemaFile (Join-Path $schemaDir 'activity-enrich-schema.xml') --dataFile $activitiesZip --overwrite

Get-XmlFromZip -ZipPath $projectsZip -OutPath $projectsXmlPath
Get-XmlFromZip -ZipPath $activitiesZip -OutPath $activitiesXmlPath

[xml]$projectsXml = Get-Content $projectsXmlPath -Raw
[xml]$activitiesXml = Get-Content $activitiesXmlPath -Raw

$projectName = 'Material Handling AGV Deployment'
$projectRecord = $projectsXml.entities.entity.records.record | Where-Object {
  (Get-FieldValue $_ 'cr809_projectname') -eq $projectName
} | Select-Object -First 1

if (-not $projectRecord) {
  throw "Project '$projectName' not found."
}

$projectId = Get-FieldValue $projectRecord 'cr809_projectid'

$agvActivities = @($activitiesXml.entities.entity.records.record | Where-Object {
    (Get-FieldValue $_ 'cr809_project') -eq $projectId
  })

if ($agvActivities.Count -eq 0) {
  throw 'No AGV activities found.'
}

# Mark a handful of AGV activities as vendor activities.
$targets = @($agvActivities | Where-Object {
    $seq = Get-FieldValue $_ 'cr809_sequence'
    ($seq -eq '2' -or $seq -eq '3' -or $seq -eq '4')
  } | Select-Object -First 8)

if ($targets.Count -eq 0) {
  throw 'No suitable AGV activities found for vendor flagging.'
}

$setVendor = 0
foreach ($record in $targets) {
  $assetCode = Get-FieldValue $record 'cr809_assetid'
  Set-Field -Record $record -Name 'cr809_isvendoractivity' -Value '1'
  $existingComment = Get-FieldValue $record 'cr809_comments'
  if (-not $existingComment.ToLower().Contains('vendor')) {
    Set-Field -Record $record -Name 'cr809_comments' -Value ("Vendor-coordinated work package for $assetCode. " + $existingComment)
  }
  $setVendor++
}

$activitiesXml.Save($activitiesXmlPath)
Save-XmlToZip -ZipPath $activitiesZip -XmlPath $activitiesXmlPath
Invoke-PacImport -DataZip $activitiesZip

Write-Host "Marked vendor activities on AGV project: $setVendor"
