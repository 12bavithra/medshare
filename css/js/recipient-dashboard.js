const API_BASE = `${window.location.origin}/api`;
const token = localStorage.getItem("token");
const role = (localStorage.getItem("role") || "RECIPIENT").toUpperCase();

if (!token) {
  window.location.href = "login.html";
}
console.log("TOKEN:", token);
console.log("ROLE:", role);

async function fetchWithAuth(path, method = "GET") {
  const token = localStorage.getItem("token");
  const url = `${API_BASE}${path}`;
  console.log("API:", url);
  console.log("TOKEN:", token);

  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    }
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
  const items = data?.data || data?.medicines || data?.users || data?.requests || data;
  if (!items || items.length === 0) return [];
  if (!Array.isArray(items)) {
    console.error("Expected array but got:", items);
    return null;
  }
  return items;
}

function ensureRecipient() {
  const token = localStorage.getItem("token");
  if (!token) {
    alert("Please login first");
    window.location.href = "login.html";
    return false;
  }
  return true;
}

async function loadRecipientRequests() {
  if (!ensureRecipient()) return;

  const tbody = document.getElementById("recipientRequestsBody");
  const loading = document.getElementById("recipientLoading");
  const empty = document.getElementById("recipientEmpty");

  loading.style.display = "block";
  empty.style.display = "none";
  tbody.innerHTML = "";

  try {
    const { ok, data } = await fetchWithAuth("/medicines/recipient/requests");
    const items = extractItems(data);
    if (!ok) {
      loading.style.display = "none";
      alert("Failed to load your requests");
      return;
    }
    if (items === null) {
      loading.style.display = "none";
      alert("Failed to load your requests");
      return;
    }
    loading.style.display = "none";

    if (!Array.isArray(items) || items.length === 0) {
      empty.style.display = "block";
      return;
    }

    tbody.innerHTML = items.map(m => `
      <tr>
        <td>${m.name}</td>
        <td>${m.donor?.name || 'Unknown'}</td>
        <td>${m.status === 'CLAIMED' ? 'Approved' : m.status === 'AVAILABLE' ? 'Rejected' : m.status}</td>
      </tr>
    `).join("");
  } catch (err) {
    loading.style.display = "none";
    alert("Failed to load your requests");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  console.log("Dashboard loaded");
  if (typeof loadMedicines === "function") loadMedicines();
  if (typeof loadUsers === "function") loadUsers();
  if (typeof loadRequests === "function") loadRequests();
});

function loadRequests() {
  return loadRecipientRequests();
}


