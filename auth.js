const AUTH_STORAGE_KEY = "animecloud_auth_v1";
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDSZh9ObtPBPRlNHgCAcA3a1u4pNXdvDgY",
  authDomain: "oauth-489621.firebaseapp.com",
  projectId: "oauth-489621",
  storageBucket: "oauth-489621.firebasestorage.app",
  messagingSenderId: "263581962151",
  appId: "1:263581962151:web:41538be2d5bae44d037082"
};
const FIREBASE_SDK_VERSION = "10.12.5";
const APP_CHECK_KEY =
  document.querySelector('meta[name="firebase-app-check-key"]')?.content ||
  window.ANIMECLOUD_APP_CHECK_KEY ||
  "";
const ADMIN_EMAILS = new Set(["serikovmaksim94@gmail.com"]);

const authEls = {
  openBtn: document.getElementById("auth-open-btn"),
  userMenu: document.getElementById("user-menu"),
  userChip: document.getElementById("user-chip"),
  userAvatar: document.getElementById("user-avatar"),
  userName: document.getElementById("user-name"),
  userRoleBadge: document.getElementById("user-role-badge"),
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
  googleLoading: false
};

const firebaseState = {
  contextPromise: null,
  auth: null,
  signOut: null
};

async function ensureFirebaseAppCheck(app) {
  if (!APP_CHECK_KEY) return null;
  if (globalThis.__animeCloudAppCheckPromise) {
    return globalThis.__animeCloudAppCheckPromise;
  }

  globalThis.__animeCloudAppCheckPromise = import(
    `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app-check.js`
  )
    .then(({ initializeAppCheck, ReCaptchaEnterpriseProvider }) => {
      try {
        return initializeAppCheck(app, {
          provider: new ReCaptchaEnterpriseProvider(APP_CHECK_KEY),
          isTokenAutoRefreshEnabled: true
        });
      } catch (error) {
        const message = String(error?.message || "").toLowerCase();
        if (error?.code === "app-check/already-initialized" || message.includes("already") && message.includes("app check")) {
          return null;
        }
        throw error;
      }
    })
    .catch((error) => {
      console.warn("AnimeCloud Auth App Check skipped", error);
      return null;
    });

  return globalThis.__animeCloudAppCheckPromise;
}

function readSession() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? decorateSession(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function writeSession(session) {
  const next = decorateSession(session);
  authState.session = next;
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(next));
  renderAuthState();
  window.dispatchEvent(new CustomEvent("animecloud:auth", { detail: { user: next } }));
}

function clearSession() {
  authState.session = null;
  localStorage.removeItem(AUTH_STORAGE_KEY);
  renderAuthState();
  if (firebaseState.auth && firebaseState.signOut) {
    firebaseState.signOut(firebaseState.auth).catch(() => {});
  }
  window.dispatchEvent(new CustomEvent("animecloud:auth", { detail: { user: null } }));
}

function deriveName(session) {
  if (session?.displayName) return session.displayName;
  if (session?.email) return session.email.split("@")[0];
  return "Гость";
}

function isOwnerEmail(session) {
  const email = String(session?.email || "").trim().toLowerCase();
  return ADMIN_EMAILS.has(email);
}

function getAuthUser() {
  return authState.session;
}

window.getAuthUser = getAuthUser;

function decorateSession(session) {
  if (!session) return null;
  const { isAdmin, role, ...rest } = session;
  return rest;
}

function normalizeSession(data, current = null) {
  const expiresIn = Number(data.expiresIn || data.expires_in || 3600);
  const expiresAt =
    Number(data.expiresAt || current?.expiresAt || 0) || Date.now() + expiresIn * 1000 - 60000;

  return {
    idToken: data.idToken || data.id_token || current?.idToken || "",
    refreshToken: data.refreshToken || data.refresh_token || current?.refreshToken || "",
    localId: data.localId || data.user_id || current?.localId || "",
    email: data.email || current?.email || "",
    displayName: data.displayName || current?.displayName || "",
    photoUrl: data.photoUrl || current?.photoUrl || "",
    providerId: data.providerId || current?.providerId || "",
    expiresAt
  };
}

