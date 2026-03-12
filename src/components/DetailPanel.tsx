import type { Cr809_projects } from '../generated/models/Cr809_projectsModel'
import type { Cr809_assets } from '../generated/models/Cr809_assetsModel'
import type { Cr809_activities } from '../generated/models/Cr809_activitiesModel'
import type { DashTaskRecord } from './Dashboard'

interface DetailPanelProps {
  task: DashTaskRecord | null
  rawProjectMap: Map<string, Cr809_projects>
  rawAssetMap: Map<string, Cr809_assets>
  rawActivityMap: Map<string, Cr809_activities>
  allTasks: DashTaskRecord[]
  rawAssets: Cr809_assets[]
  rawActivities: Cr809_activities[]
  onClose: () => void
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
}: DetailPanelProps) {
  if (!task) return null

  let panelContent: React.ReactNode

  if (task.ItemType === 'Activity') {
    const raw = rawActivityMap.get(task.SourceId)
    panelContent = (
      <>
        <div className="dp-type-badge dp-type-activity">Activity</div>
        <h2 className="dp-title">{task.TaskName}</h2>

        <section className="dp-section">
          <h3 className="dp-section-title">Status & Progress</h3>
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
        </section>

        <section className="dp-section">
          <h3 className="dp-section-title">Assignment</h3>
          <Field label="Assigned To" value={fmt(raw?.cr809_assignedtoname)} />
          <Field label="Phase" value={fmt(raw?.cr809_phasename)} />
          <Field label="Vendor Activity">
            <StatusPill status={raw?.cr809_isvendoractivityname} />
          </Field>
          <Field label="Sequence" value={fmt(raw?.cr809_sequence)} />
        </section>

        {(raw?.cr809_comments || raw?.cr809_deliverables) && (
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
        <h2 className="dp-title">{task.TaskName}</h2>

        <section className="dp-section">
          <h3 className="dp-section-title">Details</h3>
          <Field label="Type" value={raw?.cr809_assettypename ?? typeNameMap[String(raw?.cr809_assettype)] ?? '—'} />
          <Field label="Status">
            <StatusPill status={raw?.cr809_statusname ?? statusNameMap[String(raw?.cr809_status)]} />
          </Field>
          <Field label="Progress">
            <ProgressBar pct={task.Progress} />
          </Field>
          <Field label="Location" value={fmt(raw?.cr809_location)} />
          <Field label="Serial Number" value={fmt(raw?.cr809_serialnumber)} />
        </section>

        <section className="dp-section">
          <h3 className="dp-section-title">Financial & Timeline</h3>
          <Field label="Value (USD)" value={fmtCurrency(raw?.cr809_valueusd)} />
          <Field label="Production Time" value={raw?.cr809_productiontime ? `${raw.cr809_productiontime} day(s)` : '—'} />
          <Field label="Acquisition Date" value={fmtDate(raw?.cr809_acquisitiondate)} />
          <Field label="Start Date" value={fmtDate(raw?.cr809_startdate)} />
          <Field label="End Date" value={fmtDate(raw?.cr809_enddate)} />
        </section>

        {raw?.cr809_description && (
          <section className="dp-section">
            <h3 className="dp-section-title">Description</h3>
            <p className="dp-text-body">{raw.cr809_description}</p>
          </section>
        )}

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
        <h2 className="dp-title">{task.TaskName}</h2>

        <section className="dp-section">
          <h3 className="dp-section-title">Details</h3>
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
        </section>

        {raw?.cr809_description && (
          <section className="dp-section">
            <h3 className="dp-section-title">Description</h3>
            <p className="dp-text-body">{raw.cr809_description}</p>
          </section>
        )}

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
        <div className="dp-content">{panelContent}</div>
      </aside>
    </>
  )
}
