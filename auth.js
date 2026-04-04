const AUTH_STORAGE_KEY = "animecloud_auth_v1";
const GOOGLE_POPUP_MESSAGE_TYPE = "animecloud-google-auth";
const GOOGLE_POPUP_NAME = "animecloud_google_signin";

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
  googleLoading: false,
  googlePopup: null,
  googlePopupPoller: 0
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

async function exchangeGoogleIdToken(idToken) {
  const data = await postJson("/api/identity/accounts:signInWithIdp", {
    postBody: `id_token=${encodeURIComponent(idToken)}&providerId=google.com`,
    requestUri: window.location.origin,
    returnIdpCredential: true,
    returnSecureToken: true
  });
  writeSession(normalizeSession(data, { providerId: "google.com" }));
  setStatus("Вход выполнен.", "is-success");
  authEls.googleNote.textContent = "Google-вход выполнен.";
  closeAuthModal();
  window.dispatchEvent(new CustomEvent("animecloud:profile-request"));
}

function renderGoogleButton() {
  authEls.googleButton.innerHTML = "";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "primary-btn google-auth-launch";
  button.textContent = authState.googleLoading ? "Подождите…" : "Войти через Google";
  button.disabled = authState.googleLoading;
  button.addEventListener("click", () => {
    startGoogleSignIn().catch((error) => {
      console.error(error);
      setStatus("Не удалось подготовить Google-вход.", "is-error");
      authEls.googleNote.textContent = "Не удалось подготовить Google-вход.";
      authState.googleLoading = false;
      renderGoogleButton();
    });
  });

  authEls.googleButton.appendChild(button);

  if (!authEls.googleNote.textContent.trim()) {
    authEls.googleNote.textContent = "Google-вход готов.";
  }
}

function clearGooglePopupPoller() {
  if (authState.googlePopupPoller) {
    window.clearInterval(authState.googlePopupPoller);
    authState.googlePopupPoller = 0;
  }
}

function cleanupGooglePopup(note = "") {
  clearGooglePopupPoller();
  authState.googlePopup = null;
  authState.googleLoading = false;
  renderGoogleButton();
  if (note) authEls.googleNote.textContent = note;
}

function openGooglePopup(url) {
  const width = 520;
  const height = 720;
  const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - width) / 2));
  const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - height) / 2));
  return window.open(
    url,
    GOOGLE_POPUP_NAME,
    `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
  );
}

async function resolveGoogleAuthUri() {
  const data = await postJson("/api/identity/accounts:createAuthUri", {
    providerId: "google.com",
    continueUri: window.location.origin
  });
  if (!data.authUri) {
    throw new Error("GOOGLE_AUTH_URI_MISSING");
  }
  return data.authUri;
}

async function startGoogleSignIn() {
  if (authState.googleLoading) return;

  authState.googleLoading = true;
  renderGoogleButton();
  setStatus("");
  authEls.googleNote.textContent = "Открываем окно Google…";

  try {
    const authUri = await resolveGoogleAuthUri();
    const popup = openGooglePopup(authUri);

    if (!popup) {
      cleanupGooglePopup("Браузер заблокировал всплывающее окно. Разрешите popup для этого сайта.");
      return;
    }

    authState.googlePopup = popup;
    authEls.googleNote.textContent = "Продолжите вход в новом окне Google.";
    clearGooglePopupPoller();
    authState.googlePopupPoller = window.setInterval(() => {
      if (authState.googlePopup && authState.googlePopup.closed) {
        cleanupGooglePopup("Окно Google было закрыто до завершения входа.");
      }
    }, 500);
  } catch (error) {
    console.error(error);
    cleanupGooglePopup("Не удалось подготовить Google-вход.");
    setStatus(mapAuthError(error), "is-error");
  }
}

async function handleGooglePopupResult(payload) {
  clearGooglePopupPoller();
  if (authState.googlePopup && !authState.googlePopup.closed) {
    authState.googlePopup.close();
  }
  authState.googlePopup = null;

  if (payload?.error) {
    authState.googleLoading = false;
    renderGoogleButton();
    authEls.googleNote.textContent =
      payload.error === "access_denied" ? "Вход через Google отменён." : "Google вернул ошибку авторизации.";
    setStatus("Не удалось выполнить вход через Google.", "is-error");
    return;
  }

  if (!payload?.id_token) {
    authState.googleLoading = false;
    renderGoogleButton();
    authEls.googleNote.textContent = "Google не вернул токен входа.";
    setStatus("Не удалось выполнить вход через Google.", "is-error");
    return;
  }

  try {
    setStatus("Выполняем вход через Google…");
    await exchangeGoogleIdToken(payload.id_token);
  } catch (error) {
    console.error(error);
    setStatus(mapAuthError(error), "is-error");
    authEls.googleNote.textContent = "Не удалось завершить вход через Google.";
  } finally {
    authState.googleLoading = false;
    renderGoogleButton();
  }
}

function bindGoogleMessages() {
  window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin) return;
    if (event.data?.type !== GOOGLE_POPUP_MESSAGE_TYPE) return;
    handleGooglePopupResult(event.data.payload || {}).catch(console.error);
  });
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
  bindGoogleMessages();
  bindAuthEvents();
  setAuthTab("login");
  authState.session = readSession();

  try {
    await refreshSessionIfNeeded();
  } catch {
    clearSession();
  }

  renderAuthState();
  authEls.googleNote.textContent = "Google-вход готов.";
  renderGoogleButton();
}

initAuth().catch(() => {
  setStatus("Не удалось инициализировать авторизацию.", "is-error");
});