function normalizeFirebaseUser(user, idToken) {
  return {
    idToken,
    refreshToken: user?.refreshToken || "",
    localId: user?.uid || "",
    email: user?.email || "",
    displayName: user?.displayName || "",
    photoUrl: user?.photoURL || "",
    providerId: "google.com",
    expiresAt: Number(user?.stsTokenManager?.expirationTime || Date.now() + 55 * 60 * 1000)
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
  const code = error?.code || error?.message || error?.error?.message || "";
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
    WEAK_PASSWORD: "Пароль слишком простой. Используйте минимум 6 символов.",
    "auth/popup-closed-by-user": "Окно Google было закрыто до завершения входа.",
    "auth/popup-blocked": "Браузер заблокировал окно Google. Разрешите popup для этого сайта.",
    "auth/cancelled-popup-request": "Предыдущий запрос входа был прерван.",
    "auth/unauthorized-domain": "Этот домен не добавлен в разрешённые домены Firebase Auth.",
    "auth/operation-not-allowed": "Google-вход не включён в настройках Firebase Auth.",
    "auth/network-request-failed": "Сеть недоступна. Проверьте подключение и повторите попытку."
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
  authEls.userRoleBadge.hidden = !isOwnerEmail(session);
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

async function getFirebaseContext() {
  if (firebaseState.contextPromise) return firebaseState.contextPromise;

  firebaseState.contextPromise = (async () => {
    const [{ initializeApp, getApp, getApps }, { browserLocalPersistence, getAuth, GoogleAuthProvider, setPersistence, signInWithPopup, signOut }] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-auth.js`)
    ]);

    const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
    await ensureFirebaseAppCheck(app);
    const auth = getAuth(app);
    await setPersistence(auth, browserLocalPersistence).catch(() => {});

    firebaseState.auth = auth;
    firebaseState.signOut = signOut;

    return { auth, GoogleAuthProvider, signInWithPopup, signOut };
  })().catch((error) => {
    firebaseState.contextPromise = null;
    throw error;
  });

  return firebaseState.contextPromise;
}

async function signInWithGoogle() {
  if (authState.googleLoading) return;

  authState.googleLoading = true;
  renderGoogleButton();
  setStatus("");
  authEls.googleNote.textContent = "Открываем вход через Google…";

  try {
    const { auth, GoogleAuthProvider, signInWithPopup } = await getFirebaseContext();
    const provider = new GoogleAuthProvider();
    provider.addScope("email");
    provider.addScope("profile");

    const result = await signInWithPopup(auth, provider);
    const idToken = await result.user.getIdToken();
    writeSession(normalizeFirebaseUser(result.user, idToken));
    authEls.googleNote.textContent = "Google-вход выполнен.";
    setStatus("Вход выполнен.", "is-success");
    closeAuthModal();
    window.dispatchEvent(new CustomEvent("animecloud:profile-request"));
  } catch (error) {
    console.error(error);
    authEls.googleNote.textContent = "Не удалось выполнить вход через Google.";
    setStatus(mapAuthError(error), "is-error");
  } finally {
    authState.googleLoading = false;
    renderGoogleButton();
  }
}

function renderGoogleButton() {
  authEls.googleButton.innerHTML = "";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "primary-btn google-auth-launch";
  button.textContent = authState.googleLoading ? "Подождите…" : "Войти через Google";
  button.disabled = authState.googleLoading;
  button.addEventListener("click", () => {
    signInWithGoogle().catch(console.error);
  });

  authEls.googleButton.appendChild(button);

  if (!authEls.googleNote.textContent.trim()) {
    authEls.googleNote.textContent = "Google-вход готов.";
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
  authEls.googleNote.textContent = "Google-вход через Firebase popup.";
  renderGoogleButton();
}

initAuth().catch(() => {
  setStatus("Не удалось инициализировать авторизацию.", "is-error");
});
