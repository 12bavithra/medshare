const API_BASE = `${window.location.origin}/api`;
const ADMIN_API = `${API_BASE}/admin`;
const token = localStorage.getItem("token");
const role = (localStorage.getItem("role") || "RECIPIENT").toUpperCase();

if (!token) {
  window.location.href = "login.html";
}
console.log("TOKEN:", token);
console.log("ROLE:", role);

async function fetchWithAuth(path, method = "GET", body = null) {
  const token = localStorage.getItem("token");
  const url = `${API_BASE}${path}`;
  console.log("API:", url);
  console.log("TOKEN:", token);

  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: body ? JSON.stringify(body) : undefined
  });

  console.log("Response status:", res.status);

  if (res.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("role");
    window.location.href = "login.html";
    return { ok: false, data: null };
  }

  let data;
  try {
    data = await res.json();
    console.log("API Response:", data);
  } catch (err) {
    console.error("Invalid JSON:", err);
    return { ok: false, data: null };
  }

  return { ok: res.ok, data };
}

function extractItems(data) {
  console.log("FULL API RESPONSE:", data);
  console.log("Received data:", data);
  const items = data?.data || data?.medicines || data?.users || data?.requests || data;
  if (!items || items.length === 0) return [];
  if (!Array.isArray(items)) {
    console.error("Expected array but got:", items);
    return null;
  }
  return items;
}

// Check if user is logged in
function checkAdminAuth() {
  if (!token) {
    alert("Please login first");
    window.location.href = "login.html";
    return false;
  }
  
  return true;
}

let medicinesRequestSeq = 0;
let medicinesRenderSeq = 0;
let adminChartInstance = null;

function renderChart(data) {
  const canvas = document.getElementById("adminChart");
  if (!canvas) {
    console.warn("adminChart canvas not found");
    return;
  }
  if (typeof window.Chart === "undefined") {
    console.warn("Chart.js is not loaded");
    return;
  }

  const medicines = extractItems(data);
  if (!Array.isArray(medicines)) {
    return;
  }

  const statusCounts = {
    AVAILABLE: 0,
    PENDING: 0,
    REJECTED: 0
  };

  medicines.forEach((medicine) => {
    const status = (medicine?.status || "").toUpperCase();
    if (Object.prototype.hasOwnProperty.call(statusCounts, status)) {
      statusCounts[status] += 1;
    }
  });

  const chartData = [
    statusCounts.AVAILABLE,
    statusCounts.PENDING,
    statusCounts.REJECTED
  ];

  console.log("Chart debug data:", { statusCounts, chartData, medicines });

  if (adminChartInstance) {
    adminChartInstance.destroy();
  }

  adminChartInstance = new Chart(canvas, {
    type: "bar",
    data: {
      labels: ["AVAILABLE", "PENDING", "REJECTED"],
      datasets: [
        {
          label: "Medicines by Status",
          data: chartData,
          backgroundColor: ["#0d6efd", "#ffc107", "#dc3545"]
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false
    }
  });
}

async function initializeAdminDashboard() {
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
    await loadAdminMedicines();
    await loadAdminUsers();
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  console.log("Dashboard loaded");
  await initializeAdminDashboard();
});

function loadMedicines() {
  return loadAdminMedicines();
}

function loadUsers() {
  return loadAdminUsers();
}

// Load medicines for admin view
async function loadAdminMedicines() {
  const medicinesList = document.getElementById("adminMedicinesList");
  const loading = document.getElementById("adminLoading");
  
  if (!medicinesList) return;
  const requestId = ++medicinesRequestSeq;
  
  try {
    loading.style.display = "block";
    medicinesList.innerHTML = "";
    
    const { ok, data } = await fetchWithAuth("/admin/medicines");
    renderChart(data);
    const medicines = extractItems(data);
    if (!ok || medicines === null) {
      loading.style.display = "none";
      medicinesList.innerHTML = '<p>Failed to load medicines</p>';
      return;
    }
    
    loading.style.display = "none";
    if (requestId < medicinesRenderSeq) return;
    medicinesRenderSeq = requestId;
    
    if (medicines.length === 0) {
      medicinesList.innerHTML = '<p>No medicines found</p>';
      return;
    }

    console.log("Final medicines used for render:", medicines);
    medicinesList.innerHTML = "";
    medicines.forEach((medicine) => {
      medicinesList.insertAdjacentHTML("beforeend", `
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
    `);
    });
    
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
    
    const { ok, data } = await fetchWithAuth("/admin/users");
    const users = extractItems(data);
    if (!ok || users === null) {
      loading.style.display = "none";
      usersList.innerHTML = '<p>Failed to load users</p>';
      return;
    }
    
    loading.style.display = "none";
    
    if (users.length === 0) {
      usersList.innerHTML = '<p>No users found</p>';
      return;
    }

    usersList.innerHTML = "";
    users.forEach((user) => {
      usersList.insertAdjacentHTML("beforeend", `
      <div class="admin-user-item">
        <div class="user-details">
          <h4>${user.name}</h4>
          <p><strong>Email:</strong> ${user.email}</p>
          <p><strong>Role:</strong> <span class="role-${user.role.toLowerCase()}">${user.role}</span></p>
          <p><strong>Joined:</strong> ${new Date(user.createdAt).toLocaleDateString()}</p>
          <p><strong>Status:</strong> <span class="status-${user.isActive ? 'active' : 'inactive'}">${user.isActive ? 'Active' : 'Inactive'}</span></p>
        </div>
      </div>
    `);
    });
    
  } catch (err) {
    loading.style.display = "none";
    usersList.innerHTML = '<p>Failed to load users</p>';
  }
}

// Handle admin approve/reject actions
async function handleAdminAction(medicineId, action) {
  if (!confirm(`Are you sure you want to ${action} this medicine request?`)) return;
  
  try {
    const { ok, data } = await fetchWithAuth(`/admin/approve/${medicineId}`, "PUT", { action });
    
    if (ok) {
      alert(`Medicine request ${action}d successfully!`);
      loadAdminMedicines(); // Refresh the list
    } else {
      alert(data.message || `Failed to ${action} medicine request`);
    }
  } catch (err) {
    alert("Network error. Please try again.");
  }
}

function logout() {
  localStorage.clear();
  window.location.href = "login.html";
}
