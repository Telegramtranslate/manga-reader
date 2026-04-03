const AUTH_STORAGE_KEY = "animecloud_auth_v1";
const GOOGLE_CLIENT_FALLBACK = "263581962151-lvpcil2qlnv9btimsvsgtth0bm2cbl3v.apps.googleusercontent.com";

const authEls = {
  openBtn: document.getElementById("auth-open-btn"),
  userMenu: document.getElementById("user-menu"),
  userChip: document.getElementById("user-chip"),
  userAvatar: document.getElementById("user-avatar"),
  userName: document.getElementById("user-name"),
  userEmail: document.getElementById("user-email"),
  logoutBtn: document.getElementById("logout-btn"),
  modal: document.getElementById("auth-modal"),
  backdrop: document.getElementById("auth-backdrop"),
  closeBtn: document.getElementById("auth-close"),
  tabs: [...document.querySelectorAll(".auth-tab[data-auth-tab]")],
  loginForm: document.getElementById("login-form"),
  registerForm: document.getElementById("register-form"),
  loginEmail: document.getElementById("login-email"),
  loginPassword: document.getElementById("login-password"),
  registerEmail: document.getElementById("register-email"),
  registerPassword: document.getElementById("register-password"),
  registerPasswordConfirm: document.getElementById("register-password-confirm"),
  status: document.getElementById("auth-status"),
  googleButton: document.getElementById("google-auth-button"),
  googleNote: document.getElementById("google-auth-note")
};

const authState = {
  tab: "login",
  session: null,
  googleClientId: "",
  googleInitialized: false,
  googleLoading: false
};

function readSession() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSession(session) {
  authState.session = session;
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  renderAuthState();
  window.dispatchEvent(new CustomEvent("animecloud:auth", { detail: { user: session } }));
}

function clearSession() {
  authState.session = null;
  localStorage.removeItem(AUTH_STORAGE_KEY);
  renderAuthState();
  window.dispatchEvent(new CustomEvent("animecloud:auth", { detail: { user: null } }));
}

function deriveName(session) {
  if (session?.displayName) return session.displayName;
  if (session?.email) return session.email.split("@")[0];
  return "Гость";
}

function normalizeSession(data, current = null) {
  const expiresIn = Number(data.expiresIn || data.expires_in || 3600);
  return {
    idToken: data.idToken || data.id_token || current?.idToken || "",
    refreshToken: data.refreshToken || data.refresh_token || current?.refreshToken || "",
    localId: data.localId || data.user_id || current?.localId || "",
    email: data.email || current?.email || "",
    displayName: data.displayName || current?.displayName || "",
    photoUrl: data.photoUrl || current?.photoUrl || "",
    providerId: data.providerId || current?.providerId || "",
    expiresAt: Date.now() + expiresIn * 1000 - 60000
  };
}

function setStatus(message, type = "") {
  authEls.status.textContent = message;
  authEls.status.className = "auth-status";
  if (type) authEls.status.classList.add(type);
}

function setFormDisabled(form, disabled) {
  [...form.querySelectorAll("input, button")].forEach((node) => {
    node.disabled = disabled;
  });
}

function mapAuthError(error) {
  const code = error?.message || error?.error?.message || "";
  const map = {
    EMAIL_EXISTS: "Этот email уже зарегистрирован.",
    EMAIL_NOT_FOUND: "Аккаунт с таким email не найден.",
    INVALID_PASSWORD: "Неверный пароль.",
    INVALID_LOGIN_CREDENTIALS: "Неверный email или пароль.",
    TOO_MANY_ATTEMPTS_TRY_LATER: "Слишком много попыток. Повторите позже.",
    OPERATION_NOT_ALLOWED: "Этот способ входа не включён в проекте Firebase.",
    INVALID_IDP_RESPONSE: "Google-вход вернул некорректный ответ.",
    FEDERATED_USER_ID_ALREADY_LINKED: "Этот Google-аккаунт уже привязан к другому профилю.",
    INVALID_EMAIL: "Некорректный email.",
    WEAK_PASSWORD: "Пароль слишком простой. Используйте минимум 6 символов."
  };
  return map[code] || "Не удалось выполнить авторизацию.";
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    throw data.error || data;
  }
  return data;
}

async function postForm(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    throw data.error || data;
  }
  return data;
}

function openAuthModal() {
  authEls.modal.hidden = false;
  document.body.style.overflow = "hidden";
  setStatus("");
  renderGoogleButton();
}

function closeAuthModal() {
  authEls.modal.hidden = true;
  document.body.style.overflow = "";
  setStatus("");
}

function setAuthTab(tab) {
  authState.tab = tab;
  authEls.tabs.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.authTab === tab);
  });
  authEls.loginForm.classList.toggle("is-active", tab === "login");
  authEls.registerForm.classList.toggle("is-active", tab === "register");
  setStatus("");
}

function renderAuthState() {
  const session = authState.session;
  const loggedIn = Boolean(session?.idToken);

  authEls.openBtn.hidden = loggedIn;
  authEls.userMenu.hidden = !loggedIn;
  authEls.userName.textContent = deriveName(session);
  authEls.userEmail.textContent = session?.email || "Вход не выполнен";
  authEls.userAvatar.src = session?.photoUrl || "./mc-icon-192.png?v=4";
}

