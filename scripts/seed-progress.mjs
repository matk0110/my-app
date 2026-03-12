/**
 * Seed cr809_progress and cr809_status for demo readiness.
 *
 * Calibrates all activities so that on March 24 (demo day) the Gantt shows
 * a realistic spread: NotStarted · Completed · Ahead · On Time · Behind · Blocked.
 *
 * Auth — three options (in priority order):
 *   1. DATAVERSE_TOKEN=<bearer>  env var  (fastest — copy from browser DevTools)
 *   2. Device Code flow (default) — tries multiple well-known client IDs
 *   3. node scripts/seed-progress.mjs --get-token  (prints browser instructions)
 *
 * Usage:
 *   node scripts/seed-progress.mjs              # auth + apply
 *   node scripts/seed-progress.mjs --dry-run    # preview only, no writes
 *   node scripts/seed-progress.mjs --get-token  # print how to get a token quickly
 */

import { PublicClientApplication } from '@azure/msal-node';

// ── config ────────────────────────────────────────────────────────────────────
const ORG_URL   = 'https://org97ec9fd4.crm.dynamics.com';
const API_BASE  = `${ORG_URL}/api/data/v9.2`;
const DEMO_DATE = new Date('2026-03-24T00:00:00.000Z');
const TENANT    = 'M365x38311559.onmicrosoft.com';

// Well-known Microsoft public client IDs that can access Dataverse via device code.
// Tried in order until one succeeds.
const CLIENT_IDS = [
  '9cee029c-6210-4654-90bb-17e6e9e5a85e', // Dynamics CRM Online integration
  '2ad88395-b77d-4561-9441-d0e40824f9bc', // PowerShell for Dynamics
  '1950a258-227b-4e31-a9cf-717495945fc2', // Azure PowerShell
];

const DRY_RUN   = process.argv.includes('--dry-run');
const GET_TOKEN = process.argv.includes('--get-token');

// ── status code map ───────────────────────────────────────────────────────────
const STATUS = {
  NotStarted: 804270000,
  InProgress: 804270001,
  Completed:  804270002,
  Blocked:    804270003,
};
const STATUS_LABEL = Object.fromEntries(Object.entries(STATUS).map(([k, v]) => [v, k]));

// ── auth ──────────────────────────────────────────────────────────────────────
function printTokenHelp() {
  console.log(`
──────────────────────────────────────────────────────────
  HOW TO GET A DATAVERSE BEARER TOKEN IN 30 SECONDS
──────────────────────────────────────────────────────────
  1. Open ${ORG_URL} in your browser
     (you should already be signed in via Power Apps)
  2. Open DevTools  →  Network tab  →  filter by "api/data"
  3. Reload the page  →  click any request in the list
  4. In Request Headers, copy the "Authorization" value
     (it starts with "Bearer eyJ...")
  5. Strip the "Bearer " prefix, then run:

     DATAVERSE_TOKEN="eyJ..." node scripts/seed-progress.mjs

  Or in PowerShell:
     $env:DATAVERSE_TOKEN = "eyJ..."
     node scripts/seed-progress.mjs
──────────────────────────────────────────────────────────
`);
}

