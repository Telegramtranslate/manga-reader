(function () {
  const AUTH_STORAGE_KEY = "animecloud_auth_v1";
  const FIREBASE_CONFIG = window.ANIMECLOUD_FIREBASE_CONFIG || {
    apiKey: "AIzaSyDSZh9ObtPBPRlNHgCAcA3a1u4pNXdvDgY",
    authDomain: "oauth-489621.firebaseapp.com",
    projectId: "oauth-489621",
    storageBucket: "oauth-489621.firebasestorage.app",
    messagingSenderId: "263581962151",
    appId: "1:263581962151:web:41538be2d5bae44d037082"
  };
  const FIREBASE_SDK_VERSION = window.ANIMECLOUD_FIREBASE_SDK_VERSION || "10.12.5";
  const AUTH_APP_CHECK_SITE_KEY =
    window.ANIMECLOUD_APP_CHECK_KEY ||
    document.querySelector('meta[name="firebase-app-check-key"]')?.content ||
    "";
  const AUTH_APP_CHECK_ENABLED =
    window.ANIMECLOUD_ENABLE_APP_CHECK === true ||
    document.querySelector('meta[name="firebase-app-check-enabled"]')?.content === "true";
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
    bootstrapPromise: null,
    auth: null,
    signOut: null,
    unsubscribe: null
  };

  function dispatchAuthState(user) {
    window.dispatchEvent(new CustomEvent("animecloud:auth", { detail: { user } }));
  }

  function decorateSession(session) {
    if (!session) return null;
    const { isAdmin, role, ...rest } = session;
    return rest;
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

  function readSession() {
    try {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
      return raw ? decorateSession(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  }

  function renderAuthState() {
    const session = authState.session;
    const loggedIn = Boolean(session?.idToken);

    if (authEls.openBtn) authEls.openBtn.hidden = loggedIn;
    if (authEls.userMenu) authEls.userMenu.hidden = !loggedIn;
    if (authEls.userName) authEls.userName.textContent = deriveName(session);
    if (authEls.userRoleBadge) authEls.userRoleBadge.hidden = !isOwnerEmail(session);
    if (authEls.userEmail) authEls.userEmail.textContent = session?.email || "Вход не выполнен";
    if (authEls.userAvatar) authEls.userAvatar.src = session?.photoUrl || "/mc-icon-192.png?v=4";
  }

  function writeSession(session, options = {}) {
    const next = decorateSession(session);
    authState.session = next;
    try {
      if (next) {
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(next));
      } else {
        localStorage.removeItem(AUTH_STORAGE_KEY);
      }
    } catch {}
    renderAuthState();
    if (options.broadcast !== false) {
      dispatchAuthState(next);
    }
    return next;
  }

  function clearSession(options = {}) {
    writeSession(null, { broadcast: options.broadcast !== false });
    if (!options.skipFirebaseSignOut && firebaseState.auth && firebaseState.signOut) {
      firebaseState.signOut(firebaseState.auth).catch(() => {});
    }
  }

  function getAuthUser() {
    return authState.session;
  }

  window.getAuthUser = getAuthUser;

  function scheduleIdle(callback) {
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(callback, { timeout: 1800 });
      return;
    }
    setTimeout(callback, 220);
  }

  function normalizeFirebaseUser(user, idToken, providerId = "") {
    const primaryProvider =
      providerId ||
      user?.providerData?.find((item) => item?.providerId && item.providerId !== "firebase")?.providerId ||
      user?.providerData?.[0]?.providerId ||
      "";

    return {
      idToken,
      refreshToken: user?.refreshToken || "",
      localId: user?.uid || "",
      email: user?.email || "",
      displayName: user?.displayName || "",
      photoUrl: user?.photoURL || "",
      providerId: primaryProvider,
      expiresAt: Number(user?.stsTokenManager?.expirationTime || Date.now() + 55 * 60 * 1000)
    };
  }

  async function ensureFirebaseAppCheck(app) {
    if (!AUTH_APP_CHECK_ENABLED || !AUTH_APP_CHECK_SITE_KEY) return null;
    if (globalThis.__animeCloudAppCheckPromise) {
      return globalThis.__animeCloudAppCheckPromise;
    }

    if (typeof window.animeCloudLoadRecaptchaEnterprise === "function") {
      await window.animeCloudLoadRecaptchaEnterprise().catch(() => null);
    }

    globalThis.__animeCloudAppCheckPromise = import(
      `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app-check.js`
    )
      .then(({ initializeAppCheck, ReCaptchaEnterpriseProvider }) => {
        try {
          return initializeAppCheck(app, {
            provider: new ReCaptchaEnterpriseProvider(AUTH_APP_CHECK_SITE_KEY),
            isTokenAutoRefreshEnabled: true
          });
        } catch (error) {
          const message = String(error?.message || "").toLowerCase();
          if (
            error?.code === "app-check/already-initialized" ||
            (message.includes("already") && message.includes("app check"))
          ) {
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

  async function getFirebaseContext() {
    if (firebaseState.contextPromise) return firebaseState.contextPromise;

    firebaseState.contextPromise = (async () => {
      const [
        { initializeApp, getApp, getApps },
        {
          browserLocalPersistence,
          createUserWithEmailAndPassword,
          getAuth,
          GoogleAuthProvider,
          onAuthStateChanged,
          setPersistence,
          signInWithEmailAndPassword,
          signInWithPopup,
          signOut
        }
      ] = await Promise.all([
        import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app.js`),
        import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-auth.js`)
      ]);

      const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
      await ensureFirebaseAppCheck(app);
      const auth = getAuth(app);
      await setPersistence(auth, browserLocalPersistence).catch(() => {});

      firebaseState.auth = auth;
      firebaseState.signOut = signOut;

      return {
        auth,
        createUserWithEmailAndPassword,
        GoogleAuthProvider,
        onAuthStateChanged,
        signInWithEmailAndPassword,
        signInWithPopup,
        signOut
      };
    })().catch((error) => {
      firebaseState.contextPromise = null;
      throw error;
    });

    return firebaseState.contextPromise;
  }

  async function bootstrapAuthObserver() {
    if (firebaseState.bootstrapPromise) return firebaseState.bootstrapPromise;

    firebaseState.bootstrapPromise = (async () => {
      const { auth, onAuthStateChanged } = await getFirebaseContext();
      if (firebaseState.unsubscribe) return;

      firebaseState.unsubscribe = onAuthStateChanged(
        auth,
        async (user) => {
          try {
            await applyFirebaseUserSession(user);
          } catch (error) {
            console.error(error);
            writeSession(null);
          }
        },
        (error) => {
          console.error(error);
          writeSession(null);
        }
      );
    })().catch((error) => {
      firebaseState.bootstrapPromise = null;
      throw error;
    });

    return firebaseState.bootstrapPromise;
  }

  async function applyFirebaseUserSession(user) {
    if (!user) {
      writeSession(null);
      return null;
    }

    const idToken = await user.getIdToken().catch(() => "");
    return writeSession(normalizeFirebaseUser(user, idToken));
  }

  function setStatus(message, type = "") {
    if (!authEls.status) return;
    authEls.status.textContent = message;
    authEls.status.className = "auth-status";
    if (type) authEls.status.classList.add(type);
  }

  function setFormDisabled(form, disabled) {
    if (!form) return;
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
      "auth/email-already-in-use": "Этот email уже зарегистрирован.",
      "auth/user-not-found": "Аккаунт с таким email не найден.",
      "auth/wrong-password": "Неверный пароль.",
      "auth/invalid-credential": "Неверный email или пароль.",
      "auth/invalid-login-credentials": "Неверный email или пароль.",
      "auth/too-many-requests": "Слишком много попыток. Повторите позже.",
      "auth/invalid-email": "Некорректный email.",
      "auth/weak-password": "Пароль слишком простой. Используйте минимум 6 символов.",
      "auth/popup-closed-by-user": "Окно Google было закрыто до завершения входа.",
      "auth/popup-blocked": "Браузер заблокировал окно Google. Разрешите popup для этого сайта.",
      "auth/cancelled-popup-request": "Предыдущий запрос входа был прерван.",
      "auth/unauthorized-domain": "Этот домен не добавлен в разрешённые домены Firebase Auth.",
      "auth/operation-not-allowed": "Google-вход не включён в настройках Firebase Auth.",
      "auth/network-request-failed": "Сеть недоступна. Проверьте подключение и повторите попытку."
    };
    return map[code] || "Не удалось выполнить авторизацию.";
  }

  function openAuthModal() {
    if (!authEls.modal) return;
    authEls.modal.hidden = false;
    document.body.style.overflow = "hidden";
    setStatus("");
    renderGoogleButton();
  }

  function closeAuthModal() {
    if (!authEls.modal) return;
    authEls.modal.hidden = true;
    document.body.style.overflow = "";
    setStatus("");
  }

  function setAuthTab(tab) {
    authState.tab = tab;
    authEls.tabs.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.authTab === tab);
    });
    authEls.loginForm?.classList.toggle("is-active", tab === "login");
    authEls.registerForm?.classList.toggle("is-active", tab === "register");
    setStatus("");
  }

  async function signInWithEmail(email, password) {
    const { auth, signInWithEmailAndPassword } = await getFirebaseContext();
    const result = await signInWithEmailAndPassword(auth, email, password);
    await applyFirebaseUserSession(result.user);
  }

  async function signUpWithEmail(email, password) {
    const { auth, createUserWithEmailAndPassword } = await getFirebaseContext();
    const result = await createUserWithEmailAndPassword(auth, email, password);
    await applyFirebaseUserSession(result.user);
  }

  async function signInWithGoogle() {
    if (authState.googleLoading) return;

    authState.googleLoading = true;
    renderGoogleButton();
    setStatus("");
    if (authEls.googleNote) authEls.googleNote.textContent = "Открываем вход через Google…";

    try {
      const { auth, GoogleAuthProvider, signInWithPopup } = await getFirebaseContext();
      const provider = new GoogleAuthProvider();
      provider.addScope("email");
      provider.addScope("profile");

      const result = await signInWithPopup(auth, provider);
      await applyFirebaseUserSession(result.user);
      if (authEls.googleNote) authEls.googleNote.textContent = "Google-вход выполнен.";
      setStatus("Вход выполнен.", "is-success");
      closeAuthModal();
      window.dispatchEvent(new CustomEvent("animecloud:profile-request"));
    } catch (error) {
      console.error(error);
      if (authEls.googleNote) authEls.googleNote.textContent = "Не удалось выполнить вход через Google.";
      setStatus(mapAuthError(error), "is-error");
    } finally {
      authState.googleLoading = false;
      renderGoogleButton();
    }
  }

  function renderGoogleButton() {
    if (!authEls.googleButton) return;
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

    if (authEls.googleNote && !authEls.googleNote.textContent.trim()) {
      authEls.googleNote.textContent = "Google-вход готов.";
    }
  }

  function bindAuthEvents() {
    authEls.openBtn?.addEventListener("click", openAuthModal);
    authEls.closeBtn?.addEventListener("click", closeAuthModal);
    authEls.backdrop?.addEventListener("click", closeAuthModal);
    authEls.logoutBtn?.addEventListener("click", () => clearSession());
    authEls.userChip?.addEventListener("click", () => {
      window.dispatchEvent(new CustomEvent("animecloud:profile-request"));
    });

    authEls.tabs.forEach((button) => {
      button.addEventListener("click", () => setAuthTab(button.dataset.authTab));
    });

    authEls.loginForm?.addEventListener("submit", async (event) => {
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

    authEls.registerForm?.addEventListener("submit", async (event) => {
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
      if (event.key === "Escape" && authEls.modal && !authEls.modal.hidden) {
        closeAuthModal();
      }
    });
  }

  async function initAuth() {
    bindAuthEvents();
    setAuthTab("login");
    writeSession(readSession(), { broadcast: true });
    if (authEls.googleNote) authEls.googleNote.textContent = "Google-вход через Firebase popup.";
    renderGoogleButton();

    scheduleIdle(() => {
      bootstrapAuthObserver().catch((error) => {
        console.error(error);
        if (!authState.session) {
          setStatus("Не удалось инициализировать авторизацию.", "is-error");
        }
      });
    });
  }

  initAuth().catch((error) => {
    console.error(error);
    setStatus("Не удалось инициализировать авторизацию.", "is-error");
    writeSession(readSession(), { broadcast: true });
  });
})();