async function refreshSessionIfNeeded() {
  const session = authState.session;
  if (!session?.refreshToken) return;
  if (session.expiresAt && session.expiresAt > Date.now()) return;

  const data = await postForm("/api/securetoken", {
    grant_type: "refresh_token",
    refresh_token: session.refreshToken
  });

  writeSession(normalizeSession(data, session));
}

async function signInWithEmail(email, password) {
  const data = await postJson("/api/identity/accounts:signInWithPassword", {
    email,
    password,
    returnSecureToken: true
  });
  writeSession(normalizeSession(data, { email, providerId: "password" }));
}

async function signUpWithEmail(email, password) {
  const data = await postJson("/api/identity/accounts:signUp", {
    email,
    password,
    returnSecureToken: true
  });
  writeSession(normalizeSession(data, { email, providerId: "password" }));
}

async function resolveGoogleClientId() {
  try {
    const data = await postJson("/api/identity/accounts:createAuthUri", {
      providerId: "google.com",
      continueUri: window.location.origin
    });
    const authUri = data.authUri || "";
    const clientId = authUri ? new URL(authUri).searchParams.get("client_id") : "";
    return clientId || GOOGLE_CLIENT_FALLBACK;
  } catch {
    return GOOGLE_CLIENT_FALLBACK;
  }
}

async function handleGoogleCredential(response) {
  if (!response?.credential) {
    setStatus("Google не вернул credential.", "is-error");
    return;
  }

  try {
    setStatus("Выполняем вход через Google…");
    const data = await postJson("/api/identity/accounts:signInWithIdp", {
      postBody: `id_token=${encodeURIComponent(response.credential)}&providerId=google.com`,
      requestUri: window.location.origin,
      returnIdpCredential: true,
      returnSecureToken: true
    });
    writeSession(normalizeSession(data, { providerId: "google.com" }));
    setStatus("Вход выполнен.", "is-success");
    closeAuthModal();
    window.dispatchEvent(new CustomEvent("animecloud:profile-request"));
  } catch (error) {
    setStatus(mapAuthError(error), "is-error");
  }
}

async function renderGoogleButton() {
  if (authState.googleLoading) return;
  if (!window.google?.accounts?.id) {
    authEls.googleNote.textContent = "Google-вход пока не загрузился.";
    return;
  }

  try {
    authState.googleLoading = true;
    if (!authState.googleClientId) {
      authState.googleClientId = await resolveGoogleClientId();
    }

    if (!authState.googleInitialized) {
      window.google.accounts.id.initialize({
        client_id: authState.googleClientId,
        callback: handleGoogleCredential,
        use_fedcm_for_prompt: true
      });
      authState.googleInitialized = true;
    }

    authEls.googleButton.innerHTML = "";
    window.google.accounts.id.renderButton(authEls.googleButton, {
      theme: "filled_black",
      size: "large",
      shape: "pill",
      text: "signin_with",
      logo_alignment: "left",
      width: Math.max(280, authEls.googleButton.clientWidth || 320)
    });
    authEls.googleNote.textContent = "Google-вход готов.";
  } catch {
    authEls.googleNote.textContent = "Не удалось инициализировать Google-вход.";
  } finally {
    authState.googleLoading = false;
  }
}

function bindAuthEvents() {
  authEls.openBtn.addEventListener("click", openAuthModal);
  authEls.closeBtn.addEventListener("click", closeAuthModal);
  authEls.backdrop.addEventListener("click", closeAuthModal);
  authEls.logoutBtn.addEventListener("click", clearSession);
  authEls.userChip.addEventListener("click", () => {
    window.dispatchEvent(new CustomEvent("animecloud:profile-request"));
  });

  authEls.tabs.forEach((button) => {
    button.addEventListener("click", () => setAuthTab(button.dataset.authTab));
  });

  authEls.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setFormDisabled(authEls.loginForm, true);
    setStatus("Входим…");
    try {
      await signInWithEmail(authEls.loginEmail.value.trim(), authEls.loginPassword.value);
      setStatus("Вход выполнен.", "is-success");
      closeAuthModal();
      window.dispatchEvent(new CustomEvent("animecloud:profile-request"));
    } catch (error) {
      setStatus(mapAuthError(error), "is-error");
    } finally {
      setFormDisabled(authEls.loginForm, false);
    }
  });

  authEls.registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (authEls.registerPassword.value !== authEls.registerPasswordConfirm.value) {
      setStatus("Пароли не совпадают.", "is-error");
      return;
    }

    setFormDisabled(authEls.registerForm, true);
    setStatus("Создаём аккаунт…");
    try {
      await signUpWithEmail(authEls.registerEmail.value.trim(), authEls.registerPassword.value);
      setStatus("Аккаунт создан.", "is-success");
      closeAuthModal();
      window.dispatchEvent(new CustomEvent("animecloud:profile-request"));
    } catch (error) {
      setStatus(mapAuthError(error), "is-error");
    } finally {
      setFormDisabled(authEls.registerForm, false);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !authEls.modal.hidden) {
      closeAuthModal();
    }
  });
}

async function initAuth() {
  bindAuthEvents();
  setAuthTab("login");
  authState.session = readSession();

  try {
    await refreshSessionIfNeeded();
  } catch {
    clearSession();
  }

  renderAuthState();
  setTimeout(() => {
    renderGoogleButton().catch(() => {});
  }, 400);
}

initAuth().catch(() => {
  setStatus("Не удалось инициализировать авторизацию.", "is-error");
});
