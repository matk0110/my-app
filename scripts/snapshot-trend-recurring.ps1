param(
  [int]$IntervalMinutes = 60,
  [int]$MaxRuns = 0,
  [switch]$ExportBeforeCapture
)

$ErrorActionPreference = 'Stop'

if ($IntervalMinutes -lt 1) {
  throw 'IntervalMinutes must be 1 or greater.'
}

$run = 0
while ($true) {
  $run++
  Write-Host "[trend-snapshot] Run #$run started at $(Get-Date -Format s)"

  if ($ExportBeforeCapture) {
    pac data export --schemaFile scripts/dataverse-schema/project-enrich-schema.xml --dataFile scripts/dataverse-schema/projects_enrich_audit_export.zip --overwrite
    pac data export --schemaFile scripts/dataverse-schema/asset-enrich-schema.xml --dataFile scripts/dataverse-schema/assets_enrich_audit_export.zip --overwrite
    pac data export --schemaFile scripts/dataverse-schema/activity-enrich-schema.xml --dataFile scripts/dataverse-schema/activities_enrich_audit_export.zip --overwrite
  }

  node scripts/capture-trend-snapshot.mjs

  if ($MaxRuns -gt 0 -and $run -ge $MaxRuns) {
    Write-Host "[trend-snapshot] Completed $run run(s); exiting."
    break
  }

  Write-Host "[trend-snapshot] Sleeping for $IntervalMinutes minute(s)..."
  Start-Sleep -Seconds ($IntervalMinutes * 60)
}
