import firebaseConfig from "./firebase-config.js";

const FIREBASE_VERSION = "12.18.0";
const WEB3FORMS_ENDPOINT = "https://api.web3forms.com/submit";
const WEB3FORMS_ACCESS_KEY = "ff56b2b8-f4d9-4a0c-b9c5-f1c286a6b41d";

const ui = {
    setupNotice: document.querySelector("#firebase-setup"),
    loading: document.querySelector("#account-loading"),
    authView: document.querySelector("#auth-view"),
    onboardingView: document.querySelector("#onboarding-view"),
    dashboardView: document.querySelector("#dashboard-view"),
    signupForm: document.querySelector("#signup-form"),
    loginForm: document.querySelector("#login-form"),
    questionnaireForm: document.querySelector("#questionnaire-form"),
    authStatus: document.querySelector("#auth-status"),
    profileStatus: document.querySelector("#profile-status"),
    accountStatus: document.querySelector("#account-status"),
    accountNavLabel: document.querySelector("#account-nav-label"),
    cancelQuestionnaireButton: document.querySelector("#cancel-questionnaire-btn"),
    verifyEmailButton: document.querySelector("#verify-email-btn")
};

const stageLabels = {
    idea: "Planning or idea stage",
    launching: "Launching now",
    growing: "Growing an active business",
    established: "Established and scaling"
};

const goalLabels = {
    launch: "Launch my business or a new offer",
    leads: "Generate more qualified leads",
    visibility: "Improve my online presence",
    sales: "Increase sales or conversions",
    brand: "Build a stronger, more consistent brand"
};

const serviceLabels = {
    "web-development": "Web development",
    "brand-photography": "Brand photography",
    "digital-advertising": "Digital advertising"
};

let auth;
let db;
let authApi;
let firestoreApi;
let activeUser = null;
let activeProfile = null;

function showView(viewName) {
    const views = {
        auth: ui.authView,
        onboarding: ui.onboardingView,
        dashboard: ui.dashboardView
    };

    ui.loading.classList.toggle("is-hidden", viewName !== "loading");

    Object.entries(views).forEach(([name, element]) => {
        const isVisible = name === viewName;
        element.classList.toggle("is-hidden", !isVisible);
        element.setAttribute("aria-hidden", String(!isVisible));
    });
}

function setStatus(element, message = "", type = "") {
    element.className = "account-status";
    if (type) {
        element.classList.add(type);
    }
    element.textContent = message;
}

function setFormBusy(form, isBusy, busyText) {
    const button = form.querySelector('button[type="submit"]');
    form.setAttribute("aria-busy", String(isBusy));

    if (!button.dataset.defaultText) {
        button.dataset.defaultText = button.textContent;
    }

    button.disabled = isBusy;
    button.textContent = isBusy ? busyText : button.dataset.defaultText;
}

function showAuthForm(mode) {
    const showSignup = mode === "signup";

    ui.signupForm.classList.toggle("is-hidden", !showSignup);
    ui.loginForm.classList.toggle("is-hidden", showSignup);
    setStatus(ui.authStatus);

    document.querySelectorAll("[data-auth-tab]").forEach((tab) => {
        const isActive = tab.dataset.authTab === mode;
        tab.classList.toggle("active", isActive);
        tab.setAttribute("aria-selected", String(isActive));
    });
}

function isFirebaseConfigured() {
    return ["apiKey", "authDomain", "projectId", "appId"].every((field) => {
        const value = firebaseConfig[field];
        return typeof value === "string" && value.length > 0 && !value.includes("YOUR_");
    });
}

function friendlyAuthError(error) {
    const messages = {
        "auth/email-already-in-use": "An account already exists for that email. Try signing in instead.",
        "auth/invalid-email": "Enter a valid email address.",
        "auth/invalid-credential": "The email or password is incorrect.",
        "auth/weak-password": "Choose a stronger password with at least 8 characters.",
        "auth/too-many-requests": "Too many attempts. Wait a little while and try again.",
        "auth/network-request-failed": "We could not reach the account service. Check your connection and try again.",
        "auth/user-disabled": "This account has been disabled. Contact support for help."
    };

    return messages[error?.code] || "Something went wrong. Please try again.";
}

