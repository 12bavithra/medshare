const API_BASE = `${window.location.origin}/api`;

function getAuthHeaders() {
  return {
    "Content-Type": "application/json",
    "Authorization": "Bearer " + localStorage.getItem("token")
  };
}

function extractArrayResponse(data) {
  console.log("API Response:", data);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.requests)) return data.requests;
  return [];
}

function getUser() {
  try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; }
}

function ensureAuth() {
  const token = localStorage.getItem('token');
  if (!token) {
    alert('Please login first');
    window.location.href = 'login.html';
    return false;
  }
  return true;
}

async function loadRequests() {
  if (!ensureAuth()) return;
  const user = getUser();
  const tbody = document.getElementById('requestsBody');
  const loading = document.getElementById('requestsLoading');
  const empty = document.getElementById('requestsEmpty');
  const title = document.getElementById('requestsTitle');

  loading.style.display = 'block';
  empty.style.display = 'none';
  tbody.innerHTML = '';

  try {
    const token = localStorage.getItem('token');
    let url = '';
    if (user.role === 'ADMIN') {
      title.textContent = 'All Requests';
      url = `${API_BASE}/requests`;
    } else if (user.role === 'RECIPIENT') {
      title.textContent = 'Your Requests';
      url = `${API_BASE}/requests/my`;
    } else {
      title.textContent = 'Related Requests';
      // Optional: could add donor-related view later
      url = `${API_BASE}/requests/my`;
    }

    const res = await fetch(url, { headers: getAuthHeaders() });
    const data = await res.json();
    const items = extractArrayResponse(data);
    loading.style.display = 'none';

    if (!Array.isArray(items) || items.length === 0) {
      empty.style.display = 'block';
      return;
    }

    tbody.innerHTML = items.map(r => {
      const medName = r.medicineId?.name || 'Unknown';
      const recName = r.recipientId?.name || 'You';
      const status = r.status;
      const actions = (user.role === 'ADMIN' && status === 'PENDING') ? `
        <button class="btn green small" data-action="approve" data-id="${r._id}">Approve</button>
        <button class="btn red small" data-action="reject" data-id="${r._id}">Reject</button>
      ` : '<span>-</span>';
      return `
        <tr>
          <td>${medName}</td>
          <td>${recName}</td>
          <td>${status}</td>
          <td>${actions}</td>
        </tr>
      `;
    }).join('');

    if (user.role === 'ADMIN') {
      tbody.querySelectorAll('button[data-action]').forEach(btn => {
        btn.addEventListener('click', onAdminAction);
      });
    }
  } catch (err) {
    loading.style.display = 'none';
    alert('Failed to load requests');
  }
}

async function onAdminAction(e) {
  const id = e.target.getAttribute('data-id');
  const action = e.target.getAttribute('data-action');
  if (!confirm(`Are you sure you want to ${action} this request?`)) return;
  try {
    const res = await fetch(`${API_BASE}/requests/${id}/${action}`, {
      method: 'PATCH',
      headers: getAuthHeaders()
    });
    const data = await res.json();
    console.log("API Response:", data);
    if (res.ok) {
      alert(`Request ${action}d`);
      loadRequests();
    } else {
      alert(data.message || 'Action failed');
    }
  } catch (err) {
    alert('Network error');
  }
}

document.addEventListener('DOMContentLoaded', loadRequests);