async function tryDeviceCode(clientId) {
  const pca = new PublicClientApplication({
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${TENANT}`,
    },
  });

  return pca.acquireTokenByDeviceCode({
    scopes: [`${ORG_URL}/.default`],
    deviceCodeCallback: (info) => {
      const msg = info?.message
        || (info?.verificationUri
            ? `Go to ${info.verificationUri} and enter code: ${info.userCode}`
            : `Device code response: ${JSON.stringify(info)}`);
      console.log('\n' + '─'.repeat(62));
      console.log(msg);
      console.log('─'.repeat(62) + '\n');
    },
  });
}

async function getToken() {
  if (process.env.DATAVERSE_TOKEN) {
    console.log('Using DATAVERSE_TOKEN from environment.\n');
    return process.env.DATAVERSE_TOKEN;
  }

  for (const clientId of CLIENT_IDS) {
    try {
      console.log(`Trying device code with client ${clientId}…`);
      const result = await tryDeviceCode(clientId);
      if (result?.accessToken) return result.accessToken;
    } catch (e) {
      console.warn(`  → failed (${e.errorCode ?? e.message}), trying next…`);
    }
  }

  console.error('\nAll client IDs failed. Use the browser token approach instead:');
  printTokenHelp();
  process.exit(1);
}

// ── Dataverse helpers ─────────────────────────────────────────────────────────
function dvHeaders(token) {
  return {
    Authorization:      `Bearer ${token}`,
    Accept:             'application/json',
    'Content-Type':     'application/json',
    'OData-MaxVersion': '4.0',
    'OData-Version':    '4.0',
  };
}

async function fetchActivities(token) {
  const url = `${API_BASE}/cr809_activities`
    + `?$select=cr809_activityid,cr809_activityname,cr809_startdate,cr809_enddate,cr809_status,cr809_progress`
    + `&$top=5000`;
  const res = await fetch(url, { headers: dvHeaders(token) });
  if (!res.ok) throw new Error(`GET activities failed ${res.status}: ${await res.text()}`);
  return (await res.json()).value ?? [];
}

async function patchActivity(token, id, fields) {
  const res = await fetch(`${API_BASE}/cr809_activities(${id})`, {
    method:  'PATCH',
    headers: { ...dvHeaders(token), 'If-Match': '*' },
    body:    JSON.stringify(fields),
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(`PATCH failed ${res.status}: ${await res.text()}`);
  }
}

// ── seeding logic ─────────────────────────────────────────────────────────────
/**
 * All progress/status is computed relative to DEMO_DATE (March 24).
 *
 * timeElapsed = (demoDate − startDate) / (endDate − startDate)
 *   ≤ 0  → NotStarted (hasn't begun by demo day)
 *   ≥ 1  → Completed  (fully done by demo day)
 *   0–1  → active window; assigned in rotating buckets:
 *           0, 1 → Ahead    (+22 pp over elapsed %)
 *           2    → On time  (≈ elapsed %)
 *           3    → Behind   (−24 pp under elapsed %)
 *           4    → Blocked  (−15 pp, status = Blocked)
 */
function buildSeeds(activities) {
  const seeds = [];
  let activeBucket = 0;

  for (const a of activities) {
    if (!a.cr809_startdate || !a.cr809_enddate) continue;

    const demoMs = DEMO_DATE.getTime();
    const start  = new Date(a.cr809_startdate).getTime();
    const end    = new Date(a.cr809_enddate).getTime();
    const span   = end - start;

    if (span <= 0) {
      seeds.push({ id: a.cr809_activityid, name: a.cr809_activityname,
                   progress: 100, status: STATUS.Completed });
      continue;
    }

    const elapsed = (demoMs - start) / span;

    if (elapsed <= 0) {
      seeds.push({ id: a.cr809_activityid, name: a.cr809_activityname,
                   progress: 0, status: STATUS.NotStarted });
    } else if (elapsed >= 1) {
      seeds.push({ id: a.cr809_activityid, name: a.cr809_activityname,
                   progress: 100, status: STATUS.Completed });
    } else {
      const bucket = activeBucket % 5;
      activeBucket++;
      let progress, status;

      if (bucket === 0 || bucket === 1) {
        // Ahead of schedule
        progress = Math.min(95, Math.round((elapsed + 0.22) * 100));
        status   = STATUS.InProgress;
      } else if (bucket === 2) {
        // On time
        progress = Math.round(elapsed * 100);
        status   = STATUS.InProgress;
      } else if (bucket === 3) {
        // Behind schedule
        progress = Math.max(5, Math.round((elapsed - 0.24) * 100));
        status   = STATUS.InProgress;
      } else {
        // Blocked
        progress = Math.max(8, Math.round((elapsed - 0.15) * 100));
        status   = STATUS.Blocked;
      }

      seeds.push({ id: a.cr809_activityid, name: a.cr809_activityname,
                   progress, status });
    }
  }

  return seeds;
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  if (GET_TOKEN) { printTokenHelp(); return; }

  console.log(`Demo date : ${DEMO_DATE.toDateString()}`);
  console.log(`Org       : ${ORG_URL}`);
  if (DRY_RUN) console.log('*** DRY RUN — no writes ***');
  console.log('');

  console.log('Authenticating…');
  const token = await getToken();

  console.log('Fetching activities…');
  const activities = await fetchActivities(token);
  console.log(`  → ${activities.length} activities found.\n`);

  if (activities.length === 0) {
    console.log('Nothing to seed. Exiting.');
    return;
  }

  const seeds = buildSeeds(activities);

  // ── summary counts ──────────────────────────────────────────────────────────
  const counts = { NotStarted: 0, Ahead: 0, OnTime: 0, Behind: 0, Blocked: 0, Completed: 0 };
  for (const s of seeds) {
    const label = STATUS_LABEL[s.status];
    if (label === 'InProgress') {
      const a = activities.find(x => x.cr809_activityid === s.id);
      const elapsed = a
        ? (DEMO_DATE - new Date(a.cr809_startdate)) /
          (new Date(a.cr809_enddate) - new Date(a.cr809_startdate))
        : 0;
      if      (s.progress / 100 >= elapsed + 0.10) counts.Ahead++;
      else if (s.progress / 100 >= elapsed - 0.10) counts.OnTime++;
      else                                          counts.Behind++;
    } else {
      counts[label] = (counts[label] ?? 0) + 1;
    }
  }

  console.log('─'.repeat(50));
  for (const [k, v] of Object.entries(counts)) {
    if (v > 0) console.log(`  ${k.padEnd(15)} ${v}`);
  }
  console.log(`  ${'Total'.padEnd(15)} ${seeds.length}`);
  console.log('─'.repeat(50) + '\n');

  // ── per-activity preview ────────────────────────────────────────────────────
  console.log('Plan:');
  for (const s of seeds) {
    const lbl  = STATUS_LABEL[s.status].padEnd(11);
    const prog = String(s.progress).padStart(3) + '%';
    console.log(`  [${lbl}] ${prog}  ${(s.name ?? s.id).slice(0, 55)}`);
  }

  if (DRY_RUN) {
    console.log('\n*** DRY RUN complete — rerun without --dry-run to apply. ***');
    return;
  }

  // ── apply ───────────────────────────────────────────────────────────────────
  console.log('\nApplying…');
  let ok = 0, err = 0;
  for (const seed of seeds) {
    try {
      await patchActivity(token, seed.id, {
        cr809_progress: seed.progress,
        cr809_status:   seed.status,
      });
      ok++;
      process.stdout.write(ok % 60 === 0 ? `\n  ${ok} ` : '.');
    } catch (e) {
      err++;
      console.error(`\n  ERROR ${seed.name ?? seed.id}: ${e.message}`);
    }
  }
  console.log(`\n\nDone.  Updated: ${ok}  Errors: ${err}`);
}

main().catch((e) => { console.error('\nFatal:', e.message ?? e); process.exit(1); });
