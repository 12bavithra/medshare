const API_URL = "http://localhost:5000/api";
const MEDICINE_API = `${API_URL}/medicines`;

function ensureRecipient() {
  const token = localStorage.getItem("token");
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  if (!token) {
    alert("Please login first");
    window.location.href = "login.html";
    return false;
  }
  if (user.role !== "RECIPIENT") {
    alert("This page requires RECIPIENT role");
    window.location.href = "index.html";
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
    const token = localStorage.getItem("token");
    const res = await fetch(`${MEDICINE_API}/recipient/requests`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const items = await res.json();
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

document.addEventListener('DOMContentLoaded', loadRecipientRequests);


