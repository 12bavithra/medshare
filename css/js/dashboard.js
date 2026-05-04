const AUTH_API = "http://localhost:5000/api/auth";
const MEDICINE_API = "http://localhost:5000/api/medicines";
const REQUEST_API = "http://localhost:5000/api/requests";
const ADMIN_API = "http://localhost:5000/api/admin";

let currentUser = null;

function redirectToLogin() {
  window.location.href = 'login.html';
}

async function loadDashboard() {
  const token = localStorage.getItem('token');
  if (!token) return redirectToLogin();

  try {
    const res = await fetch(`${AUTH_API}/me`, { headers: { Authorization: `Bearer ${token}` } });
    const user = await res.json();
    if (!res.ok) return redirectToLogin();

    currentUser = user;
    document.getElementById('welcome').textContent = `Welcome, ${user.name}`;
    document.getElementById('roleText').textContent = `You are logged in as ${user.role}.`;

    // Show appropriate dashboard based on role
    showRoleDashboard(user.role);

    // Setup logout functionality
    document.getElementById('logoutLink').addEventListener('click', () => {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = 'login.html';
    });

  } catch (e) {
    console.error('Dashboard load error:', e);
    redirectToLogin();
  }
}

// Wire up search inputs (if present on page)
document.addEventListener('DOMContentLoaded', () => {
  const nameInput = document.getElementById('filterName');
  const catInput = document.getElementById('filterCategory');
  const expInput = document.getElementById('filterExpiry');
  const searchBtn = document.getElementById('filterSearchBtn');

  const triggerSearch = () => {
    if (currentUser && currentUser.role === 'RECIPIENT') {
      loadRecipientDashboard();
    }
  };

  if (nameInput) nameInput.addEventListener('input', debounce(triggerSearch, 300));
  if (catInput) catInput.addEventListener('change', triggerSearch);
  if (expInput) expInput.addEventListener('change', triggerSearch);
  if (searchBtn) searchBtn.addEventListener('click', triggerSearch);
});

function debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(null, args), wait);
  };
}

function showRoleDashboard(role) {
  // Hide all dashboards first
  document.getElementById('donorDashboard').style.display = 'none';
  document.getElementById('recipientDashboard').style.display = 'none';
  document.getElementById('adminDashboard').style.display = 'none';

  // Show appropriate dashboard
  if (role === 'DONOR') {
    document.getElementById('donorDashboard').style.display = 'block';
    loadDonorDashboard();
  } else if (role === 'RECIPIENT') {
    document.getElementById('recipientDashboard').style.display = 'block';
    loadRecipientDashboard();
  } else if (role === 'ADMIN') {
    document.getElementById('adminDashboard').style.display = 'block';
    loadAdminDashboard();
  }
}

