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

function Set-Field {
  param(
    [System.Xml.XmlElement]$Record,
    [string]$Name,
    [string]$Value,
    [string]$LookupEntity,
    [string]$LookupEntityName
  )

  $field = $null
  foreach ($node in $Record.field) {
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

function Invoke-PacImport {
  param([string]$DataZip)
  pac data import --data $DataZip
  if ($LASTEXITCODE -ne 0) {
    throw "pac data import failed for $DataZip with exit code $LASTEXITCODE"
  }
}

$schemaDir = Join-Path $PSScriptRoot 'dataverse-schema'

$requestsZip = Join-Path $schemaDir 'projectrequests_export.zip'
$projectsZip = Join-Path $schemaDir 'projects_enrich_export.zip'
$assetsZip = Join-Path $schemaDir 'assets_enrich_export.zip'
$activitiesZip = Join-Path $schemaDir 'activities_enrich_export.zip'

$requestsXmlPath = Join-Path $schemaDir 'projectrequests_export_data.xml'
$projectsXmlPath = Join-Path $schemaDir 'projects_enrich_export_data.xml'
$assetsXmlPath = Join-Path $schemaDir 'assets_enrich_export_data.xml'
$activitiesXmlPath = Join-Path $schemaDir 'activities_enrich_export_data.xml'

Get-XmlFromZip -ZipPath $requestsZip -OutPath $requestsXmlPath
Get-XmlFromZip -ZipPath $projectsZip -OutPath $projectsXmlPath
Get-XmlFromZip -ZipPath $assetsZip -OutPath $assetsXmlPath
Get-XmlFromZip -ZipPath $activitiesZip -OutPath $activitiesXmlPath

[xml]$requestsXml = Get-Content $requestsXmlPath -Raw
[xml]$projectsXml = Get-Content $projectsXmlPath -Raw
[xml]$assetsXml = Get-Content $assetsXmlPath -Raw
[xml]$activitiesXml = Get-Content $activitiesXmlPath -Raw

$TEMPLATE_AUTOMATION = '023697ea-b242-43d5-8c7c-447ca3f3a545'
$TEMPLATE_PRODUCTION = '1c73e483-15df-4dba-9bb3-b1bed3bc84ba'
$TEMPLATE_MAINTENANCE = 'ff08a809-b0ea-4d72-aa81-d50c10f83568'

$USER_MATTHEW = 'a40905e8-8f01-f111-8407-00224808862b'
$USER_ALLAN = '2c184834-3109-f111-8406-000d3a353b05'
$USER_MIRIAM = 'ead63052-3109-f111-8406-000d3a353b05'

$reqMap = @{
  '70663d58-da10-f111-8341-000d3a34125a' = @{ Name = 'EV Battery Pack Pilot Line Setup'; RequestId='ReqId-0006'; Template=$TEMPLATE_AUTOMATION; Classification='804270002'; Start='2026-02-26T00:00:00'; End='2026-05-16T00:00:00' }
  '6c663d58-da10-f111-8341-000d3a34125a' = @{ Name = 'Weld Cell Robot Reprogramming'; RequestId='ReqId-0002'; Template=$TEMPLATE_AUTOMATION; Classification='804270000'; Start='2026-02-21T00:00:00'; End='2026-04-22T00:00:00' }
  '76663d58-da10-f111-8341-000d3a34125a' = @{ Name = 'Quality Inspection Vision System Rollout'; RequestId='ReqId-0012'; Template=$TEMPLATE_PRODUCTION; Classification='804270002'; Start='2026-02-15T00:00:00'; End='2026-04-27T00:00:00' }
  '75663d58-da10-f111-8341-000d3a34125a' = @{ Name = 'Material Handling AGV Deployment'; RequestId='ReqId-0011'; Template=$TEMPLATE_AUTOMATION; Classification='804270000'; Start='2026-03-10T00:00:00'; End='2026-04-13T00:00:00' }
}

$projectPlan = @(
  @{ ProjectId='577e8790-0712-f111-8341-000d3a34125a'; RequestId='75663d58-da10-f111-8341-000d3a34125a'; Name='Material Handling AGV Deployment'; Number='PRJ-AGV-001'; Template=$TEMPLATE_AUTOMATION; Risk='2'; Start='2026-03-10T00:00:00'; End='2026-04-13T00:00:00'; Progress='36'; Status='804270001'; Prefixes=@('CM-PROD','CM-DIG') }
  @{ ProjectId='1fa7e380-c911-f111-8341-000d3a353b05'; RequestId='70663d58-da10-f111-8341-000d3a34125a'; Name='EV Battery Pack Pilot Line Setup'; Number='PRJ-EVB-001'; Template=$TEMPLATE_AUTOMATION; Risk='3'; Start='2026-02-26T00:00:00'; End='2026-05-16T00:00:00'; Progress='44'; Status='804270001'; Prefixes=@('CM-MAIN') }
  @{ ProjectId='acf3f3d1-ff11-f111-8341-000d3a353b05'; RequestId='6c663d58-da10-f111-8341-000d3a34125a'; Name='Weld Cell Robot Reprogramming'; Number='PRJ-WELD-001'; Template=$TEMPLATE_AUTOMATION; Risk='2'; Start='2026-02-21T00:00:00'; End='2026-04-22T00:00:00'; Progress='49'; Status='804270001'; Prefixes=@('CM-AUTO') }
  @{ ProjectId='642cd76e-7812-f111-8341-000d3a353b05'; RequestId='76663d58-da10-f111-8341-000d3a34125a'; Name='Quality Inspection Vision System Rollout'; Number='PRJ-VIS-001'; Template=$TEMPLATE_PRODUCTION; Risk='2'; Start='2026-02-15T00:00:00'; End='2026-04-27T00:00:00'; Progress='41'; Status='804270001'; Prefixes=@('CM-QUAL') }
)

$projectByPrefix = @{}
foreach ($p in $projectPlan) {
  foreach ($prefix in $p.Prefixes) {
    $projectByPrefix[$prefix] = $p
  }
}

# Update approved request records with full business fields.
foreach ($record in $requestsXml.entities.entity.records.record) {
  $id = $record.id
  if (-not $reqMap.ContainsKey($id)) { continue }
  $cfg = $reqMap[$id]

  Set-Field -Record $record -Name 'cr809_requestid' -Value $cfg.RequestId
  Set-Field -Record $record -Name 'cr809_requesttitle' -Value $cfg.Name
  Set-Field -Record $record -Name 'cr809_requestor' -Value 'Matthew Karr'
  Set-Field -Record $record -Name 'cr809_requestoremail' -Value 'admin@M365x38311559.onmicrosoft.com'
  Set-Field -Record $record -Name 'cr809_status' -Value '804270001'
  Set-Field -Record $record -Name 'cr809_classification' -Value $cfg.Classification
  Set-Field -Record $record -Name 'cr809_projecttemplate' -Value $cfg.Template -LookupEntity 'cr809_projecttemplate' -LookupEntityName ''
  Set-Field -Record $record -Name 'cr809_assignedpm' -Value $USER_ALLAN -LookupEntity 'systemuser' -LookupEntityName 'Allan Deyoung'
  Set-Field -Record $record -Name 'cr809_approvedby' -Value $USER_MIRIAM -LookupEntity 'systemuser' -LookupEntityName 'Miriam Graham'
  Set-Field -Record $record -Name 'cr809_desiredstartdate' -Value $cfg.Start
  Set-Field -Record $record -Name 'cr809_desiredenddate' -Value $cfg.End
}

# Update projects and map each to one selected approved request.
foreach ($record in $projectsXml.entities.entity.records.record) {
  $id = $record.id
  $cfg = $projectPlan | Where-Object { $_.ProjectId -eq $id } | Select-Object -First 1
  if (-not $cfg) { continue }

  Set-Field -Record $record -Name 'cr809_projectname' -Value $cfg.Name
  Set-Field -Record $record -Name 'cr809_projectnumber' -Value $cfg.Number
  Set-Field -Record $record -Name 'cr809_description' -Value ("Program scoped from approved request: " + $cfg.Name + ". Relationships seeded to project assets and execution activities.")
  Set-Field -Record $record -Name 'cr809_createddate' -Value $cfg.Start
  Set-Field -Record $record -Name 'cr809_startdate' -Value $cfg.Start
  Set-Field -Record $record -Name 'cr809_enddate' -Value $cfg.End
  Set-Field -Record $record -Name 'cr809_status' -Value $cfg.Status
  Set-Field -Record $record -Name 'cr809_progress' -Value $cfg.Progress
  Set-Field -Record $record -Name 'cr809_risklevel' -Value $cfg.Risk
  Set-Field -Record $record -Name 'cr809_projectrequest' -Value $cfg.RequestId -LookupEntity 'cr809_projectrequest' -LookupEntityName ''
  Set-Field -Record $record -Name 'cr809_projecttemplate' -Value $cfg.Template -LookupEntity 'cr809_projecttemplate' -LookupEntityName ''
}

# Build serial->asset mapping and apply project relationships to assets.
$assetBySerial = @{}
foreach ($record in $assetsXml.entities.entity.records.record) {
  $serial = $null
  $name = $null
  foreach ($f in $record.field) {
    if ($f.name -eq 'cr809_serialnumber') { $serial = $f.value }
    if ($f.name -eq 'cr809_assetname') { $name = $f.value }
  }
  if ($serial) { $assetBySerial[$serial] = $record }

  if (-not $serial -or -not $serial.StartsWith('CM-')) { continue }

  $parts = $serial.Split('-')
  if ($parts.Length -lt 2) { continue }
  $prefix = $parts[0] + '-' + $parts[1]
  if (-not $projectByPrefix.ContainsKey($prefix)) { continue }
  $projectCfg = $projectByPrefix[$prefix]

  Set-Field -Record $record -Name 'cr809_project' -Value $projectCfg.ProjectId -LookupEntity 'cr809_project' -LookupEntityName $projectCfg.Name
  Set-Field -Record $record -Name 'cr809_status' -Value '804270000'
  Set-Field -Record $record -Name 'cr809_startdate' -Value $projectCfg.Start
  Set-Field -Record $record -Name 'cr809_enddate' -Value $projectCfg.End
  Set-Field -Record $record -Name 'cr809_acquisitiondate' -Value $projectCfg.Start

  if ($name) {
    Set-Field -Record $record -Name 'cr809_location' -Value ('Plant 1 - ' + $projectCfg.Number)
    Set-Field -Record $record -Name 'cr809_description' -Value ("Asset aligned to " + $projectCfg.Name + ": " + $name)
  }
}

# Apply activity relationships and key business fields using CM-* asset code.
foreach ($record in $activitiesXml.entities.entity.records.record) {
  $assetCode = $null
  $activityName = $null
  $seq = '1'
  foreach ($f in $record.field) {
    if ($f.name -eq 'cr809_assetid') { $assetCode = $f.value }
    if ($f.name -eq 'cr809_activityname') { $activityName = $f.value }
    if ($f.name -eq 'cr809_sequence' -and $f.value) { $seq = $f.value }
  }

  if (-not $assetCode -or -not $assetCode.StartsWith('CM-')) { continue }

  $parts = $assetCode.Split('-')
  if ($parts.Length -lt 2) { continue }
  $prefix = $parts[0] + '-' + $parts[1]
  if (-not $projectByPrefix.ContainsKey($prefix)) { continue }

  $projectCfg = $projectByPrefix[$prefix]
  if (-not $assetBySerial.ContainsKey($assetCode)) { continue }
  $assetRecord = $assetBySerial[$assetCode]
  $assetId = $assetRecord.id
  $assetName = ''
  foreach ($f in $assetRecord.field) {
    if ($f.name -eq 'cr809_assetname') { $assetName = $f.value; break }
  }

  Set-Field -Record $record -Name 'cr809_project' -Value $projectCfg.ProjectId -LookupEntity 'cr809_project' -LookupEntityName $projectCfg.Name
  Set-Field -Record $record -Name 'cr809_asset' -Value $assetId -LookupEntity 'cr809_asset' -LookupEntityName $assetName
  Set-Field -Record $record -Name 'cr809_assignedto' -Value $USER_ALLAN -LookupEntity 'systemuser' -LookupEntityName 'Allan Deyoung'
  Set-Field -Record $record -Name 'cr809_template' -Value ($projectCfg.Number + '-TPL-' + $seq)
  Set-Field -Record $record -Name 'cr809_comments' -Value ("Execution step for " + $projectCfg.Name + " on asset " + $assetCode)
  Set-Field -Record $record -Name 'cr809_deliverables' -Value ("Deliverable package for " + $activityName + " completed in workflow context of " + $projectCfg.Number)
  Set-Field -Record $record -Name 'cr809_duedate' -Value $projectCfg.End

  $seqInt = 1
  [void][int]::TryParse($seq, [ref]$seqInt)
  if ($seqInt -le 1) {
    Set-Field -Record $record -Name 'cr809_status' -Value '804270002'
    Set-Field -Record $record -Name 'cr809_progress' -Value '100'
  }
  elseif ($seqInt -le 3) {
    Set-Field -Record $record -Name 'cr809_status' -Value '804270001'
    Set-Field -Record $record -Name 'cr809_progress' -Value '60'
  }
  else {
    Set-Field -Record $record -Name 'cr809_status' -Value '804270000'
    Set-Field -Record $record -Name 'cr809_progress' -Value '15'
  }
}

$requestsXml.Save($requestsXmlPath)
$projectsXml.Save($projectsXmlPath)
$assetsXml.Save($assetsXmlPath)
$activitiesXml.Save($activitiesXmlPath)

Save-XmlToZip -ZipPath $requestsZip -XmlPath $requestsXmlPath
Save-XmlToZip -ZipPath $projectsZip -XmlPath $projectsXmlPath
Save-XmlToZip -ZipPath $assetsZip -XmlPath $assetsXmlPath
Save-XmlToZip -ZipPath $activitiesZip -XmlPath $activitiesXmlPath

if ($DryRun) {
  Write-Host 'Dry run complete. XML and zip files were updated locally only.'
  exit 0
}

Invoke-PacImport -DataZip $requestsZip
Invoke-PacImport -DataZip $projectsZip
Invoke-PacImport -DataZip $assetsZip
Invoke-PacImport -DataZip $activitiesZip

Write-Host 'Approved demo request data seeding complete.'