function getInitials(name) {
    const initials = name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join("");

    return initials || "BE";
}

async function sendProfileNotification(profile) {
    const response = await fetch(WEB3FORMS_ENDPOINT, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json"
        },
        body: JSON.stringify({
            access_key: WEB3FORMS_ACCESS_KEY,
            subject: "New account questionnaire from TheBestEntrepreneurs.com",
            from_name: "The Best Entrepreneurs Website",
            name: profile.displayName,
            email: activeUser?.email || "Not available",
            business_name: profile.businessName || "Not provided",
            industry: profile.industry || "Not provided",
            business_stage: stageLabels[profile.businessStage] || "Not provided",
            services: profile.services.map((service) => serviceLabels[service] || service).join(", "),
            primary_goal: goalLabels[profile.primaryGoal] || "Not provided",
            challenge: profile.challenge || "Not provided",
            website: profile.website || "Not provided"
        })
    });

    const result = await response.json();
    if (!response.ok || !result.success) {
        throw new Error("The profile notification could not be sent.");
    }
}

function fillQuestionnaire(profile = {}) {
    ui.questionnaireForm.elements.displayName.value = profile.displayName || activeUser?.displayName || "";
    ui.questionnaireForm.elements.businessName.value = profile.businessName || "";
    ui.questionnaireForm.elements.industry.value = profile.industry || "";
    ui.questionnaireForm.elements.businessStage.value = profile.businessStage || "";
    ui.questionnaireForm.elements.primaryGoal.value = profile.primaryGoal || "";
    ui.questionnaireForm.elements.challenge.value = profile.challenge || "";
    ui.questionnaireForm.elements.website.value = profile.website || "";

    const selectedServices = new Set(profile.services || []);
    ui.questionnaireForm.querySelectorAll('input[name="services"]').forEach((checkbox) => {
        checkbox.checked = selectedServices.has(checkbox.value);
    });

    const isEditing = profile.onboardingComplete === true;
    document.querySelector("#questionnaire-title").textContent = isEditing
        ? "Update your business profile"
        : "Tell us what you’re building";
    ui.cancelQuestionnaireButton.classList.toggle("is-hidden", !isEditing);
    setStatus(ui.profileStatus);
}

function renderDashboard() {
    const displayName = activeProfile?.displayName || activeUser?.displayName || "Entrepreneur";
    const businessName = activeProfile?.businessName || `${displayName}'s business`;
    const services = (activeProfile?.services || [])
        .map((service) => serviceLabels[service])
        .filter(Boolean);

    document.querySelector("#profile-initials").textContent = getInitials(displayName);
    document.querySelector("#account-business-name").textContent = businessName;
    document.querySelector("#account-email").textContent = activeUser?.email || "";
    document.querySelector("#summary-stage").textContent = stageLabels[activeProfile?.businessStage] || "Not provided";
    document.querySelector("#summary-industry").textContent = activeProfile?.industry || "Not provided";
    document.querySelector("#summary-goal").textContent = goalLabels[activeProfile?.primaryGoal] || "Not provided";
    document.querySelector("#summary-services").textContent = services.length ? services.join(", ") : "Not provided";
    document.querySelector("#summary-challenge").textContent = activeProfile?.challenge || "Not provided";

    const verificationBadge = document.querySelector("#verification-badge");
    const isVerified = activeUser?.emailVerified === true;
    verificationBadge.textContent = isVerified ? "Email verified" : "Email not verified";
    verificationBadge.classList.toggle("verified", isVerified);
    ui.verifyEmailButton.classList.toggle("is-hidden", isVerified);
    setStatus(ui.accountStatus);
}

async function loadProfile(user) {
    const profileReference = firestoreApi.doc(db, "users", user.uid);
    const snapshot = await firestoreApi.getDoc(profileReference);
    return snapshot.exists() ? snapshot.data() : null;
}

function enableFirebaseActions() {
    document.querySelectorAll("[data-firebase-action]").forEach((element) => {
        element.disabled = false;
    });
}

document.querySelectorAll("[data-auth-tab]").forEach((tab) => {
    tab.addEventListener("click", () => showAuthForm(tab.dataset.authTab));
});

document.querySelector("#website").addEventListener("blur", (event) => {
    const value = event.target.value.trim();
    if (value && !/^https?:\/\//i.test(value)) {
        event.target.value = `https://${value}`;
    }
});

