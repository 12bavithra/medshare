const AUTH_API_BASE = `${window.location.origin}/api/auth`;

async function parseResponseSafely(res) {
  const raw = await res.text();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { message: raw };
  }
}

// Handle Register
const registerForm = document.getElementById("registerForm");
if (registerForm) {
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("name").value;
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;
    const role = document.getElementById("role").value;

    const res = await fetch(`${AUTH_API_BASE}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, role })
    });

    const data = await parseResponseSafely(res);
    if (!res.ok) {
      alert(data.message || "Registration failed");
      return;
    }
    alert(data.message || "User registered!");
  });
}

// Handle Login
const loginForm = document.getElementById("loginForm");
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("loginEmail").value;
    const password = document.getElementById("loginPassword").value;

    const res = await fetch(`${AUTH_API_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    const data = await parseResponseSafely(res);
    if (data.token) {
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      alert("Login successful!");
      // Redirect to role-based dashboard page
      const role = (data.user?.role || '').toUpperCase();
      if (role === 'DONOR') {
        window.location.href = "donor-dashboard.html";
      } else if (role === 'RECIPIENT') {
        window.location.href = "recipient-dashboard.html";
      } else if (role === 'ADMIN') {
        window.location.href = "admin.html";
      } else {
        window.location.href = "index.html";
      }
    } else {
      alert(data.message || "Login failed");
    }
  });
}

// Handle Who am I
const whoAmIButton = document.getElementById("whoAmI");
if (whoAmIButton) {
  whoAmIButton.addEventListener("click", async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      alert("Not logged in");
      return;
    }
    try {
      const res = await fetch(`${AUTH_API_BASE}/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await parseResponseSafely(res);
      if (!res.ok) {
        alert(data.message || "Failed to fetch user");
        return;
      }
      alert(`You are ${data.name} (${data.email}) [${data.role}]`);
    } catch (e) {
      alert("Network error");
    }
  });
}
