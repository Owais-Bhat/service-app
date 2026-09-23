import { supabase } from '../supabase.js';
import { ICONS } from '../icons.js';
import { toast, showLoader, formatDate, formatTime } from '../utils.js';

export async function renderQueriesTab(container) {
  showLoader(container);

  let queries = [];

  const loadQueries = async () => {
    try {
      const { data, error } = await supabase
        .from('queries')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      queries = data || [];
      render();
    } catch (err) {
      console.error('Error fetching queries:', err);
      toast('Failed to load queries', 'error');
      container.innerHTML = `<div class="card"><div class="card-body"><h3>Error loading queries</h3></div></div>`;
    }
  };

  const render = () => {
    let html = `
      <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:10px;">
        <div>
          <h1 style="display:flex; align-items:center; gap:12px;">
            <span style="color:var(--primary);">${ICONS.inbox}</span>
            Queries & Follow Up
          </h1>
          <p>Record and manage customer queries</p>
        </div>
        <button class="btn btn-primary" id="btn-add-query" style="padding:8px 16px;">+ Add Query</button>
      </div>
      
      <div class="card">
        <div class="table-wrap">
          <table style="width:100%; border-collapse:collapse; text-align:left;">
            <thead>
              <tr>
                <th style="padding:12px; border-bottom:1px solid var(--border);">Date</th>
                <th style="padding:12px; border-bottom:1px solid var(--border);">Customer Info</th>
                <th style="padding:12px; border-bottom:1px solid var(--border);">Query Details</th>
                <th style="padding:12px; border-bottom:1px solid var(--border); text-align:center;">Estimate Sent</th>
                <th style="padding:12px; border-bottom:1px solid var(--border);">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${queries.length === 0 ? `<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--text-dim);">No queries recorded yet.</td></tr>` : queries.map(q => `
                <tr style="border-bottom:1px solid var(--border); background:var(--bg);">
                  <td style="padding:12px; vertical-align:top;">
                    <div style="font-weight:600;">${formatDate(q.created_at)}</div>
                    <div style="font-size:0.8rem; color:var(--text-dim);">${formatTime(q.created_at)}</div>
                  </td>
                  <td style="padding:12px; vertical-align:top;">
                    <div style="font-weight:700;">${q.full_name}</div>
                    <div style="color:var(--info); font-size:0.9rem;">📞 ${q.phone}</div>
                    ${q.address ? `<div style="font-size:0.85rem; color:var(--text-soft); margin-top:4px;">📍 ${q.address}</div>` : ''}
                  </td>
                  <td style="padding:12px; vertical-align:top; max-width:250px;">
                    <p style="margin:0; font-size:0.9rem; line-height:1.4;">${q.query_details}</p>
                  </td>
                  <td style="padding:12px; vertical-align:top; text-align:center;">
                    <label class="switch-container" style="display:inline-flex;cursor:pointer;">
                      <div class="switch-outer" style="position:relative;width:40px;height:20px;background:${q.estimate_sent ? 'var(--success)' : 'var(--border)'};border-radius:10px;transition:0.3s;">
                        <div class="switch-inner" style="position:absolute;top:2px;left:${q.estimate_sent ? '22px' : '2px'};width:16px;height:16px;background:#fff;border-radius:50%;transition:0.3s;"></div>
                      </div>
                      <input type="checkbox" style="display:none;" class="toggle-estimate" data-id="${q.id}" ${q.estimate_sent ? 'checked' : ''} />
                    </label>
                  </td>
                  <td style="padding:12px; vertical-align:top;">
                    <button class="btn btn-secondary btn-sm delete-query" data-id="${q.id}" style="padding:4px 8px; color:var(--danger);">Delete</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Add Query Modal -->
      <div id="add-query-modal" class="modal" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:1000; align-items:center; justify-content:center; padding:15px;">
        <div class="card" style="width:100%; max-width:500px; max-height:90vh; overflow-y:auto;">
          <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
            <h3 style="margin:0;">Add New Query</h3>
            <button class="btn" id="close-query-modal" style="background:none; border:none; font-size:1.5rem; cursor:pointer;">&times;</button>
          </div>
          <div class="card-body">
            <form id="add-query-form" style="display:flex; flex-direction:column; gap:15px;">
              <div>
                <label style="display:block; margin-bottom:4px; font-size:0.85rem; font-weight:600;">Customer Name *</label>
                <input type="text" id="q-name" required class="form-control" style="width:100%;" />
              </div>
              <div>
                <label style="display:block; margin-bottom:4px; font-size:0.85rem; font-weight:600;">Phone Number *</label>
                <input type="text" id="q-phone" required class="form-control" style="width:100%;" />
              </div>
              <div>
                <label style="display:block; margin-bottom:4px; font-size:0.85rem; font-weight:600;">Location / Address</label>
                <textarea id="q-address" class="form-control" rows="2" style="width:100%;"></textarea>
              </div>
              <div>
                <label style="display:block; margin-bottom:4px; font-size:0.85rem; font-weight:600;">Query Details *</label>
                <textarea id="q-details" required class="form-control" rows="3" style="width:100%;" placeholder="What does the customer want?"></textarea>
              </div>
              <div style="display:flex; align-items:center; gap:8px; margin-top:5px;">
                <input type="checkbox" id="q-estimate" style="width:18px; height:18px;" />
                <label for="q-estimate" style="font-weight:600;">Estimate Sent?</label>
              </div>
              <button type="submit" class="btn btn-primary" style="margin-top:10px;">Save Query</button>
            </form>
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;

    // Event Listeners
    const modal = container.querySelector('#add-query-modal');
    container.querySelector('#btn-add-query').onclick = () => {
      container.querySelector('#add-query-form').reset();
      modal.style.display = 'flex';
    };

    container.querySelector('#close-query-modal').onclick = () => {
      modal.style.display = 'none';
    };

    container.querySelector('#add-query-form').onsubmit = async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.textContent = 'Saving...';

      const payload = {
        id: crypto.randomUUID(),
        full_name: document.getElementById('q-name').value,
        phone: document.getElementById('q-phone').value,
        address: document.getElementById('q-address').value || null,
        query_details: document.getElementById('q-details').value,
        estimate_sent: document.getElementById('q-estimate').checked ? 1 : 0
      };

      try {
        const { error } = await supabase.from('queries').insert([payload]);
        if (error) throw error;
        toast('Query saved successfully!', 'success');
        modal.style.display = 'none';
        loadQueries();
      } catch (err) {
        console.error(err);
        toast(err.message || 'Error saving query', 'error');
        btn.disabled = false;
        btn.textContent = 'Save Query';
      }
    };

    container.querySelectorAll('.toggle-estimate').forEach(chk => {
      chk.onchange = async (e) => {
        const id = e.target.getAttribute('data-id');
        const checked = e.target.checked;
        const outer = e.target.closest('.switch-container').querySelector('.switch-outer');
        const inner = e.target.closest('.switch-container').querySelector('.switch-inner');
        
        outer.style.background = checked ? 'var(--success)' : 'var(--border)';
        inner.style.left = checked ? '22px' : '2px';

        try {
          const { error } = await supabase.from('queries').update({ estimate_sent: checked ? 1 : 0 }).eq('id', id);
          if (error) throw error;
          toast('Estimate status updated', 'success');
          // Update local state without full reload
          const q = queries.find(x => x.id === id);
          if (q) q.estimate_sent = checked ? 1 : 0;
        } catch (err) {
          console.error(err);
          toast('Failed to update status', 'error');
          // Revert UI
          e.target.checked = !checked;
          outer.style.background = !checked ? 'var(--success)' : 'var(--border)';
          inner.style.left = !checked ? '22px' : '2px';
        }
      };
    });

    container.querySelectorAll('.delete-query').forEach(btn => {
      btn.onclick = async (e) => {
        if (!confirm('Are you sure you want to delete this query?')) return;
        const id = e.target.getAttribute('data-id');
        e.target.disabled = true;
        e.target.textContent = '...';
        
        try {
          const { error } = await supabase.from('queries').delete().eq('id', id);
          if (error) throw error;
          toast('Query deleted', 'success');
          loadQueries();
        } catch (err) {
          console.error(err);
          toast('Failed to delete query', 'error');
          e.target.disabled = false;
          e.target.textContent = 'Delete';
        }
      };
    });
  };

  // Initial load
  await loadQueries();
}