async function initializeAccountCenter() {
    if (!isFirebaseConfigured()) {
        showView("auth");
        setStatus(ui.authStatus, "Account access is temporarily unavailable. Please try again later.");
        return;
    }

    try {
        const [appModule, authModule, firestoreModule] = await Promise.all([
            import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`),
            import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`),
            import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-firestore.js`)
        ]);

        authApi = authModule;
        firestoreApi = firestoreModule;

        const firebaseApp = appModule.initializeApp(firebaseConfig);
        auth = authModule.getAuth(firebaseApp);
        db = firestoreModule.getFirestore(firebaseApp);

        ui.setupNotice.hidden = true;
        enableFirebaseActions();

        authModule.onAuthStateChanged(auth, async (user) => {
            activeUser = user;
            ui.accountNavLabel.textContent = user ? "My account" : "Account";

            if (!user) {
                activeProfile = null;
                showAuthForm("signup");
                showView("auth");
                return;
            }

            showView("loading");

            try {
                activeProfile = await loadProfile(user);

                if (activeProfile?.onboardingComplete) {
                    renderDashboard();
                    showView("dashboard");
                } else {
                    fillQuestionnaire(activeProfile || {});
                    showView("onboarding");
                }
            } catch (error) {
                activeProfile = null;
                fillQuestionnaire({ displayName: user.displayName || "" });
                showView("onboarding");
                setStatus(
                    ui.profileStatus,
                    "You’re signed in, but your profile could not be loaded. Please refresh the page or contact us for help.",
                    "error"
                );
            }
        });
    } catch (error) {
        showView("auth");
        setStatus(ui.authStatus, "Account access is temporarily unavailable. Please refresh the page or contact us for help.", "error");
    }
}

ui.signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!auth || !authApi || !firestoreApi) {
        setStatus(ui.authStatus, "Account creation is temporarily unavailable. Please try again later.", "error");
        return;
    }

    const displayName = ui.signupForm.elements.displayName.value.trim();
    const email = ui.signupForm.elements.email.value.trim();
    const password = ui.signupForm.elements.password.value;
    const confirmedPassword = ui.signupForm.elements.confirmPassword.value;

    if (password !== confirmedPassword) {
        setStatus(ui.authStatus, "The passwords do not match.", "error");
        return;
    }

    setFormBusy(ui.signupForm, true, "Creating account...");
    setStatus(ui.authStatus, "Creating your secure account...");

    try {
        const credential = await authApi.createUserWithEmailAndPassword(auth, email, password);
        activeUser = credential.user;

        await authApi.updateProfile(credential.user, { displayName });

        try {
            await authApi.sendEmailVerification(credential.user);
        } catch (error) {
            // The account can continue even if Firebase temporarily delays the email.
        }

        const profile = {
            displayName,
            businessName: "",
            industry: "",
            businessStage: "",
            services: [],
            primaryGoal: "",
            challenge: "",
            website: "",
            onboardingComplete: false,
            createdAt: firestoreApi.serverTimestamp(),
            updatedAt: firestoreApi.serverTimestamp()
        };

        await firestoreApi.setDoc(
            firestoreApi.doc(db, "users", credential.user.uid),
            profile
        );

        activeProfile = profile;
        ui.signupForm.reset();
        fillQuestionnaire(profile);
        showView("onboarding");
    } catch (error) {
        if (activeUser) {
            fillQuestionnaire({ displayName });
            showView("onboarding");
            setStatus(
                ui.profileStatus,
                "Your account was created, but your profile could not be saved yet. Please try again or contact us for help.",
                "error"
            );
        } else {
            setStatus(ui.authStatus, friendlyAuthError(error), "error");
        }
    } finally {
        setFormBusy(ui.signupForm, false);
    }
});

ui.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!auth || !authApi) {
        setStatus(ui.authStatus, "Sign-in is temporarily unavailable. Please try again later.", "error");
        return;
    }
    const email = ui.loginForm.elements.email.value.trim();
    const password = ui.loginForm.elements.password.value;

    setFormBusy(ui.loginForm, true, "Signing in...");
    setStatus(ui.authStatus, "Signing you in...");

    try {
        await authApi.signInWithEmailAndPassword(auth, email, password);
        ui.loginForm.reset();
    } catch (error) {
        setStatus(ui.authStatus, friendlyAuthError(error), "error");
    } finally {
        setFormBusy(ui.loginForm, false);
    }
});

document.querySelector("#reset-password-btn").addEventListener("click", async () => {
    if (!auth || !authApi) {
        setStatus(ui.authStatus, "Password reset is temporarily unavailable. Please try again later.", "error");
        return;
    }

    const email = ui.loginForm.elements.email.value.trim();

    if (!email) {
        setStatus(ui.authStatus, "Enter your email address first, then select Forgot password.", "error");
        ui.loginForm.elements.email.focus();
        return;
    }

    try {
        await authApi.sendPasswordResetEmail(auth, email);
        setStatus(ui.authStatus, "If an account exists for that email, a reset link is on its way.", "success");
    } catch (error) {
        setStatus(ui.authStatus, friendlyAuthError(error), "error");
    }
});

ui.questionnaireForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const isFirstCompletion = activeProfile?.onboardingComplete !== true;

    const services = Array.from(
        ui.questionnaireForm.querySelectorAll('input[name="services"]:checked'),
        (checkbox) => checkbox.value
    );

    if (!services.length) {
        setStatus(ui.profileStatus, "Choose at least one service that interests you.", "error");
        ui.questionnaireForm.querySelector('input[name="services"]').focus();
        return;
    }

    const submitButton = ui.questionnaireForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = "Saving...";
    setStatus(ui.profileStatus, "Saving your business profile...");

    const profile = {
        displayName: ui.questionnaireForm.elements.displayName.value.trim(),
        businessName: ui.questionnaireForm.elements.businessName.value.trim(),
        industry: ui.questionnaireForm.elements.industry.value.trim(),
        businessStage: ui.questionnaireForm.elements.businessStage.value,
        services,
        primaryGoal: ui.questionnaireForm.elements.primaryGoal.value,
        challenge: ui.questionnaireForm.elements.challenge.value.trim(),
        website: ui.questionnaireForm.elements.website.value.trim(),
        onboardingComplete: true,
        updatedAt: firestoreApi.serverTimestamp()
    };

    if (!activeProfile?.createdAt) {
        profile.createdAt = firestoreApi.serverTimestamp();
    }

    try {
        await firestoreApi.setDoc(
            firestoreApi.doc(db, "users", activeUser.uid),
            profile,
            { merge: true }
        );

        if (activeUser.displayName !== profile.displayName) {
            await authApi.updateProfile(activeUser, { displayName: profile.displayName });
        }

        if (isFirstCompletion) {
            try {
                await sendProfileNotification(profile);
            } catch (error) {
                // The Firebase profile remains saved if the email service is temporarily unavailable.
            }
        }

        activeProfile = { ...activeProfile, ...profile };
        renderDashboard();
        showView("dashboard");
    } catch (error) {
        setStatus(ui.profileStatus, "Your answers could not be saved. Please try again or contact us for help.", "error");
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Save and continue";
    }
});

document.querySelector("#edit-profile-btn").addEventListener("click", () => {
    fillQuestionnaire(activeProfile || {});
    showView("onboarding");
});

ui.cancelQuestionnaireButton.addEventListener("click", () => {
    if (activeProfile?.onboardingComplete) {
        renderDashboard();
        showView("dashboard");
    }
});

ui.verifyEmailButton.addEventListener("click", async () => {
    ui.verifyEmailButton.disabled = true;
    setStatus(ui.accountStatus, "Sending a new verification email...");

    try {
        await authApi.sendEmailVerification(activeUser);
        setStatus(ui.accountStatus, "Verification email sent. Check your inbox and spam folder.", "success");
    } catch (error) {
        setStatus(ui.accountStatus, friendlyAuthError(error), "error");
    } finally {
        ui.verifyEmailButton.disabled = false;
    }
});

document.querySelector("#signout-btn").addEventListener("click", async () => {
    setStatus(ui.accountStatus, "Signing out...");
    try {
        await authApi.signOut(auth);
    } catch (error) {
        setStatus(ui.accountStatus, "We could not sign you out. Try again.", "error");
    }
});

initializeAccountCenter();
