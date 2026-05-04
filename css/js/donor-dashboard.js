const API_BASE = `${window.location.origin}/api`;
const token = localStorage.getItem("token");
const role = (localStorage.getItem("role") || "").toUpperCase();

if (!token || role !== "DONOR") {
  window.location.href = "login.html";
}

function ensureDonor() {
  const token = localStorage.getItem("token");
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  if (!token) {
    alert("Please login first");
    window.location.href = "login.html";
    return false;
  }
  if (user.role !== "DONOR") {
    alert("This page requires DONOR role");
    window.location.href = "login.html";
    return false;
  }
  return true;
}

async function loadDonorMedicines() {
  if (!ensureDonor()) return;

  const tbody = document.getElementById("donorMedicinesBody");
  const loading = document.getElementById("donorLoading");
  const empty = document.getElementById("donorEmpty");

  loading.style.display = "block";
  empty.style.display = "none";
  tbody.innerHTML = "";

  try {
    const token = localStorage.getItem("token");
    const res = await fetch(`${API_BASE}/medicines/donor/medicines`, {
      headers: { "Authorization": `Bearer ${token}` }
    });

    const items = await res.json();
    loading.style.display = "none";

    if (!Array.isArray(items) || items.length === 0) {
      empty.style.display = "block";
      return;
    }

    tbody.innerHTML = items.map(m => {
      const dateStr = new Date(m.expiryDate).toLocaleDateString();
      return `
        <tr>
          <td>${m.name}</td>
          <td>${m.quantity}</td>
          <td>${dateStr}</td>
          <td>${m.status}</td>
        </tr>
      `;
    }).join("");
  } catch (err) {
    loading.style.display = "none";
    alert("Failed to load your donations");
  }
}

document.addEventListener('DOMContentLoaded', loadDonorMedicines);


