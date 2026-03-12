param(
	[string]$ProjectZip = "scripts/dataverse-schema/projects_enrich_audit_export.zip",
	[string]$AssetZip = "scripts/dataverse-schema/assets_enrich_audit_export.zip",
	[string]$ActivityZip = "scripts/dataverse-schema/activities_enrich_audit_export.zip"
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Get-DataXml([string]$zipPath) {
	$zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
	try {
		$entry = $zip.Entries | Where-Object { $_.Name -ieq 'data.xml' } | Select-Object -First 1
		if (-not $entry) {
			throw "data.xml missing: $zipPath"
		}
		$reader = New-Object System.IO.StreamReader($entry.Open())
		try {
			return $reader.ReadToEnd()
		}
		finally {
			$reader.Dispose()
		}
	}
	finally {
		$zip.Dispose()
	}
}

function Parse-Records([string]$xmlText) {
	[xml]$doc = $xmlText
	$rows = @()
	foreach ($rec in $doc.entities.entity.records.record) {
		$obj = [ordered]@{ id = [string]$rec.id }
		foreach ($f in $rec.field) {
			$obj[[string]$f.name] = [string]$f.value
		}
		$rows += [pscustomobject]$obj
	}
	return $rows
}

function Blank-Count($rows, [string]$field) {
	return @($rows | Where-Object {
			-not $_.PSObject.Properties.Name.Contains($field) -or [string]::IsNullOrWhiteSpace([string]($_.$field))
		}).Count
}

$projects = Parse-Records (Get-DataXml $ProjectZip)
$assets = Parse-Records (Get-DataXml $AssetZip)
$activities = Parse-Records (Get-DataXml $ActivityZip)

$projectIdSet = @{}
foreach ($row in $projects) {
	$projectIdSet[[string]$row.cr809_projectid.ToLower()] = $true
}

$projectTemplateByProjectId = @{}
foreach ($row in $projects) {
	$projectId = [string]$row.cr809_projectid
	if (-not [string]::IsNullOrWhiteSpace($projectId)) {
		$projectTemplateByProjectId[$projectId.ToLower()] = [string]$row.cr809_projecttemplate
	}
}

$assetIdSet = @{}
foreach ($row in $assets) {
	$assetIdSet[[string]$row.cr809_assetid.ToLower()] = $true
}

$assetsMissingProject = @($assets | Where-Object {
		[string]::IsNullOrWhiteSpace([string]$_.cr809_project)
	}).Count

$assetsBadProject = @($assets | Where-Object {
		-not [string]::IsNullOrWhiteSpace([string]$_.cr809_project) -and -not $projectIdSet.ContainsKey([string]$_.cr809_project.ToLower())
	}).Count

$activitiesMissingProject = @($activities | Where-Object {
		[string]::IsNullOrWhiteSpace([string]$_.cr809_project)
	}).Count

$activitiesMissingAsset = @($activities | Where-Object {
		[string]::IsNullOrWhiteSpace([string]$_.cr809_asset)
	}).Count

$activitiesBadProject = @($activities | Where-Object {
		-not [string]::IsNullOrWhiteSpace([string]$_.cr809_project) -and -not $projectIdSet.ContainsKey([string]$_.cr809_project.ToLower())
	}).Count

$activitiesBadAsset = @($activities | Where-Object {
		-not [string]::IsNullOrWhiteSpace([string]$_.cr809_asset) -and -not $assetIdSet.ContainsKey([string]$_.cr809_asset.ToLower())
	}).Count

$today = (Get-Date).Date

$overdueAssets = @($assets | Where-Object {
		-not [string]::IsNullOrWhiteSpace($_.cr809_enddate) -and
		((Get-Date $_.cr809_enddate).Date -lt $today) -and
		([int]([string]$_.cr809_progress) -lt 100)
	}).Count

$overdueActivities = @($activities | Where-Object {
		(
			(-not [string]::IsNullOrWhiteSpace($_.cr809_duedate) -and ((Get-Date $_.cr809_duedate).Date -lt $today)) -or
			(-not [string]::IsNullOrWhiteSpace($_.cr809_enddate) -and ((Get-Date $_.cr809_enddate).Date -lt $today))
		) -and
		([int]([string]$_.cr809_progress) -lt 100) -and
		([string]$_.cr809_status -ne '804270002')
	}).Count

$projectFields = @(
	'cr809_projectname', 'cr809_projectnumber', 'cr809_description', 'cr809_startdate', 'cr809_enddate',
	'cr809_status', 'cr809_progress', 'cr809_risklevel', 'cr809_projectrequest', 'cr809_projecttemplate'
)

$assetFields = @(
	'cr809_assetname', 'cr809_project', 'cr809_assettype', 'cr809_status', 'cr809_startdate', 'cr809_enddate',
	'cr809_progress', 'cr809_serialnumber', 'cr809_location', 'cr809_description', 'cr809_acquisitiondate'
)

$activityFields = @(
	'cr809_activityname', 'cr809_project', 'cr809_asset', 'cr809_assetid', 'cr809_status', 'cr809_progress',
	'cr809_startdate', 'cr809_enddate', 'cr809_duedate', 'cr809_sequence', 'cr809_duration', 'cr809_assignedto',
	'cr809_comments', 'cr809_deliverables', 'cr809_template'
)

$activitiesWithProjectTemplate = @($activities | Where-Object {
	$projectId = [string]$_.cr809_project
	if ([string]::IsNullOrWhiteSpace($projectId)) { return $false }
	$templateValue = $projectTemplateByProjectId[$projectId.ToLower()]
	return -not [string]::IsNullOrWhiteSpace([string]$templateValue)
})

$activitiesWithBlankProjectTemplate = @($activities | Where-Object {
	$projectId = [string]$_.cr809_project
	if ([string]::IsNullOrWhiteSpace($projectId)) { return $true }
	$templateValue = $projectTemplateByProjectId[$projectId.ToLower()]
	return [string]::IsNullOrWhiteSpace([string]$templateValue)
})

$activitiesTemplateBlankMissingStart = @($activitiesWithBlankProjectTemplate | Where-Object {
	[string]::IsNullOrWhiteSpace([string]$_.cr809_startdate)
})

$activitiesTemplateBlankMissingEndAndDue = @($activitiesWithBlankProjectTemplate | Where-Object {
	[string]::IsNullOrWhiteSpace([string]$_.cr809_enddate) -and [string]::IsNullOrWhiteSpace([string]$_.cr809_duedate)
})

$activitiesTemplateBlankMissingRequiredDates = @($activitiesWithBlankProjectTemplate | Where-Object {
	[string]::IsNullOrWhiteSpace([string]$_.cr809_startdate) -or
	([string]::IsNullOrWhiteSpace([string]$_.cr809_enddate) -and [string]::IsNullOrWhiteSpace([string]$_.cr809_duedate))
})

Write-Output "=== SUMMARY ==="
Write-Output "Projects=$($projects.Count) Assets=$($assets.Count) Activities=$($activities.Count)"
Write-Output "AssetsMissingProject=$assetsMissingProject AssetsBadProject=$assetsBadProject"
Write-Output "ActivitiesMissingProject=$activitiesMissingProject ActivitiesMissingAsset=$activitiesMissingAsset ActivitiesBadProject=$activitiesBadProject ActivitiesBadAsset=$activitiesBadAsset"
Write-Output "OverdueAssets=$overdueAssets OverdueActivities=$overdueActivities"
Write-Output ""

Write-Output "=== BLANK COUNTS: PROJECT ==="
foreach ($field in $projectFields) {
	Write-Output ("{0}={1}" -f $field, (Blank-Count $projects $field))
}
Write-Output ""

Write-Output "=== BLANK COUNTS: ASSET ==="
foreach ($field in $assetFields) {
	Write-Output ("{0}={1}" -f $field, (Blank-Count $assets $field))
}
Write-Output ""

Write-Output "=== BLANK COUNTS: ACTIVITY ==="
foreach ($field in $activityFields) {
	Write-Output ("{0}={1}" -f $field, (Blank-Count $activities $field))
}
Write-Output ""

Write-Output "=== STATUS DISTRIBUTION (ACTIVITY) ==="
$activities | Group-Object cr809_status | Sort-Object Count -Descending | ForEach-Object {
	Write-Output ("status_{0}={1}" -f $_.Name, $_.Count)
}
Write-Output ""

Write-Output "=== ACTIVITY DATE RULE (TEMPLATE-AWARE) ==="
Write-Output "Rule: if parent project cr809_projecttemplate has value => skip date requirement"
Write-Output "Rule: if parent project template is blank (or project missing) => require start date and (end date or due date)"
Write-Output "ProjectTemplatePresent=$($activitiesWithProjectTemplate.Count)"
Write-Output "ProjectTemplateBlank=$($activitiesWithBlankProjectTemplate.Count)"
Write-Output "TemplateBlankMissingStart=$($activitiesTemplateBlankMissingStart.Count)"
Write-Output "TemplateBlankMissingEndAndDue=$($activitiesTemplateBlankMissingEndAndDue.Count)"
Write-Output "TemplateBlankMissingRequiredDates=$($activitiesTemplateBlankMissingRequiredDates.Count)"
Write-Output ""

if ($activitiesTemplateBlankMissingRequiredDates.Count -gt 0) {
	Write-Output "Top offenders (template blank, missing required dates):"
	$activitiesTemplateBlankMissingRequiredDates |
		Select-Object -First 25 id, cr809_activityname, cr809_project, cr809_asset, cr809_startdate, cr809_enddate, cr809_duedate |
		Format-Table -AutoSize
}
