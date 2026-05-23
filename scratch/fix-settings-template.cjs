const fs = require('fs');

const file = 'src/pages/admin.js';
let source = fs.readFileSync(file, 'utf8');

const functionStart = source.indexOf('export async function renderSettingsTab');
const templateStart = source.indexOf('  container.innerHTML = `', functionStart);
const handlerStart = source.indexOf("  container.querySelector('#save-clockout-time')", templateStart);

if (functionStart < 0 || templateStart < 0 || handlerStart < 0) {
  throw new Error(`Could not locate settings template markers: ${JSON.stringify({ functionStart, templateStart, handlerStart })}`);
}

const replacement = String.raw`  container.innerHTML = \`
    <div class="page-header settings-header">
      <div class="settings-title-wrap">
        <span class="settings-title-icon">\${ICONS.settings}</span>
        <div>
          <h1>Settings</h1>
          <p>Configure system preferences and manage attendance restrictions.</p>
        </div>
      </div>
    </div>

    <div class="settings-grid">
      <div class="settings-card">
        <div class="settings-card-head">
          <span class="settings-card-icon">\${ICONS.clock}</span>
          <div>
            <h3>Auto Clock-Out Time</h3>
            <p>Set the daily fallback clock-out time for active employees.</p>
          </div>
        </div>

        <div class="settings-alert settings-alert-danger">
          <span>\${ICONS.alert}</span>
          <small>Changing this affects all employees globally. Server restart required.</small>
        </div>

        <div class="settings-form-row">
          <label class="sr-only" for="auto-clockout-time">Auto clock-out time</label>
          <input type="time" id="auto-clockout-time" value="18:00" class="settings-time-input">
          <button class="btn btn-primary settings-save-btn" id="save-clockout-time">
            \${ICONS.check}
            <span>Save Time</span>
          </button>
        </div>

        <p class="settings-helper">
          Employees clocked in after this time will be auto-clocked out. Current: <b>18:00 (6 PM)</b>
        </p>
      </div>

      <div class="settings-card">
        <div class="settings-card-head">
          <span class="settings-card-icon settings-card-icon-danger">\${ICONS.block}</span>
          <div>
            <h3>Restrictions (\${restrictedProfiles.length})</h3>
            <p>Employees with repeated missed clock-outs are blocked from clocking in.</p>
          </div>
        </div>

        <div class="settings-alert settings-alert-info">
          <span>\${ICONS.alert}</span>
          <small>Employees with 4+ missed clock-outs cannot clock in.</small>
        </div>

        \${restrictedProfiles.length === 0
          ? \`<div class="settings-empty">
              <span>\${ICONS.check}</span>
              <p>No restricted employees</p>
            </div>\`
          : \`<div class="settings-restriction-list">
              \${restrictedProfiles.map(p => \`
                <div class="settings-restriction-row">
                  <div class="settings-employee">
                    <span class="settings-employee-avatar">\${(p.full_name || 'E').trim().charAt(0).toUpperCase()}</span>
                    <div>
                      <b>\${p.full_name}</b>
                      <small>\${p.id.slice(0, 8)}...</small>
                    </div>
                  </div>
                  <button class="btn btn-secondary btn-sm remove-restriction" data-id="\${p.id}" data-name="\${p.full_name}">
                    \${ICONS.refresh}
                    <span>Unlock</span>
                  </button>
                </div>
              \`).join('')}
            </div>\`
        }
      </div>
    </div>

    <div class="settings-notes">
      <span class="settings-notes-icon">\${ICONS.alert}</span>
      <div>
        <b>Important Notes</b>
        <ul>
          <li>Auto clock-out time changes require server restart to take effect</li>
          <li>Unlocking employees automatically fixes their oldest missed clock-outs</li>
          <li>Changes are immediate but server must be running for them to apply</li>
        </ul>
      </div>
    </div>
  \`;

`;

source = source.slice(0, templateStart) + replacement + source.slice(handlerStart);
fs.writeFileSync(file, source, 'utf8');