// Donor Dashboard Functions
async function loadDonorDashboard() {
  try {
    const token = localStorage.getItem('token');
    const res = await fetch(`${MEDICINE_API}/donor/medicines`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const medicines = await res.json();
    
    displayDonorMedicines(medicines);
  } catch (e) {
    console.error('Error loading donor medicines:', e);
    document.getElementById('donorMedicines').innerHTML = '<div class="empty-state">Error loading medicines</div>';
  }
}

function displayDonorMedicines(medicines) {
  const container = document.getElementById('donorMedicines');
  
  if (medicines.length === 0) {
    container.innerHTML = '<div class="empty-state">No medicines donated yet. <a href="donate.html">Add your first medicine</a></div>';
    return;
  }

  container.innerHTML = medicines.map(medicine => {
    // Debug logging for missing fields
    const missingFields = [];
    if (!medicine.name) missingFields.push('name');
    if (!medicine.status) missingFields.push('status');
    if (!medicine.quantity) missingFields.push('quantity');
    if (!medicine.expiryDate) missingFields.push('expiryDate');
    if (!medicine.createdAt) missingFields.push('createdAt');
    
    if (missingFields.length > 0) {
      console.log("⚠️ Missing fields in donor medicine record:", missingFields.join(', '));
      console.log("Full donor medicine object:", JSON.stringify(medicine, null, 2));
    }

    return `
    <div class="medicine-card">
      <div class="medicine-card-header">
        <h3 class="medicine-title">${medicine.name || 'Unknown Medicine'}</h3>
        <div class="medicine-status status-${medicine.status ? medicine.status.toLowerCase() : 'unknown'}">${medicine.status || 'Unknown'}</div>
      </div>
      <div class="medicine-description">${medicine.description || 'No description provided'}</div>
      <div class="medicine-details">
        <div class="medicine-detail">
          <div class="medicine-detail-label">Quantity</div>
          <div class="medicine-detail-value">${medicine.quantity || 'N/A'}</div>
        </div>
        <div class="medicine-detail">
          <div class="medicine-detail-label">Expiry Date</div>
          <div class="medicine-detail-value">${medicine.expiryDate ? new Date(medicine.expiryDate).toLocaleDateString() : 'N/A'}</div>
        </div>
        <div class="medicine-detail">
          <div class="medicine-detail-label">Status</div>
          <div class="medicine-detail-value">${medicine.status || 'Unknown'}</div>
        </div>
        <div class="medicine-detail">
          <div class="medicine-detail-label">Added</div>
          <div class="medicine-detail-value">${medicine.createdAt ? new Date(medicine.createdAt).toLocaleDateString() : 'N/A'}</div>
        </div>
      </div>
      ${medicine.requestedBy ? `
        <div class="medicine-requester">
          <strong>Requested by:</strong> ${medicine.requestedBy.name || 'Unknown'}
        </div>
      ` : ''}
    </div>
  `;
  }).join('');
}

// Recipient Dashboard Functions
async function loadRecipientDashboard() {
  try {
    const token = localStorage.getItem('token');
    
    // Load available medicines (with optional filters)
    const name = document.getElementById('filterName')?.value || '';
    const category = document.getElementById('filterCategory')?.value || '';
    const expiryBefore = document.getElementById('filterExpiry')?.value || '';
    const params = new URLSearchParams();
    if (name) params.append('name', name);
    if (category) params.append('category', category);
    if (expiryBefore) params.append('expiryBefore', expiryBefore);

    const medicinesRes = await fetch(`${MEDICINE_API}${params.toString() ? `?${params.toString()}` : ''}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const medicines = await medicinesRes.json();
    displayAvailableMedicines(medicines);

    // Load my requests
    const requestsRes = await fetch(`${REQUEST_API}/my`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const requests = await requestsRes.json();
    displayMyRequests(requests);

  } catch (e) {
    console.error('Error loading recipient dashboard:', e);
    document.getElementById('availableMedicines').innerHTML = '<div class="empty-state">Error loading data</div>';
    document.getElementById('myRequests').innerHTML = '<div class="empty-state">Error loading requests</div>';
  }
}

function displayAvailableMedicines(medicines) {
  const container = document.getElementById('availableMedicines');
  
  if (medicines.length === 0) {
    container.innerHTML = '<div class="empty-state">No medicines available at the moment</div>';
    return;
  }

  container.innerHTML = medicines.map(medicine => {
    // Debug logging for missing fields
    const missingFields = [];
    if (!medicine.name) missingFields.push('name');
    if (!medicine.status) missingFields.push('status');
    if (!medicine.donor) missingFields.push('donor');
    if (medicine.donor && !medicine.donor.name) missingFields.push('donor.name');
    if (!medicine.quantity) missingFields.push('quantity');
    if (!medicine.expiryDate) missingFields.push('expiryDate');
    if (!medicine.createdAt) missingFields.push('createdAt');
    
    if (missingFields.length > 0) {
      console.log("⚠️ Missing fields in medicine record:", missingFields.join(', '));
      console.log("Full medicine object:", JSON.stringify(medicine, null, 2));
    }

    return `
    <div class="medicine-card">
      <div class="medicine-card-header">
        <h3 class="medicine-title">${medicine.name || 'Unknown Medicine'}</h3>
        <div class="medicine-status status-${medicine.status ? medicine.status.toLowerCase() : 'unknown'}">${medicine.status || 'Unknown'}</div>
      </div>
      <div class="medicine-description">${medicine.description || 'No description provided'}</div>
      <div class="medicine-details">
        <div class="medicine-detail">
          <div class="medicine-detail-label">Quantity</div>
          <div class="medicine-detail-value">${medicine.quantity || 'N/A'}</div>
        </div>
        <div class="medicine-detail">
          <div class="medicine-detail-label">Expiry Date</div>
          <div class="medicine-detail-value">${medicine.expiryDate ? new Date(medicine.expiryDate).toLocaleDateString() : 'N/A'}</div>
        </div>
        <div class="medicine-detail">
          <div class="medicine-detail-label">Donor</div>
          <div class="medicine-detail-value">${medicine.donor && medicine.donor.name ? medicine.donor.name : 'Unknown'}</div>
        </div>
        <div class="medicine-detail">
          <div class="medicine-detail-label">Added</div>
          <div class="medicine-detail-value">${medicine.createdAt ? new Date(medicine.createdAt).toLocaleDateString() : 'N/A'}</div>
        </div>
      </div>
      <div class="medicine-actions">
        ${medicine.status === 'AVAILABLE' ? 
          `<button class="btn green small request-btn" data-id="${medicine._id}">Request Medicine</button>` : 
          '<span class="request-status status-claimed">Already Requested</span>'
        }
      </div>
    </div>
  `;
  }).join('');

  // Delegate click for request buttons to satisfy CSP (no inline handlers)
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('.request-btn');
    if (!btn || !container.contains(btn)) return;
    const id = btn.getAttribute('data-id');
    if (id) requestMedicine(id);
  });
}

function displayMyRequests(requests) {
  const container = document.getElementById('myRequests');
  
  if (requests.length === 0) {
    container.innerHTML = '<div class="empty-state">No requests made yet</div>';
    return;
  }

  container.innerHTML = requests.map(request => {
    // Debug logging for missing fields
    const missingFields = [];
    if (!request.status) missingFields.push('status');
    if (!request.medicineId) missingFields.push('medicineId');
    if (request.medicineId && !request.medicineId.name) missingFields.push('medicineId.name');
    if (!request.requestedAt) missingFields.push('requestedAt');
    
    if (missingFields.length > 0) {
      console.log("⚠️ Missing fields in request record:", missingFields.join(', '));
      console.log("Full request object:", JSON.stringify(request, null, 2));
    }

    return `
    <div class="medicine-card">
      <div class="medicine-card-header">
        <h3 class="medicine-title">${request.medicineId && request.medicineId.name ? request.medicineId.name : 'Unknown Medicine'}</h3>
        <div class="request-status status-${request.status ? request.status.toLowerCase() : 'unknown'}">${request.status || 'Unknown'}</div>
      </div>
      <div class="medicine-details">
        <div class="medicine-detail">
          <div class="medicine-detail-label">Quantity</div>
          <div class="medicine-detail-value">${request.medicineId && request.medicineId.quantity ? request.medicineId.quantity : 'N/A'}</div>
        </div>
        <div class="medicine-detail">
          <div class="medicine-detail-label">Expiry Date</div>
          <div class="medicine-detail-value">${request.medicineId && request.medicineId.expiryDate ? new Date(request.medicineId.expiryDate).toLocaleDateString() : 'N/A'}</div>
        </div>
        <div class="medicine-detail">
          <div class="medicine-detail-label">Status</div>
          <div class="medicine-detail-value">${request.status || 'Unknown'}</div>
        </div>
        <div class="medicine-detail">
          <div class="medicine-detail-label">Requested</div>
          <div class="medicine-detail-value">${request.requestedAt ? new Date(request.requestedAt).toLocaleDateString() : 'N/A'}</div>
        </div>
      </div>
      ${request.status === 'APPROVED' ? '<div class="medicine-requester"><strong>✅ Request Approved!</strong></div>' : ''}
      ${request.status === 'REJECTED' ? '<div class="medicine-requester"><strong>❌ Request Rejected</strong></div>' : ''}
    </div>
  `;
  }).join('');
}

async function requestMedicine(medicineId) {
  try {
    const token = localStorage.getItem('token');
    const res = await fetch(`${REQUEST_API}/${medicineId}`, {
      method: 'POST',
      headers: { 
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    const data = await res.json();
    if (res.ok) {
      alert('Medicine request submitted successfully!');
      loadRecipientDashboard(); // Reload to show updated data
    } else {
      alert(data.message || 'Failed to request medicine');
    }
  } catch (e) {
    console.error('Error requesting medicine:', e);
    alert('Error requesting medicine');
  }
}

// Admin Dashboard Functions
async function loadAdminDashboard() {
  try {
    const token = localStorage.getItem('token');
    
    // Load overview stats
    await loadAdminOverview(token);
    
    // Load initial tab content
    showAdminTab('overview');
    
  } catch (e) {
    console.error('Error loading admin dashboard:', e);
  }
}

async function loadAdminOverview(token) {
  try {
    // Load medicines for stats
    const medicinesRes = await fetch(`${ADMIN_API}/medicines`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const medicines = await medicinesRes.json();
    
    // Load users for stats
    const usersRes = await fetch(`${ADMIN_API}/users`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const users = await usersRes.json();
    
    // Calculate stats
    const totalMedicines = medicines.length;
    const availableCount = medicines.filter(m => m.status === 'AVAILABLE').length;
    const claimedCount = medicines.filter(m => m.status === 'CLAIMED').length;
    const totalUsers = users.length;
    
    // Update overview stats
    document.getElementById('totalMedicines').textContent = totalMedicines;
    document.getElementById('availableCount').textContent = availableCount;
    document.getElementById('claimedCount').textContent = claimedCount;
    document.getElementById('totalUsers').textContent = totalUsers;
    
    // Overview charts removed; analytics now lives under the Analytics tab
  } catch (e) {
    console.error('Error loading admin overview:', e);
  }
}

// Overview charts removed – charts live under the Analytics tab only

async function renderAnalyticsTab(token) {
  try {
    const container = document.getElementById('analyticsContent');
    if (!container) return;
    container.innerHTML = '';

    // Headings
    const h = document.createElement('h4');
    h.textContent = 'Donations vs Requests';
    container.appendChild(h);

    const wrapper = document.createElement('div');
    wrapper.className = 'analytics-chart-wrap';
    container.appendChild(wrapper);

    const c = document.createElement('canvas');
    c.id = 'analyticsMainChart';
    c.className = 'analytics-chart';
    wrapper.appendChild(c);

    const res = await fetch(`${ADMIN_API}/analytics/overview`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok) {
      container.innerHTML = '<div class="empty-state">Failed to load analytics</div>';
      return;
    }

    if (typeof Chart === 'undefined') {
      container.innerHTML += '<div class="empty-state">Chart.js not loaded</div>';
      return;
    }

    const ctx = c.getContext('2d');
    ctx.canvas._chart && ctx.canvas._chart.destroy();
    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Total Donations', 'Total Requests', 'Approvals', 'Rejections'],
        datasets: [{
          label: 'Counts',
          data: [data.totalDonations || 0, data.totalRequests || 0, data.approvals || 0, data.rejections || 0],
          backgroundColor: ['#2b8a3e', '#0d6efd', '#198754', '#dc3545']
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 2,
        plugins: { legend: { position: 'bottom' } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
      }
    });
    ctx.canvas._chart = chart;
  } catch (e) {
    console.error('Error rendering analytics tab:', e);
  }
}

function showAdminTab(tabName, event = null) {
  const adminRoot = document.getElementById('adminDashboard');
  if (!adminRoot) return;

  // Hide all tabs within admin dashboard only
  adminRoot.querySelectorAll('.tab-content').forEach(tab => {
    tab.classList.remove('active');
  });
  
  // Remove active class from all buttons within admin dashboard
  adminRoot.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  
  // Show selected tab
  const tabEl = adminRoot.querySelector(`#${tabName}Tab`);
  if (tabEl) tabEl.classList.add('active');
  
  // Add active class to clicked button (only if event is provided)
  if (event && event.currentTarget) {
    event.currentTarget.classList.add('active');
  } else {
    const tabButton = adminRoot.querySelector(`.tab-btn[data-tab="${tabName}"]`);
    if (tabButton) tabButton.classList.add('active');
  }
  
  // Load tab content
  const token = localStorage.getItem('token');
  if (tabName === 'medicines') {
    loadAdminMedicines(token);
  } else if (tabName === 'requests') {
    loadAdminRequests(token);
  } else if (tabName === 'users') {
    loadAdminUsers(token);
  } else if (tabName === 'analytics') {
    renderAnalyticsTab(token);
  }
}

async function loadAdminMedicines(token) {
  try {
    const res = await fetch(`${ADMIN_API}/medicines`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const medicines = await res.json();
    
    const container = document.getElementById('adminMedicines');
    container.innerHTML = medicines.map(medicine => {
      // Debug logging for missing fields
      if (!medicine.name || !medicine.status || !medicine.donor || !medicine.donor.name) {
        console.log("⚠️ Missing field in admin medicine record:", medicine);
      }

      return `
      <div class="admin-medicine-item">
        <div class="medicine-details">
          <h4>${medicine.name || 'Unknown Medicine'}</h4>
          <p><strong>Description:</strong> ${medicine.description || 'No description provided'}</p>
          <p><strong>Quantity:</strong> ${medicine.quantity || 'N/A'} | <strong>Expiry:</strong> ${medicine.expiryDate ? new Date(medicine.expiryDate).toLocaleDateString() : 'N/A'}</p>
          <p><strong>Status:</strong> <span class="status-${medicine.status ? medicine.status.toLowerCase() : 'unknown'}">${medicine.status || 'Unknown'}</span></p>
          <p><strong>Donor:</strong> ${medicine.donor && medicine.donor.name ? medicine.donor.name : 'Unknown'} (${medicine.donor && medicine.donor.email ? medicine.donor.email : 'N/A'})</p>
          ${medicine.requestedBy ? `<p><strong>Requested by:</strong> ${medicine.requestedBy.name || 'Unknown'} (${medicine.requestedBy.email || 'N/A'})</p>` : ''}
        </div>
        <div class="medicine-actions">
          ${medicine.status === 'CLAIMED' ? `
            <button class=\"btn green small admin-approve-btn\" data-id=\"${medicine._id}\" data-action=\"approve\">Approve</button>
            <button class=\"btn red small admin-approve-btn\" data-id=\"${medicine._id}\" data-action=\"reject\">Reject</button>
          ` : ''}
        </div>
      </div>
    `;
    }).join('');

    // Delegate click for approve/reject to satisfy CSP
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('.admin-approve-btn');
      if (!btn || !container.contains(btn)) return;
      const id = btn.getAttribute('data-id');
      const action = btn.getAttribute('data-action');
      if (id && action) approveMedicine(id, action);
    });
    
  } catch (e) {
    console.error('Error loading admin medicines:', e);
    document.getElementById('adminMedicines').innerHTML = '<div class="empty-state">Error loading medicines</div>';
  }
}

async function loadAdminRequests(token) {
  try {
    const res = await fetch(`${REQUEST_API}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const requests = await res.json();
    
    const container = document.getElementById('adminRequests');
    container.innerHTML = requests.map(request => {
      // Debug logging for missing fields
      if (!request.status || !request.medicineId || !request.medicineId.name || !request.recipientId || !request.recipientId.name) {
        console.log("⚠️ Missing field in admin request record:", request);
      }

      return `
      <div class="admin-medicine-item">
        <div class="medicine-details">
          <h4>${request.medicineId && request.medicineId.name ? request.medicineId.name : 'Unknown Medicine'}</h4>
          <p><strong>Requested by:</strong> ${request.recipientId && request.recipientId.name ? request.recipientId.name : 'Unknown'} (${request.recipientId && request.recipientId.email ? request.recipientId.email : 'N/A'})</p>
          <p><strong>Status:</strong> <span class="request-status status-${request.status ? request.status.toLowerCase() : 'unknown'}">${request.status || 'Unknown'}</span></p>
          <p><strong>Requested on:</strong> ${request.requestedAt ? new Date(request.requestedAt).toLocaleDateString() : 'N/A'}</p>
        </div>
        <div class="medicine-actions">
          ${request.status === 'PENDING' ? `
            <button class=\"btn green small admin-request-action\" data-id=\"${request._id}\" data-action=\"approve\">Approve</button>
            <button class=\"btn red small admin-request-action\" data-id=\"${request._id}\" data-action=\"reject\">Reject</button>
          ` : ''}
        </div>
      </div>
    `;
    }).join('');

    // Delegate click for request approve/reject to satisfy CSP
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('.admin-request-action');
      if (!btn || !container.contains(btn)) return;
      const id = btn.getAttribute('data-id');
      const action = btn.getAttribute('data-action');
      if (id && action) updateRequestStatus(id, action);
    });
    
  } catch (e) {
    console.error('Error loading admin requests:', e);
    document.getElementById('adminRequests').innerHTML = '<div class="empty-state">Error loading requests</div>';
  }
}

async function loadAdminUsers(token) {
  try {
    const res = await fetch(`${ADMIN_API}/users`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const users = await res.json();
    
    const container = document.getElementById('adminUsers');
    container.innerHTML = users.map(user => {
      // Debug logging for missing fields
      if (!user.name || !user.role) {
        console.log("⚠️ Missing field in admin user record:", user);
      }

      return `
      <div class="admin-user-item">
        <div class="user-details">
          <h4>${user.name || 'Unknown User'}</h4>
          <p><strong>Email:</strong> ${user.email || 'N/A'}</p>
          <p><strong>Role:</strong> <span class="user-role role-${user.role ? user.role.toLowerCase() : 'unknown'}">${user.role || 'Unknown'}</span></p>
          <p><strong>Status:</strong> <span class="status-${user.isActive ? 'active' : 'inactive'}">${user.isActive ? 'Active' : 'Inactive'}</span></p>
          <p><strong>Joined:</strong> ${user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}</p>
        </div>
      </div>
    `;
    }).join('');
    
  } catch (e) {
    console.error('Error loading admin users:', e);
    document.getElementById('adminUsers').innerHTML = '<div class="empty-state">Error loading users</div>';
  }
}

async function approveMedicine(medicineId, action) {
  try {
    const token = localStorage.getItem('token');
    const res = await fetch(`${ADMIN_API}/approve/${medicineId}`, {
      method: 'PUT',
      headers: { 
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ action })
    });
    
    const data = await res.json();
    if (res.ok) {
      alert(`Medicine request ${action}d successfully!`);
      loadAdminMedicines(token); // Reload medicines
    } else {
      alert(data.message || `Failed to ${action} medicine`);
    }
  } catch (e) {
    console.error(`Error ${action}ing medicine:`, e);
    alert(`Error ${action}ing medicine`);
  }
}

async function updateRequestStatus(requestId, action) {
  try {
    const token = localStorage.getItem('token');
    const res = await fetch(`${REQUEST_API}/${requestId}/${action}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` }
    });
    
    const data = await res.json();
    if (res.ok) {
      alert(`Request ${action}d successfully!`);
      loadAdminRequests(token); // Reload requests
    } else {
      alert(data.message || `Failed to ${action} request`);
    }
  } catch (e) {
    console.error(`Error ${action}ing request:`, e);
    alert(`Error ${action}ing request`);
  }
}

// Attach admin tab button handlers without inline attributes (CSP-safe)
document.addEventListener('DOMContentLoaded', () => {
  const adminRoot = document.getElementById('adminDashboard');
  if (!adminRoot) return;

  // Event delegation to robustly handle clicks within buttons
  adminRoot.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (!btn || !adminRoot.contains(btn)) return;
    e.preventDefault();
    const tab = btn.getAttribute('data-tab');
    if (!tab) return;
    showAdminTab(tab, { currentTarget: btn });
  });
});

// Initialize dashboard when page loads
document.addEventListener('DOMContentLoaded', loadDashboard);


