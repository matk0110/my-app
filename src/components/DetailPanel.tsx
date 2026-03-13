import { useState } from 'react'
import type { Cr809_projects } from '../generated/models/Cr809_projectsModel'
import type { Cr809_assets } from '../generated/models/Cr809_assetsModel'
import type { Cr809_activities } from '../generated/models/Cr809_activitiesModel'
import type { DashTaskRecord } from './Dashboard'
import { useDataverseMutations } from '../services/useDataverseMutations'
import type {
  ActivityStatusKey,
  AssetStatusKey,
  AssetTypeKey,
  ProjectStatusKey,
} from '../services/dataverseFieldMaps'

interface DetailPanelProps {
  task: DashTaskRecord | null
  rawProjectMap: Map<string, Cr809_projects>
  rawAssetMap: Map<string, Cr809_assets>
  rawActivityMap: Map<string, Cr809_activities>
  allTasks: DashTaskRecord[]
  rawAssets: Cr809_assets[]
  rawActivities: Cr809_activities[]
  onClose: () => void
  onRefresh: () => void
}

function fmt(val: string | number | undefined | null): string {
  if (val === undefined || val === null || val === '') return '—'
  return String(val)
}

function fmtDate(val?: string): string {
  if (!val) return '—'
  const d = new Date(val)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtCurrency(val?: string): string {
  if (!val) return '—'
  const n = parseFloat(val)
  if (Number.isNaN(n)) return val
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

function StatusPill({ status, type }: { status?: string; type?: string }) {
  const colors: Record<string, { bg: string; fg: string }> = {
    NotStarted: { bg: '#f0f0f0', fg: '#5a5a5a' },
    InProgress: { bg: '#dbeafe', fg: '#1d4ed8' },
    Completed: { bg: '#dcfce7', fg: '#15803d' },
    Blocked: { bg: '#fef3c7', fg: '#b45309' },
    Planning: { bg: '#f0f9ff', fg: '#0369a1' },
    OnHold: { bg: '#fef9c3', fg: '#92400e' },
    Cancelled: { bg: '#fee2e2', fg: '#b91c1c' },
    Active: { bg: '#dcfce7', fg: '#15803d' },
    Inactive: { bg: '#f0f0f0', fg: '#5a5a5a' },
    Retired: { bg: '#e0e7ff', fg: '#4338ca' },
    Maintenance: { bg: '#fef9c3', fg: '#92400e' },
  }
  const key = status ?? type ?? ''
  const style = colors[key] ?? { bg: '#f0f0f0', fg: '#5a5a5a' }
  return (
    <span className="dp-status-pill" style={{ background: style.bg, color: style.fg }}>
      {key || '—'}
    </span>
  )
}

function Field({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div className="dp-field">
      <span className="dp-field-label">{label}</span>
      <span className="dp-field-value">{children ?? <span className="dp-field-text">{value ?? '—'}</span>}</span>
    </div>
  )
}

function ProgressBar({ pct }: { pct: number }) {
  const color = pct === 0 ? '#d1d5db' : pct >= 100 ? '#107c41' : pct >= 60 ? '#0f6cbd' : '#ca5010'
  return (
    <div className="dp-progress-wrap">
      <div className="dp-progress-track">
        <div className="dp-progress-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="dp-progress-label">{pct}%</span>
    </div>
  )
}

export function DetailPanel({
  task,
  rawProjectMap,
  rawAssetMap,
  rawActivityMap,
  allTasks,
  rawAssets,
  rawActivities,
  onClose,
  onRefresh,
}: DetailPanelProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [formValues, setFormValues] = useState<Record<string, any>>({})
  const mutations = useDataverseMutations({ onRefresh })

  if (!task) return null

  const handleEditClick = () => {
    // Initialize form values from task data
    const raw =
      task.ItemType === 'Activity'
        ? rawActivityMap.get(task.SourceId)
        : task.ItemType === 'Asset'
          ? rawAssetMap.get(task.SourceId)
          : rawProjectMap.get(task.SourceId.toLowerCase())

    if (task.ItemType === 'Activity') {
      const actRaw = raw as Cr809_activities | undefined
      setFormValues({
        name: task.TaskName,
        status: actRaw?.cr809_statusname ?? 'NotStarted',
        startDate: actRaw?.cr809_startdate ? actRaw.cr809_startdate.split('T')[0] : '',
        endDate: actRaw?.cr809_enddate ? actRaw.cr809_enddate.split('T')[0] : '',
        dueDate: actRaw?.cr809_duedate ? actRaw.cr809_duedate.split('T')[0] : '',
        progress: task.Progress,
        comments: actRaw?.cr809_comments ?? '',
        deliverables: actRaw?.cr809_deliverables ?? '',
        isVendorActivity: actRaw?.cr809_isvendoractivity === 1,
      })
    } else if (task.ItemType === 'Asset') {
      const assetRaw = raw as Cr809_assets | undefined
      const statusNameMap: Record<string, string> = {
        '804270000': 'Active',
        '804270001': 'Inactive',
        '804270002': 'Retired',
        '804270003': 'Maintenance',
      }
      const typeNameMap: Record<string, string> = {
        '804270000': 'Equipment',
        '804270001': 'Vehicle',
        '804270002': 'Facility',
        '804270003': 'Software',
        '804270004': 'Other',
      }
      setFormValues({
        name: task.TaskName,
        assetType:
          assetRaw?.cr809_assettypename ?? typeNameMap[String(assetRaw?.cr809_assettype)] ?? 'Equipment',
        status: assetRaw?.cr809_statusname ?? statusNameMap[String(assetRaw?.cr809_status)] ?? 'Active',
        startDate: assetRaw?.cr809_startdate ? assetRaw.cr809_startdate.split('T')[0] : '',
        endDate: assetRaw?.cr809_enddate ? assetRaw.cr809_enddate.split('T')[0] : '',
        progress: task.Progress,
        location: assetRaw?.cr809_location ?? '',
        description: assetRaw?.cr809_description ?? '',
      })
    } else {
      const projRaw = raw as Cr809_projects | undefined
      const statusNameMap: Record<string, string> = {
        '804270000': 'Planning',
        '804270001': 'In Progress',
        '804270002': 'On Hold',
        '804270003': 'Completed',
        '804270004': 'Cancelled',
      }
      setFormValues({
        name: task.TaskName,
        status: projRaw?.cr809_statusname ?? statusNameMap[String(projRaw?.cr809_status)] ?? 'Planning',
        startDate: projRaw?.cr809_startdate ? projRaw.cr809_startdate.split('T')[0] : '',
        endDate: projRaw?.cr809_enddate ? projRaw.cr809_enddate.split('T')[0] : '',
        progress: task.Progress,
        description: projRaw?.cr809_description ?? '',
        riskLevel: projRaw?.cr809_risklevel ?? '',
      })
    }
    setIsEditing(true)
  }

  const handleSaveClick = async () => {
    try {
      if (task.ItemType === 'Activity') {
        await mutations.updateActivity(task.SourceId, {
          name: formValues.name,
          status: formValues.status as ActivityStatusKey,
          startDate: formValues.startDate ? new Date(formValues.startDate) : undefined,
          endDate: formValues.endDate ? new Date(formValues.endDate) : undefined,
          dueDate: formValues.dueDate ? new Date(formValues.dueDate) : undefined,
          progress: Number(formValues.progress),
          comments: formValues.comments,
          deliverables: formValues.deliverables,
          isVendorActivity: formValues.isVendorActivity,
        })
      } else if (task.ItemType === 'Asset') {
        await mutations.updateAsset(task.SourceId, {
          name: formValues.name,
          assetType: formValues.assetType as AssetTypeKey,
          status: formValues.status as AssetStatusKey,
          startDate: formValues.startDate ? new Date(formValues.startDate) : undefined,
          endDate: formValues.endDate ? new Date(formValues.endDate) : undefined,
          progress: Number(formValues.progress),
          location: formValues.location,
          description: formValues.description,
        })
      } else {
        await mutations.updateProject(task.SourceId, {
          name: formValues.name,
          status: formValues.status as ProjectStatusKey,
          startDate: formValues.startDate ? new Date(formValues.startDate) : undefined,
          endDate: formValues.endDate ? new Date(formValues.endDate) : undefined,
          progress: Number(formValues.progress),
          description: formValues.description,
          riskLevel: formValues.riskLevel,
        })
      }
      setIsEditing(false)
    } catch (error) {
      console.error('Failed to save:', error)
    }
  }

  const handleCancelClick = () => {
    setIsEditing(false)
    setFormValues({})
  }

  const handleDeleteClick = async () => {
    if (task.ItemType === 'Project') {
      alert('Projects cannot be deleted from this panel.')
      return
    }

    const confirmed = window.confirm(
      `Are you sure you want to delete this ${task.ItemType.toLowerCase()}? This cannot be undone.`
    )
    if (!confirmed) return

    try {
      if (task.ItemType === 'Activity') {
        await mutations.deleteActivity(task.SourceId)
      } else if (task.ItemType === 'Asset') {
        await mutations.deleteAsset(task.SourceId)
      }
      onClose()
    } catch (error) {
      console.error('Failed to delete:', error)
    }
  }

  const handleFieldChange = (field: string, value: any) => {
    setFormValues((prev) => ({ ...prev, [field]: value }))
  }

  let panelContent: React.ReactNode

  if (task.ItemType === 'Activity') {
    const raw = rawActivityMap.get(task.SourceId)
    panelContent = (
      <>
        <div className="dp-type-badge dp-type-activity">Activity</div>
        <h2 className="dp-title">{isEditing ? formValues.name : task.TaskName}</h2>

        <section className="dp-section">
          <h3 className="dp-section-title">Status & Progress</h3>
          {isEditing ? (
            <>
              <Field label="Activity Name">
                <input
                  type="text"
                  className="dp-input"
                  value={formValues.name}
                  onChange={(e) => handleFieldChange('name', e.target.value)}
                />
              </Field>
              <Field label="Status">
                <select
                  className="dp-input"
                  value={formValues.status}
                  onChange={(e) => handleFieldChange('status', e.target.value)}
                >
                  <option value="NotStarted">Not Started</option>
                  <option value="InProgress">In Progress</option>
                  <option value="Completed">Completed</option>
                  <option value="Blocked">Blocked</option>
                </select>
              </Field>
              <Field label="Progress (%)">
                <input
                  type="number"
                  className="dp-input"
                  min="0"
                  max="100"
                  value={formValues.progress}
                  onChange={(e) => handleFieldChange('progress', e.target.value)}
                />
              </Field>
              <Field label="Start Date">
                <input
                  type="date"
                  className="dp-input"
                  value={formValues.startDate}
                  onChange={(e) => handleFieldChange('startDate', e.target.value)}
                />
              </Field>
              <Field label="End Date">
                <input
                  type="date"
                  className="dp-input"
                  value={formValues.endDate}
                  onChange={(e) => handleFieldChange('endDate', e.target.value)}
                />
              </Field>
              <Field label="Due Date">
                <input
                  type="date"
                  className="dp-input"
                  value={formValues.dueDate}
                  onChange={(e) => handleFieldChange('dueDate', e.target.value)}
                />
              </Field>
            </>
          ) : (
            <>
              <Field label="Status">
                <StatusPill status={raw?.cr809_statusname ?? String(raw?.cr809_status ?? '')} />
              </Field>
              <Field label="Progress">
                <ProgressBar pct={task.Progress} />
              </Field>
              <Field label="Start Date" value={fmtDate(raw?.cr809_startdate)} />
              <Field label="End Date" value={fmtDate(raw?.cr809_enddate)} />
              <Field label="Due Date" value={fmtDate(raw?.cr809_duedate)} />
              <Field label="Duration" value={raw?.cr809_duration ? `${raw.cr809_duration} day(s)` : '—'} />
            </>
          )}
        </section>

        <section className="dp-section">
          <h3 className="dp-section-title">Assignment</h3>
          <Field label="Assigned To" value={fmt(raw?.cr809_assignedtoname)} />
          <Field label="Phase" value={fmt(raw?.cr809_phasename)} />
          {isEditing ? (
            <Field label="Is Vendor Activity">
              <input
                type="checkbox"
                className="dp-checkbox"
                checked={formValues.isVendorActivity}
                onChange={(e) => handleFieldChange('isVendorActivity', e.target.checked)}
              />
            </Field>
          ) : (
            <>
              <Field label="Vendor Activity">
                <StatusPill status={raw?.cr809_isvendoractivityname} />
              </Field>
              <Field label="Sequence" value={fmt(raw?.cr809_sequence)} />
            </>
          )}
        </section>

        {isEditing ? (
          <section className="dp-section">
            <h3 className="dp-section-title">Notes</h3>
            <div className="dp-text-block">
              <span className="dp-field-label">Comments</span>
              <textarea
                className="dp-textarea"
                value={formValues.comments}
                onChange={(e) => handleFieldChange('comments', e.target.value)}
                rows={4}
              />
            </div>
            <div className="dp-text-block">
              <span className="dp-field-label">Deliverables</span>
              <textarea
                className="dp-textarea"
                value={formValues.deliverables}
                onChange={(e) => handleFieldChange('deliverables', e.target.value)}
                rows={4}
              />
            </div>
          </section>
        ) : (
          (raw?.cr809_comments || raw?.cr809_deliverables) && (
            <section className="dp-section">
              <h3 className="dp-section-title">Notes</h3>
              {raw?.cr809_comments && (
                <div className="dp-text-block">
                  <span className="dp-field-label">Comments</span>
                  <p className="dp-text-body">{raw.cr809_comments}</p>
                </div>
              )}
              {raw?.cr809_deliverables && (
                <div className="dp-text-block">
                  <span className="dp-field-label">Deliverables</span>
                  <p className="dp-text-body">{raw.cr809_deliverables}</p>
                </div>
              )}
            </section>
          )
        )}
      </>
    )
  } else if (task.ItemType === 'Asset') {
    const raw = rawAssetMap.get(task.SourceId)
    const childActivities = rawActivities.filter(
      (a) => (a._cr809_asset_value ?? a.cr809_assetid)?.replace(/[{}]/g, '').toLowerCase() === task.SourceId.toLowerCase(),
    )
    const statusNameMap: Record<string, string> = {
      '804270000': 'Active', '804270001': 'Inactive', '804270002': 'Retired', '804270003': 'Maintenance',
    }
    const typeNameMap: Record<string, string> = {
      '804270000': 'Equipment', '804270001': 'Vehicle', '804270002': 'Facility', '804270003': 'Software', '804270004': 'Other',
    }
    panelContent = (
      <>
        <div className="dp-type-badge dp-type-asset">Asset</div>
        <h2 className="dp-title">{isEditing ? formValues.name : task.TaskName}</h2>

        <section className="dp-section">
          <h3 className="dp-section-title">Details</h3>
          {isEditing ? (
            <>
              <Field label="Asset Name">
                <input
                  type="text"
                  className="dp-input"
                  value={formValues.name}
                  onChange={(e) => handleFieldChange('name', e.target.value)}
                />
              </Field>
              <Field label="Asset Type">
                <select
                  className="dp-input"
                  value={formValues.assetType}
                  onChange={(e) => handleFieldChange('assetType', e.target.value)}
                >
                  <option value="Equipment">Equipment</option>
                  <option value="Vehicle">Vehicle</option>
                  <option value="Facility">Facility</option>
                  <option value="Software">Software</option>
                  <option value="Other">Other</option>
                </select>
              </Field>
              <Field label="Status">
                <select
                  className="dp-input"
                  value={formValues.status}
                  onChange={(e) => handleFieldChange('status', e.target.value)}
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                  <option value="Retired">Retired</option>
                  <option value="Maintenance">Maintenance</option>
                </select>
              </Field>
              <Field label="Progress (%)">
                <input
                  type="number"
                  className="dp-input"
                  min="0"
                  max="100"
                  value={formValues.progress}
                  onChange={(e) => handleFieldChange('progress', e.target.value)}
                />
              </Field>
              <Field label="Location">
                <input
                  type="text"
                  className="dp-input"
                  value={formValues.location}
                  onChange={(e) => handleFieldChange('location', e.target.value)}
                />
              </Field>
              <Field label="Start Date">
                <input
                  type="date"
                  className="dp-input"
                  value={formValues.startDate}
                  onChange={(e) => handleFieldChange('startDate', e.target.value)}
                />
              </Field>
              <Field label="End Date">
                <input
                  type="date"
                  className="dp-input"
                  value={formValues.endDate}
                  onChange={(e) => handleFieldChange('endDate', e.target.value)}
                />
              </Field>
            </>
          ) : (
            <>
              <Field label="Type" value={raw?.cr809_assettypename ?? typeNameMap[String(raw?.cr809_assettype)] ?? '—'} />
              <Field label="Status">
                <StatusPill status={raw?.cr809_statusname ?? statusNameMap[String(raw?.cr809_status)]} />
              </Field>
              <Field label="Progress">
                <ProgressBar pct={task.Progress} />
              </Field>
              <Field label="Location" value={fmt(raw?.cr809_location)} />
              <Field label="Serial Number" value={fmt(raw?.cr809_serialnumber)} />
            </>
          )}
        </section>

        {!isEditing && (
          <section className="dp-section">
            <h3 className="dp-section-title">Financial & Timeline</h3>
            <Field label="Value (USD)" value={fmtCurrency(raw?.cr809_valueusd)} />
            <Field label="Production Time" value={raw?.cr809_productiontime ? `${raw.cr809_productiontime} day(s)` : '—'} />
            <Field label="Acquisition Date" value={fmtDate(raw?.cr809_acquisitiondate)} />
            <Field label="Start Date" value={fmtDate(raw?.cr809_startdate)} />
            <Field label="End Date" value={fmtDate(raw?.cr809_enddate)} />
          </section>
        )}

        {isEditing ? (
          <section className="dp-section">
            <h3 className="dp-section-title">Description</h3>
            <textarea
              className="dp-textarea"
              value={formValues.description}
              onChange={(e) => handleFieldChange('description', e.target.value)}
              rows={4}
            />
          </section>
        ) : (
          raw?.cr809_description && (
            <section className="dp-section">
              <h3 className="dp-section-title">Description</h3>
              <p className="dp-text-body">{raw.cr809_description}</p>
            </section>
          )
        )}

        {!isEditing && (
          <section className="dp-section">
            <h3 className="dp-section-title">
              Activities
              <span className="dp-count-chip">{childActivities.length}</span>
            </h3>
            {childActivities.length === 0 ? (
              <p className="dp-empty-list">No activities found.</p>
            ) : (
              <ul className="dp-related-list">
                {childActivities
                  .sort((a, b) => Number(a.cr809_sequence ?? 0) - Number(b.cr809_sequence ?? 0))
                  .map((a) => {
                    const statusName = a.cr809_statusname ?? String(a.cr809_status ?? '—')
                    return (
                      <li key={a.cr809_activityid} className="dp-related-item">
                        <div className="dp-related-main">
                          <span className="dp-related-name">{a.cr809_activityname}</span>
                          <StatusPill status={statusName} />
                        </div>
                        <div className="dp-related-meta">
                          {a.cr809_sequence && <span>Seq {a.cr809_sequence}</span>}
                          {a.cr809_progress !== undefined && (
                            <span style={{ color: '#0f6cbd' }}>{a.cr809_progress}%</span>
                          )}
                          {a.cr809_assignedtoname && <span>{a.cr809_assignedtoname}</span>}
                        </div>
                      </li>
                    )
                  })}
              </ul>
            )}
          </section>
        )}
      </>
    )
  } else {
    // Project
    const raw = rawProjectMap.get(task.SourceId.toLowerCase())
    const childAssets = rawAssets.filter(
      (a) => a._cr809_project_value?.replace(/[{}]/g, '').toLowerCase() === task.SourceId.toLowerCase(),
    )
    const statusNameMap: Record<string, string> = {
      '804270000': 'Planning', '804270001': 'In Progress', '804270002': 'On Hold',
      '804270003': 'Completed', '804270004': 'Cancelled',
    }
    panelContent = (
      <>
        <div className="dp-type-badge dp-type-project">Project</div>
        <h2 className="dp-title">{isEditing ? formValues.name : task.TaskName}</h2>

        <section className="dp-section">
          <h3 className="dp-section-title">Details</h3>
          {isEditing ? (
            <>
              <Field label="Project Name">
                <input
                  type="text"
                  className="dp-input"
                  value={formValues.name}
                  onChange={(e) => handleFieldChange('name', e.target.value)}
                />
              </Field>
              <Field label="Status">
                <select
                  className="dp-input"
                  value={formValues.status}
                  onChange={(e) => handleFieldChange('status', e.target.value)}
                >
                  <option value="Planning">Planning</option>
                  <option value="InProgress">In Progress</option>
                  <option value="OnHold">On Hold</option>
                  <option value="Completed">Completed</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </Field>
              <Field label="Progress (%)">
                <input
                  type="number"
                  className="dp-input"
                  min="0"
                  max="100"
                  value={formValues.progress}
                  onChange={(e) => handleFieldChange('progress', e.target.value)}
                />
              </Field>
              <Field label="Risk Level">
                <input
                  type="text"
                  className="dp-input"
                  value={formValues.riskLevel}
                  onChange={(e) => handleFieldChange('riskLevel', e.target.value)}
                />
              </Field>
              <Field label="Start Date">
                <input
                  type="date"
                  className="dp-input"
                  value={formValues.startDate}
                  onChange={(e) => handleFieldChange('startDate', e.target.value)}
                />
              </Field>
              <Field label="End Date">
                <input
                  type="date"
                  className="dp-input"
                  value={formValues.endDate}
                  onChange={(e) => handleFieldChange('endDate', e.target.value)}
                />
              </Field>
            </>
          ) : (
            <>
              <Field label="Status">
                <StatusPill status={raw?.cr809_statusname ?? statusNameMap[String(raw?.cr809_status)]} />
              </Field>
              <Field label="Progress">
                <ProgressBar pct={task.Progress} />
              </Field>
              <Field label="Project Number" value={fmt(raw?.cr809_projectnumber)} />
              <Field label="Risk Level" value={fmt(raw?.cr809_risklevel)} />
              <Field label="Start Date" value={fmtDate(raw?.cr809_startdate)} />
              <Field label="End Date" value={fmtDate(raw?.cr809_enddate)} />
              <Field label="Created" value={fmtDate(raw?.cr809_createddate)} />
            </>
          )}
        </section>

        {isEditing ? (
          <section className="dp-section">
            <h3 className="dp-section-title">Description</h3>
            <textarea
              className="dp-textarea"
              value={formValues.description}
              onChange={(e) => handleFieldChange('description', e.target.value)}
              rows={4}
            />
          </section>
        ) : (
          raw?.cr809_description && (
            <section className="dp-section">
              <h3 className="dp-section-title">Description</h3>
              <p className="dp-text-body">{raw.cr809_description}</p>
            </section>
          )
        )}

        {!isEditing && (
          <section className="dp-section">
            <h3 className="dp-section-title">
              Assets
              <span className="dp-count-chip">{childAssets.length}</span>
            </h3>
            {childAssets.length === 0 ? (
              <p className="dp-empty-list">No assets found.</p>
            ) : (
              <ul className="dp-related-list">
                {childAssets.map((a) => {
                  const assetTask = allTasks.find(
                    (t) => t.ItemType === 'Asset' && t.SourceId === a.cr809_assetid?.replace(/[{}]/g, '').toLowerCase(),
                  )
                  return (
                    <li key={a.cr809_assetid} className="dp-related-item">
                      <div className="dp-related-main">
                        <span className="dp-related-name">{a.cr809_assetname}</span>
                        <StatusPill status={a.cr809_statusname} />
                      </div>
                      <div className="dp-related-meta">
                        {a.cr809_location && <span>{a.cr809_location}</span>}
                        {assetTask !== undefined && (
                          <span style={{ color: '#0f6cbd' }}>{assetTask.Progress}%</span>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )}
      </>
    )
  }

  return (
    <>
      <div className="dp-overlay" onClick={onClose} />
      <aside className="dp-panel">
        <button className="dp-close-btn" onClick={onClose} aria-label="Close">
          ✕
        </button>
        
        <div className="dp-header-actions">
          {isEditing ? (
            <>
              <button className="dp-action-btn dp-save-btn" onClick={handleSaveClick} disabled={mutations.isMutating}>
                {mutations.isMutating ? 'Saving...' : 'Save'}
              </button>
              <button className="dp-action-btn dp-cancel-btn" onClick={handleCancelClick} disabled={mutations.isMutating}>
                Cancel
              </button>
            </>
          ) : (
            <button className="dp-action-btn dp-edit-btn" onClick={handleEditClick}>
              <span className="dp-edit-icon">✏️</span> Edit
            </button>
          )}
        </div>

        {mutations.lastError && (
          <div className="dp-error-banner">
            <strong>Error:</strong> {mutations.lastError}
          </div>
        )}

        <div className="dp-content">{panelContent}</div>

        {!isEditing && task.ItemType !== 'Project' && (
          <div className="dp-footer-actions">
            <button className="dp-action-btn dp-delete-btn" onClick={handleDeleteClick} disabled={mutations.isMutating}>
              Delete {task.ItemType}
            </button>
          </div>
        )}
      </aside>
    </>
  )
}
