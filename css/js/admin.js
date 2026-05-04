const API_URL = "http://localhost:5000/api";
const ADMIN_API = `${API_URL}/admin`;

// Check if user is logged in and has ADMIN role
function checkAdminAuth() {
  const token = localStorage.getItem("token");
  if (!token) {
    alert("Please login first");
    window.location.href = "login.html";
    return false;
  }
  
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  if (user.role !== "ADMIN") {
    alert("This page requires ADMIN role");
    window.location.href = "index.html";
    return false;
  }
  
  return true;
}

// Tab switching functionality
document.addEventListener('DOMContentLoaded', function() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.dataset.tab;
      
      // Update active tab button
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      // Update active tab content
      tabContents.forEach(content => {
        content.classList.remove('active');
        if (content.id === `${targetTab}Tab`) {
          content.classList.add('active');
        }
      });
      
      // Load data for the selected tab
      if (targetTab === 'medicines') {
        loadAdminMedicines();
      } else if (targetTab === 'users') {
        loadAdminUsers();
      }
    });
  });
  
  // Load initial data
  if (checkAdminAuth()) {
    loadAdminMedicines();
  }
});

// Load medicines for admin view
async function loadAdminMedicines() {
  const medicinesList = document.getElementById("adminMedicinesList");
  const loading = document.getElementById("adminLoading");
  
  if (!medicinesList) return;
  
  try {
    loading.style.display = "block";
    medicinesList.innerHTML = "";
    
    const token = localStorage.getItem("token");
    const res = await fetch(`${ADMIN_API}/medicines`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    
    const medicines = await res.json();
    
    loading.style.display = "none";
    
    if (medicines.length === 0) {
      medicinesList.innerHTML = '<p>No medicines found</p>';
      return;
    }
    
    medicinesList.innerHTML = medicines.map(medicine => `
      <div class="admin-medicine-item">
        <div class="medicine-details">
          <h4>${medicine.name}</h4>
          <p><strong>Status:</strong> <span class="status-${medicine.status.toLowerCase()}">${medicine.status}</span></p>
          <p><strong>Donor:</strong> ${medicine.donor.name} (${medicine.donor.email})</p>
          <p><strong>Quantity:</strong> ${medicine.quantity}</p>
          <p><strong>Expires:</strong> ${new Date(medicine.expiryDate).toLocaleDateString()}</p>
          ${medicine.description ? `<p><strong>Description:</strong> ${medicine.description}</p>` : ''}
          ${medicine.requestedBy ? `<p><strong>Requested by:</strong> ${medicine.requestedBy.name} (${medicine.requestedBy.email})</p>` : ''}
        </div>
        <div class="medicine-actions">
          ${medicine.status === 'AVAILABLE' ? `
            <button class="btn small" disabled>No Action Needed</button>
          ` : medicine.status === 'CLAIMED' ? `
            <button class="btn green small approve-btn" data-id="${medicine._id}">Approve</button>
            <button class="btn red small reject-btn" data-id="${medicine._id}">Reject</button>
          ` : `
            <button class="btn small" disabled>Expired</button>
          `}
        </div>
      </div>
    `).join("");
    
    // Add event listeners to action buttons
    document.querySelectorAll('.approve-btn').forEach(btn => {
      btn.addEventListener('click', (e) => handleAdminAction(e.target.dataset.id, 'approve'));
    });
    
    document.querySelectorAll('.reject-btn').forEach(btn => {
      btn.addEventListener('click', (e) => handleAdminAction(e.target.dataset.id, 'reject'));
    });
    
  } catch (err) {
    loading.style.display = "none";
    medicinesList.innerHTML = '<p>Failed to load medicines</p>';
  }
}

// Load users for admin view
async function loadAdminUsers() {
  const usersList = document.getElementById("adminUsersList");
  const loading = document.getElementById("adminLoading");
  
  if (!usersList) return;
  
  try {
    loading.style.display = "block";
    usersList.innerHTML = "";
    
    const token = localStorage.getItem("token");
    const res = await fetch(`${ADMIN_API}/users`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    
    const users = await res.json();
    
    loading.style.display = "none";
    
    if (users.length === 0) {
      usersList.innerHTML = '<p>No users found</p>';
      return;
    }
    
    usersList.innerHTML = users.map(user => `
      <div class="admin-user-item">
        <div class="user-details">
          <h4>${user.name}</h4>
          <p><strong>Email:</strong> ${user.email}</p>
          <p><strong>Role:</strong> <span class="role-${user.role.toLowerCase()}">${user.role}</span></p>
          <p><strong>Joined:</strong> ${new Date(user.createdAt).toLocaleDateString()}</p>
          <p><strong>Status:</strong> <span class="status-${user.isActive ? 'active' : 'inactive'}">${user.isActive ? 'Active' : 'Inactive'}</span></p>
        </div>
      </div>
    `).join("");
    
  } catch (err) {
    loading.style.display = "none";
    usersList.innerHTML = '<p>Failed to load users</p>';
  }
}

// Handle admin approve/reject actions
async function handleAdminAction(medicineId, action) {
  if (!confirm(`Are you sure you want to ${action} this medicine request?`)) return;
  
  try {
    const token = localStorage.getItem("token");
    const res = await fetch(`${ADMIN_API}/approve/${medicineId}`, {
      method: "PUT",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ action })
    });
    
    const data = await res.json();
    
    if (res.ok) {
      alert(`Medicine request ${action}d successfully!`);
      loadAdminMedicines(); // Refresh the list
    } else {
      alert(data.message || `Failed to ${action} medicine request`);
    }
  } catch (err) {
    alert("Network error. Please try again.");
  }
}

