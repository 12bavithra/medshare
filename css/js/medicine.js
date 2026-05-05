const API_BASE = `${window.location.origin}/api`;
const MEDICINE_API = `${API_BASE}/medicines`;

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
  if (Array.isArray(data?.medicines)) return data.medicines;
  if (Array.isArray(data?.requests)) return data.requests;
  return [];
}

// Check if user is logged in and has required role
function checkAuth(requiredRole = null) {
  const token = localStorage.getItem("token");
  if (!token) {
    alert("Please login first");
    window.location.href = "login.html";
    return false;
  }
  
  if (requiredRole) {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    if (user.role !== requiredRole) {
      alert(`This page requires ${requiredRole} role`);
      window.location.href = "index.html";
      return false;
    }
  }
  
  return true;
}

// Handle Donate Form
const donateForm = document.getElementById("donateForm");
if (donateForm) {
  donateForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    if (!checkAuth("DONOR")) return;
    
    const name = document.getElementById("name").value;
    const description = document.getElementById("description").value;
    const expiryDate = document.getElementById("expiryDate").value;
    const quantity = document.getElementById("quantity").value;
    
    try {
      console.log("API URL:", `${API_BASE}/medicines/add`);
      const res = await fetch(`${MEDICINE_API}/add`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ name, description, expiryDate, quantity })
      });
      
      const data = await res.json();
      console.log("API Response:", data);
      
      if (res.ok) {
        alert("Medicine donated successfully!");
        donateForm.reset();
      } else {
        alert(data.message || "Failed to donate medicine");
      }
    } catch (err) {
      alert("Network error. Please try again.");
    }
  });
}

// Load and display medicines
async function loadMedicines() {
  const medicinesGrid = document.getElementById("medicinesGrid");
  const loading = document.getElementById("loading");
  const emptyState = document.getElementById("emptyState");
  
  if (!medicinesGrid) return;
  
  try {
    loading.style.display = "block";
    medicinesGrid.style.display = "none";
    emptyState.style.display = "none";
    
    if (!localStorage.getItem("token")) {
      window.location.href = "login.html";
      return;
    }
    
    const res = await fetch(`${MEDICINE_API}`, {
      headers: getAuthHeaders()
    });
    
    const data = await res.json();
    const medicines = extractArrayResponse(data);
    
    loading.style.display = "none";
    
    if (medicines.length === 0) {
      emptyState.style.display = "block";
      return;
    }
    
    medicinesGrid.style.display = "grid";
    medicinesGrid.innerHTML = medicines.map(medicine => `
      <div class="medicine-card">
        <div class="medicine-info">
          <h3>${medicine.name}</h3>
          <p class="description">${medicine.description || 'No description'}</p>
          <div class="medicine-details">
            <span class="expiry">Expires: ${new Date(medicine.expiryDate).toLocaleDateString()}</span>
            <span class="quantity">Quantity: ${medicine.quantity}</span>
          </div>
          <p class="donor">Donated by: ${medicine.donor.name}</p>
        </div>
        <div class="medicine-actions">
          <button class="btn green request-btn" data-id="${medicine._id}">
            Request Medicine
          </button>
        </div>
      </div>
    `).join("");
    
    // Add event listeners to request buttons
    document.querySelectorAll('.request-btn').forEach(btn => {
      btn.addEventListener('click', handleRequest);
    });
    
  } catch (err) {
    loading.style.display = "none";
    alert("Failed to load medicines");
  }
}

// Handle medicine request
async function handleRequest(e) {
  const medicineId = e.target.dataset.id;
  
  if (!checkAuth("RECIPIENT")) return;
  
  if (!confirm("Are you sure you want to request this medicine?")) return;
  
  try {
    const res = await fetch(`${API_BASE}/requests/${medicineId}`, {
      method: "POST",
      headers: getAuthHeaders()
    });
    
    const data = await res.json();
    console.log("API Response:", data);
    
    if (res.ok) {
      alert("Medicine requested successfully!");
      loadMedicines(); // Refresh the list
    } else {
      alert(data.message || "Failed to request medicine");
    }
  } catch (err) {
    alert("Network error. Please try again.");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("medicinesGrid")) {
    loadMedicines();
  }
});
