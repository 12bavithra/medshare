const API_URL = "http://localhost:5000/api";
const AUTH_API = `${API_URL}/auth`;
const MEDICINE_API = `${API_URL}/medicines`;

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
      const token = localStorage.getItem("token");
      const res = await fetch(`${MEDICINE_API}/add`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ name, description, expiryDate, quantity })
      });
      
      const data = await res.json();
      
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
    
    const token = localStorage.getItem("token");
    if (!token) {
      window.location.href = "login.html";
      return;
    }
    
    const res = await fetch(`${MEDICINE_API}`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    
    const medicines = await res.json();
    
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
    const token = localStorage.getItem("token");
    const res = await fetch(`${MEDICINE_API}/request/${medicineId}`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}` }
    });
    
    const data = await res.json();
    
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

// Load medicines when page loads (for medicines.html)
if (document.getElementById("medicinesGrid")) {
  loadMedicines();
}