// Load stats and render charts
async function loadAdminStats() {
  const token = localStorage.getItem("token");
  if (!token) return;
  try {
    const res = await fetch(`${ADMIN_API}/stats`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const stats = await res.json();
    if (!res.ok) return;

    // Render simple numbers if charts not present
    const container = document.getElementById('adminStats');
    if (container) {
      container.innerHTML = `
        <div class="stats-grid">
          <div class="stat"><span>Total Users</span><strong>${stats.totalUsers}</strong></div>
          <div class="stat"><span>Donors</span><strong>${stats.totalDonors}</strong></div>
          <div class="stat"><span>Recipients</span><strong>${stats.totalRecipients}</strong></div>
          <div class="stat"><span>Total Donations</span><strong>${stats.totalDonations}</strong></div>
          <div class="stat"><span>Total Requests</span><strong>${stats.totalRequests}</strong></div>
          <div class="stat"><span>Approved</span><strong>${stats.approved}</strong></div>
          <div class="stat"><span>Rejected</span><strong>${stats.rejected}</strong></div>
          <div class="stat"><span>Available</span><strong>${stats.availableMedicines}</strong></div>
          <div class="stat"><span>Expired</span><strong>${stats.expiredMedicines}</strong></div>
        </div>`;
    }

    // If Chart.js canvases exist, render charts
    const approvalsCanvas = document.getElementById('approvalsChart');
    if (approvalsCanvas && window.Chart) {
      const ctx = approvalsCanvas.getContext('2d');
      new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: ['Approved', 'Rejected'],
          datasets: [{ data: [stats.approved, stats.rejected], backgroundColor: ['#2b8a3e', '#dc3545'] }]
        },
        options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
      });
    }

    const inventoryCanvas = document.getElementById('inventoryChart');
    if (inventoryCanvas && window.Chart) {
      const ctx2 = inventoryCanvas.getContext('2d');
      new Chart(ctx2, {
        type: 'bar',
        data: {
          labels: ['Available', 'Expired'],
          datasets: [{ label: 'Medicines', data: [stats.availableMedicines, stats.expiredMedicines], backgroundColor: ['#0d6efd', '#6c757d'] }]
        },
        options: { responsive: true, plugins: { legend: { display: false } } }
      });
    }
  } catch (_) {}
}

// Hook stats load after auth check
document.addEventListener('DOMContentLoaded', function() {
  if (checkAdminAuth()) {
    loadAdminStats();
  }
});