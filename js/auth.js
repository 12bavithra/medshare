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

function getRoleRedirect(role) {
  const normalizedRole = (role || "").toString().toUpperCase();
  if (normalizedRole === "ADMIN") return "admin.html";
  if (normalizedRole === "DONOR") return "donor-dashboard.html";
  return "dashboard.html";
}

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  localStorage.removeItem("role");
  window.location.href = "login.html";
}

// Handle Register
const registerForm = document.getElementById("registerForm");
const loginForm = document.getElementById("loginForm");
const existingToken = localStorage.getItem("token");
const existingRole =
  localStorage.getItem("role") ||
  (() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "{}").role || "";
    } catch {
      return "";
    }
  })();

if (existingToken && (loginForm || registerForm)) {
  window.location.href = getRoleRedirect(existingRole);
}

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
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("loginEmail").value;
    const password = document.getElementById("loginPassword").value;

    try {
      const res = await fetch(`${AUTH_API_BASE}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });

      const data = await parseResponseSafely(res);
      if (!res.ok || !data.token) {
        alert(data.message || "Login failed");
        return;
      }

      const role = (data.user && data.user.role) || "";
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user || {}));
      localStorage.setItem("role", role);
      alert("Login successful!");
      window.location.href = getRoleRedirect(role);
    } catch (e) {
      alert("Network error");
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

const logoutLink = document.getElementById("logoutLink");
if (logoutLink) {
  logoutLink.addEventListener("click", (e) => {
    e.preventDefault();
    logout();
  });
}
