const API_BASE = `${window.location.origin}/api`;
const token = localStorage.getItem("token");
const role = (localStorage.getItem("role") || "").toUpperCase();

if (!token || role !== "DONOR") {
  window.location.href = "login.html";
}

async function fetchWithAuth(path, method = "GET") {
  const token = localStorage.getItem("token");
  const url = `${API_BASE}${path}`;
  console.log("Calling API:", url);
  console.log("Token:", token);

  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    }
  });

  console.log("Response status:", res.status);

  let data;
  try {
    data = await res.json();
  } catch (err) {
    console.error("Invalid JSON response", err);
    return { ok: false, data: null };
  }

  return { ok: res.ok, data };
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
    const { ok, data } = await fetchWithAuth("/medicines/donor/medicines");
    if (!ok) {
      loading.style.display = "none";
      alert("Failed to load your donations");
      return;
    }
    const items = data;
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


