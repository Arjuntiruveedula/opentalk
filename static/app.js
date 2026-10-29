// OpenTalk Frontend Client Engine

const LANGUAGE_FLAGS = {
    "Telugu": "🇮🇳",
    "Hindi": "🇮🇳",
    "Tamil": "🇮🇳",
    "Kannada": "🇮🇳",
    "Malayalam": "🇮🇳",
    "Bengali": "🇮🇳",
    "Marathi": "🇮🇳",
    "Spanish": "🇪🇸",
    "French": "🇫🇷",
    "German": "🇩🇪",
    "Arabic": "🇸🇦",
    "Japanese": "🇯🇵",
    "English": "🌐"
};

// State Management
let authToken = localStorage.getItem("opentalk_token") || null;
let currentUser = null;

let callSocket = null;
let roomSocket = null;
let peerConnection = null;
let localStream = null;
let callTimerInterval = null;
let callDurationSeconds = 0;
let currentSessionId = null;
let currentPartner = null;
let icebreakers = [];
let icebreakerIndex = 0;
let aiChatHistory = [];

// Audio Synthesizer for procedural tones (Ringing, Call Chimes)
const AudioFX = {
    ctx: null,
    init() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
        }
    },
    playTone(freq, type, duration, delay = 0) {
        this.init();
        setTimeout(() => {
            try {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = type;
                osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
                gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start();
                osc.stop(this.ctx.currentTime + duration);
            } catch (e) {}
        }, delay * 1000);
    },
    playRingtone() {
        this.playTone(440, "sine", 0.4, 0);
        this.playTone(480, "sine", 0.4, 0.4);
    },
    playConnected() {
        this.playTone(523.25, "sine", 0.15, 0);   // C5
        this.playTone(659.25, "sine", 0.25, 0.15); // E5
        this.playTone(783.99, "sine", 0.4, 0.3);   // G5
    },
    playCallEnded() {
        this.playTone(440, "sine", 0.2, 0);
        this.playTone(349.23, "sine", 0.3, 0.2);
    }
};

// DOM Root Views
const authView = document.getElementById("authView");
const mainAppView = document.getElementById("mainAppView");

// DOM Auth Page Elements
const authTabLogin = document.getElementById("authTabLogin");
const authTabSignup = document.getElementById("authTabSignup");
const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");
const authErrorBanner = document.getElementById("authErrorBanner");
const authErrorText = document.getElementById("authErrorText");
const goToSignupLink = document.getElementById("goToSignupLink");
const goToLoginLink = document.getElementById("goToLoginLink");

// DOM Header Elements
const headerLangPill = document.getElementById("headerLangPill");
const headerLangFlag = document.getElementById("headerLangFlag");
const headerLangText = document.getElementById("headerLangText");
const headerAvatarImg = document.getElementById("headerAvatarImg");
const headerUserBtn = document.getElementById("headerUserBtn");
const streakDays = document.getElementById("streakDays");
const freeMinsBadge = document.getElementById("freeMinsBadge");

// DOM Call Screen Elements
const userNameDisplay = document.getElementById("userNameDisplay");
const userLevelBadge = document.getElementById("userLevelBadge");
const userAvatar = document.getElementById("userAvatar");
const userLangBadge = document.getElementById("userLangBadge");
const userLangFlag = document.getElementById("userLangFlag");
const userLangName = document.getElementById("userLangName");

const modeLocalBtn = document.getElementById("modeLocalBtn");
const modeGlobalBtn = document.getElementById("modeGlobalBtn");
const modeLocalFlag = document.getElementById("modeLocalFlag");
const modeLocalSubtext = document.getElementById("modeLocalSubtext");
const activeModeBadgeText = document.getElementById("activeModeBadgeText");
const modeDescription = document.getElementById("modeDescription");
const callCardHeading = document.getElementById("callCardHeading");
const callCardSubheading = document.getElementById("callCardSubheading");

// DOM Profile Hero Elements
const profileHeroName = document.getElementById("profileHeroName");
const profileHeroEmail = document.getElementById("profileHeroEmail");
const profileHeroAvatar = document.getElementById("profileHeroAvatar");
const profileHeroLang = document.getElementById("profileHeroLang");
const profileHeroLevel = document.getElementById("profileHeroLevel");
const profileHeroMode = document.getElementById("profileHeroMode");
const profileHeroBio = document.getElementById("profileHeroBio");
const shuffleAvatarBtn = document.getElementById("shuffleAvatarBtn");
const openEditProfileBtn = document.getElementById("openEditProfileBtn");
const signOutBtn = document.getElementById("signOutBtn");
const editProfileModal = document.getElementById("editProfileModal");

// DOM In-Call Screen Elements
const callModal = document.getElementById("callModal");
const callStatusText = document.getElementById("callStatusText");
const callTimerDisplay = document.getElementById("callTimerDisplay");
const partnerName = document.getElementById("partnerName");
const partnerLevel = document.getElementById("partnerLevel");
const partnerAvatar = document.getElementById("partnerAvatar");
const partnerLangBadge = document.getElementById("partnerLangBadge");
const callMatchBadge = document.getElementById("callMatchBadge");
const callMatchFlag = document.getElementById("callMatchFlag");
const callMatchText = document.getElementById("callMatchText");
const inCallPromptText = document.getElementById("inCallPromptText");
const toggleMicBtn = document.getElementById("toggleMicBtn");
const callMicIcon = document.getElementById("callMicIcon");

// ----------------- Application Entrypoint & View Routing -----------------

function renderView(viewName) {
    if (viewName === "auth") {
        authView.classList.remove("hidden");
        mainAppView.classList.add("hidden");
    } else {
        authView.classList.add("hidden");
        mainAppView.classList.remove("hidden");
    }
    lucide.createIcons();
}

function renderAuthTab(tab) {
    if (tab === "signup") {
        authTabSignup.classList.add("bg-white", "text-brand-700", "shadow-sm");
        authTabSignup.classList.remove("text-slate-500");
        authTabLogin.classList.remove("bg-white", "text-brand-700", "shadow-sm");
        authTabLogin.classList.add("text-slate-500");
        signupForm.classList.remove("hidden");
        loginForm.classList.add("hidden");
        authErrorBanner.classList.add("hidden");
        if (window.location.pathname !== "/signup") {
            try { history.replaceState(null, "", "/signup"); } catch (e) {}
        }
    } else {
        authTabLogin.classList.add("bg-white", "text-brand-700", "shadow-sm");
        authTabLogin.classList.remove("text-slate-500");
        authTabSignup.classList.remove("bg-white", "text-brand-700", "shadow-sm");
        authTabSignup.classList.add("text-slate-500");
        loginForm.classList.remove("hidden");
        signupForm.classList.add("hidden");
        authErrorBanner.classList.add("hidden");
        if (window.location.pathname !== "/login") {
            try { history.replaceState(null, "", "/login"); } catch (e) {}
        }
    }
    lucide.createIcons();
}

async function initApp() {
    setupPwaInstall();
    setupAuthHandlers();
    setupNavigation();
    setupCallHandlers();
    setupClubsHandlers();
    setupAiTutorHandlers();
    setupProfileModalHandlers();

    // Check initial path or hash
    const path = window.location.pathname;
    const hash = window.location.hash;
    const wantsSignup = path.includes("signup") || hash.includes("signup");

    if (authToken) {
        const success = await loadUserProfile();
        if (success) {
            renderView("app");
        } else {
            authToken = null;
            localStorage.removeItem("opentalk_token");
            renderAuthTab(wantsSignup ? "signup" : "login");
            renderView("auth");
        }
    } else {
        renderAuthTab(wantsSignup ? "signup" : "login");
        renderView("auth");
    }

    // Load secondary content
    loadDailyWords();
    loadSpeakingTopics();
    loadIcebreakers();
}

// ----------------- Authentication Handlers -----------------

function setupAuthHandlers() {
    authTabLogin.addEventListener("click", () => renderAuthTab("login"));
    authTabSignup.addEventListener("click", () => renderAuthTab("signup"));
    if (goToSignupLink) goToSignupLink.addEventListener("click", (e) => { e.preventDefault(); renderAuthTab("signup"); });
    if (goToLoginLink) goToLoginLink.addEventListener("click", (e) => { e.preventDefault(); renderAuthTab("login"); });

    // Login Form Submit
    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = document.getElementById("loginEmail").value.trim();
        const password = document.getElementById("loginPassword").value;
        const submitBtn = document.getElementById("loginSubmitBtn");

        submitBtn.disabled = true;
        submitBtn.textContent = "Signing in...";

        try {
            const res = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            submitBtn.disabled = false;
            submitBtn.textContent = "Sign In to OpenTalk";

            if (!res.ok) {
                showAuthError(data.detail || "Login failed. Check your email and password.");
                return;
            }

            saveSession(data.token, data.user);
            renderView("app");
            updateUIWithUser();
        } catch (err) {
            submitBtn.disabled = false;
            submitBtn.textContent = "Sign In to OpenTalk";
            showAuthError("Connection error. Please try again.");
        }
    });

    // Signup Form Submit
    signupForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const name = document.getElementById("signupName").value.trim();
        const email = document.getElementById("signupEmail").value.trim();
        const password = document.getElementById("signupPassword").value;
        const native_language = document.getElementById("signupLang").value;
        const level = document.getElementById("signupLevel").value;
        const matching_mode = document.getElementById("signupMode").value;
        const gender = document.querySelector('input[name="signupGender"]:checked')?.value || "Boy";
        const submitBtn = document.getElementById("signupSubmitBtn");

        submitBtn.disabled = true;
        submitBtn.textContent = "Creating profile...";

        try {
            const res = await fetch("/api/auth/signup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name,
                    email,
                    password,
                    native_language,
                    level,
                    matching_mode,
                    gender
                })
            });
            const data = await res.json();
            submitBtn.disabled = false;
            submitBtn.textContent = "Create Profile & Start Speaking";

            if (!res.ok) {
                showAuthError(data.detail || "Signup failed. Please check your details.");
                return;
            }

            saveSession(data.token, data.user);
            renderView("app");
            updateUIWithUser();
        } catch (err) {
            submitBtn.disabled = false;
            submitBtn.textContent = "Create Profile & Start Speaking";
            showAuthError("Connection error. Please try again.");
        }
    });

    // Demo Preset Buttons
    document.querySelectorAll(".demo-login-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
            const preset = btn.getAttribute("data-preset");
            btn.classList.add("opacity-60");
            try {
                const res = await fetch("/api/auth/demo", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ preset })
                });
                const data = await res.json();
                btn.classList.remove("opacity-60");
                if (res.ok && data.token) {
                    saveSession(data.token, data.user);
                    renderView("app");
                    updateUIWithUser();
                } else {
                    showAuthError(data.detail || "Demo login failed");
                }
            } catch (e) {
                btn.classList.remove("opacity-60");
                showAuthError("Failed to perform demo login");
            }
        });
    });

    // Sign Out Button
    signOutBtn.addEventListener("click", () => {
        if (confirm("Are you sure you want to sign out?")) {
            localStorage.removeItem("opentalk_token");
            authToken = null;
            currentUser = null;
            renderAuthTab("login");
            renderView("auth");
        }
    });
}

function showAuthError(msg) {
    authErrorText.textContent = msg;
    authErrorBanner.classList.remove("hidden");
    lucide.createIcons();
}

function saveSession(token, user) {
    authToken = token;
    currentUser = user;
    localStorage.setItem("opentalk_token", token);
}

// ----------------- Profile & UI Population -----------------

async function loadUserProfile() {
    try {
        const res = await fetch("/api/auth/me", {
            headers: { "Authorization": `Bearer ${authToken}` }
        });
        if (!res.ok) {
            return false;
        }
        currentUser = await res.json();
        updateUIWithUser();
        return true;
    } catch (e) {
        return false;
    }
}

function updateUIWithUser() {
    if (!currentUser) return;

    const lang = currentUser.native_language || "Telugu";
    const flag = LANGUAGE_FLAGS[lang] || "🌐";
    const mode = currentUser.matching_mode || "local";
    const avatar = currentUser.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${currentUser.id}`;
    const gender = currentUser.gender || "Boy";
    const isGirl = gender.toLowerCase() === "girl" || gender.toLowerCase() === "female";
    const genderIcon = isGirl ? "👧" : "👦";
    const genderLabel = isGirl ? "Girl" : "Boy";

    // Header Updates
    headerLangFlag.textContent = flag;
    headerLangText.textContent = lang;
    headerAvatarImg.src = avatar;
    streakDays.textContent = currentUser.streak_days || 1;
    freeMinsBadge.textContent = currentUser.daily_free_minutes || 0;

    // Calls Tab Updates
    userAvatar.src = avatar;
    userNameDisplay.textContent = currentUser.is_incognito ? (currentUser.incognito_name || "Incognito Learner") : currentUser.name;
    userLevelBadge.textContent = currentUser.level || "Intermediate";
    userLangFlag.textContent = flag;
    userLangName.textContent = lang;

    const userGenderBadge = document.getElementById("userGenderBadge");
    if (userGenderBadge) {
        userGenderBadge.textContent = `${genderIcon} ${genderLabel}`;
        userGenderBadge.className = isGirl
            ? "text-[10px] bg-rose-50 text-rose-700 font-bold px-2 py-0.5 rounded-md border border-rose-100"
            : "text-[10px] bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded-md border border-indigo-100";
    }

    // Matching Mode State & Descriptions
    updateMatchingModeUI(mode, lang, flag);

    // Profile Tab Updates
    profileHeroName.textContent = currentUser.name;
    profileHeroEmail.textContent = currentUser.email || "";
    profileHeroAvatar.src = avatar;
    profileHeroLang.innerHTML = `<span>${flag}</span> Native: ${lang}`;
    profileHeroLevel.textContent = currentUser.level || "Intermediate";
    profileHeroMode.textContent = mode === "local" ? `Mode: Local (${lang})` : "Mode: Global Practice";
    profileHeroBio.textContent = currentUser.bio ? `"${currentUser.bio}"` : "";

    const profileHeroGender = document.getElementById("profileHeroGender");
    if (profileHeroGender) {
        profileHeroGender.innerHTML = `<span>${genderIcon}</span> ${genderLabel}`;
        profileHeroGender.className = isGirl
            ? "text-xs bg-rose-50 text-rose-700 border border-rose-200 font-bold px-3 py-1 rounded-full flex items-center gap-1"
            : "text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold px-3 py-1 rounded-full flex items-center gap-1";
    }

    document.getElementById("statMinsSpoken").textContent = currentUser.total_minutes_spoken || 0;
    document.getElementById("statTotalCalls").textContent = currentUser.total_calls || 0;
    document.getElementById("statRating").innerHTML = `${currentUser.rating || 4.8} <i data-lucide="star" class="w-3.5 h-3.5 fill-amber-500"></i>`;

    // Load Friends and Call History
    loadFriends();
    loadCallHistory();

    lucide.createIcons();
}

function updateMatchingModeUI(mode, lang, flag) {
    if (mode === "local") {
        modeLocalBtn.classList.add("active", "bg-white", "text-brand-700", "shadow-sm", "border", "border-brand-200");
        modeLocalBtn.classList.remove("text-slate-600");
        modeGlobalBtn.classList.remove("active", "bg-white", "text-brand-700", "shadow-sm", "border", "border-brand-200");
        modeGlobalBtn.classList.add("text-slate-600");

        modeLocalFlag.textContent = flag;
        modeLocalSubtext.textContent = `${lang} to ${lang}`;
        activeModeBadgeText.textContent = `${lang} ➔ ${lang}`;
        modeDescription.innerHTML = `Matches strictly with fellow <strong class="text-brand-700">${lang}</strong> speakers. Practice English comfortably without hesitation!`;
        callCardHeading.textContent = `1-on-1 Practice (${lang} Peers)`;
        callCardSubheading.textContent = `Connect instantly with a fellow ${lang} speaker for a 15-minute spoken English session.`;
    } else {
        modeGlobalBtn.classList.add("active", "bg-white", "text-brand-700", "shadow-sm", "border", "border-brand-200");
        modeGlobalBtn.classList.remove("text-slate-600");
        modeLocalBtn.classList.remove("active", "bg-white", "text-brand-700", "shadow-sm", "border", "border-brand-200");
        modeLocalBtn.classList.add("text-slate-600");

        modeLocalFlag.textContent = flag;
        modeLocalSubtext.textContent = `${lang} to ${lang}`;
        activeModeBadgeText.textContent = "Global (Worldwide)";
        modeDescription.innerHTML = `Matches with English learners <strong class="text-indigo-700">worldwide</strong>. Full English immersion across global accents!`;
        callCardHeading.textContent = "1-on-1 Global Voice Practice";
        callCardSubheading.textContent = "Connect with English learners worldwide for diverse conversational fluency.";
    }
}

// ----------------- Profile Modal & Avatar Shuffler -----------------

function setupProfileModalHandlers() {
    const closeEditProfileModalBtn = document.getElementById("closeEditProfileModalBtn");
    const saveProfileBtn = document.getElementById("saveProfileBtn");

    const editProfileName = document.getElementById("editProfileName");
    const editProfileGender = document.getElementById("editProfileGender");
    const editProfileLang = document.getElementById("editProfileLang");
    const editProfileLevel = document.getElementById("editProfileLevel");
    const editProfileMode = document.getElementById("editProfileMode");
    const editProfileBio = document.getElementById("editProfileBio");
    const profileSaveNotice = document.getElementById("profileSaveNotice");

    const openModal = () => {
        if (!currentUser) return;
        editProfileName.value = currentUser.name || "";
        if (editProfileGender) editProfileGender.value = currentUser.gender || "Boy";
        editProfileLang.value = currentUser.native_language || "Telugu";
        editProfileLevel.value = currentUser.level || "Intermediate";
        editProfileMode.value = currentUser.matching_mode || "local";
        editProfileBio.value = currentUser.bio || "";
        profileSaveNotice.classList.add("hidden");
        editProfileModal.classList.remove("hidden");
    };

    openEditProfileBtn.addEventListener("click", openModal);
    headerLangPill.addEventListener("click", openModal);
    headerUserBtn.addEventListener("click", () => {
        document.querySelector(`.nav-tab-btn[data-tab="tabProfile"]`).click();
    });

    closeEditProfileModalBtn.addEventListener("click", () => {
        editProfileModal.classList.add("hidden");
    });

    // Shuffle Avatar
    shuffleAvatarBtn.addEventListener("click", async () => {
        if (!currentUser) return;
        const newSeed = "user_" + Math.random().toString(36).substring(2, 10);
        const newAvatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${newSeed}`;
        currentUser.avatar = newAvatar;
        updateUIWithUser();

        try {
            await fetch("/api/auth/profile", {
                method: "PUT",
                headers: {
                    "Authorization": `Bearer ${authToken}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ avatar: newAvatar })
            });
        } catch (e) {}
    });

    // Save Profile
    saveProfileBtn.addEventListener("click", async () => {
        const updates = {
            name: editProfileName.value.trim(),
            gender: editProfileGender ? editProfileGender.value : (currentUser.gender || "Boy"),
            native_language: editProfileLang.value,
            level: editProfileLevel.value,
            matching_mode: editProfileMode.value,
            bio: editProfileBio.value.trim()
        };

        try {
            const res = await fetch("/api/auth/profile", {
                method: "PUT",
                headers: {
                    "Authorization": `Bearer ${authToken}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(updates)
            });
            const data = await res.json();
            if (res.ok && data.user) {
                currentUser = data.user;
                updateUIWithUser();
                profileSaveNotice.classList.remove("hidden");
                setTimeout(() => {
                    editProfileModal.classList.add("hidden");
                }, 1000);
            } else {
                alert("Failed to update profile: " + (data.detail || "Server error"));
            }
        } catch (e) {
            alert("Error saving profile");
        }
    });
}

// Incognito Mode Toggle
const toggleIncognitoBtn = document.getElementById("toggleIncognitoBtn");
const incognitoSubtitle = document.getElementById("incognitoSubtitle");
const incognitoText = document.getElementById("incognitoText");
const incognitoIcon = document.getElementById("incognitoIcon");

toggleIncognitoBtn.addEventListener("click", () => {
    if (!currentUser) return;
    currentUser.is_incognito = !currentUser.is_incognito;
    if (currentUser.is_incognito) {
        toggleIncognitoBtn.classList.add("bg-brand-50", "border-brand-500", "text-brand-700");
        incognitoSubtitle.textContent = "Incognito Active (Identity hidden)";
        incognitoText.textContent = "Incognito ON";
        userNameDisplay.textContent = currentUser.incognito_name || "Incognito Learner";
        incognitoIcon.classList.add("text-brand-600");
    } else {
        toggleIncognitoBtn.classList.remove("bg-brand-50", "border-brand-500", "text-brand-700");
        incognitoSubtitle.textContent = "Regular Mode (Name visible)";
        incognitoText.textContent = "Incognito";
        userNameDisplay.textContent = currentUser.name;
        incognitoIcon.classList.remove("text-brand-600");
    }
});

// Partner Gender Preference Selectors
let partnerGenderPref = "Any";
const genderPrefBtns = document.querySelectorAll(".gender-pref-btn");
const genderPrefBadge = document.getElementById("genderPrefBadge");
const genderPrefHint = document.getElementById("genderPrefHint");

genderPrefBtns.forEach(btn => {
    btn.addEventListener("click", () => {
        genderPrefBtns.forEach(b => {
            b.classList.remove("active", "bg-white", "text-brand-700", "shadow-sm", "border", "border-brand-200");
            b.classList.add("text-slate-600");
        });
        btn.classList.add("active", "bg-white", "text-brand-700", "shadow-sm", "border", "border-brand-200");
        btn.classList.remove("text-slate-600");

        partnerGenderPref = btn.getAttribute("data-pref") || "Any";
        if (currentUser) {
            currentUser.partner_gender_pref = partnerGenderPref;
        }

        if (genderPrefBadge && genderPrefHint) {
            if (partnerGenderPref === "Girls") {
                genderPrefBadge.textContent = "Girls Only";
                genderPrefBadge.className = "text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200";
                genderPrefHint.textContent = "👧 Calls will strictly connect with female learners.";
            } else if (partnerGenderPref === "Boys") {
                genderPrefBadge.textContent = "Boys Only";
                genderPrefBadge.className = "text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200";
                genderPrefHint.textContent = "👦 Calls will strictly connect with male learners.";
            } else {
                genderPrefBadge.textContent = "Opposite Gender First";
                genderPrefBadge.className = "text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-200";
                genderPrefHint.textContent = "✨ Connects with opposite gender first. If busy, pairs with active co-learners so you don't wait!";
            }
        }
    });
});

// Matching Mode Toggle Handlers (Local vs Global)
modeLocalBtn.addEventListener("click", async () => {
    if (!currentUser) return;
    currentUser.matching_mode = "local";
    updateMatchingModeUI("local", currentUser.native_language || "Telugu", LANGUAGE_FLAGS[currentUser.native_language] || "🇮🇳");
    try {
        await fetch("/api/auth/profile", {
            method: "PUT",
            headers: {
                "Authorization": `Bearer ${authToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ matching_mode: "local" })
        });
    } catch (e) {}
});

modeGlobalBtn.addEventListener("click", async () => {
    if (!currentUser) return;
    currentUser.matching_mode = "global";
    updateMatchingModeUI("global", currentUser.native_language || "Telugu", LANGUAGE_FLAGS[currentUser.native_language] || "🇮🇳");
    try {
        await fetch("/api/auth/profile", {
            method: "PUT",
            headers: {
                "Authorization": `Bearer ${authToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ matching_mode: "global" })
        });
    } catch (e) {}
});

// ----------------- Navigation -----------------
function setupNavigation() {
    const navButtons = document.querySelectorAll(".nav-tab-btn");
    const sections = {
        tabCalls: document.getElementById("tabCalls"),
        tabClubs: document.getElementById("tabClubs"),
        tabAi: document.getElementById("tabAi"),
        tabLearn: document.getElementById("tabLearn"),
        tabProfile: document.getElementById("tabProfile"),
    };

    navButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            navButtons.forEach(b => {
                b.classList.remove("active", "text-brand-600", "font-bold");
                b.classList.add("text-slate-400", "font-medium");
            });
            btn.classList.add("active", "text-brand-600", "font-bold");
            btn.classList.remove("text-slate-400", "font-medium");

            const targetTab = btn.getAttribute("data-tab");
            Object.keys(sections).forEach(key => {
                if (key === targetTab) {
                    sections[key].classList.remove("hidden");
                    sections[key].classList.add("flex");
                } else {
                    sections[key].classList.add("hidden");
                    sections[key].classList.remove("flex");
                }
            });

            if (targetTab === "tabClubs") loadAudioRooms();
            if (targetTab === "tabProfile") {
                loadFriends();
                loadCallHistory();
            }
        });
    });
}

// ----------------- P2P WebRTC Voice Calling -----------------
function setupCallHandlers() {
    const startCallBtn = document.getElementById("startCallBtn");
    const endCallBtn = document.getElementById("endCallBtn");
    const nextIcebreakerBtn = document.getElementById("nextIcebreakerBtn");

    startCallBtn.addEventListener("click", async () => {
        if (!currentUser) {
            renderView("auth");
            return;
        }

        AudioFX.init();
        if (currentUser.daily_free_minutes <= 0) {
            alert("You have reached your 20 daily free minutes. Check back tomorrow or earn minutes via referrals!");
            return;
        }

        try {
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (err) {
            console.warn("Microphone permission denied, proceeding with simulated audio session:", err);
        }

        openCallModal();
        connectCallSocket();
    });

    endCallBtn.addEventListener("click", () => {
        hangUpCall("You ended the call");
    });

    nextIcebreakerBtn.addEventListener("click", () => {
        rotateIcebreaker();
    });

    toggleMicBtn.addEventListener("click", () => {
        if (localStream) {
            const audioTrack = localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                if (audioTrack.enabled) {
                    callMicIcon.setAttribute("data-lucide", "mic");
                    toggleMicBtn.classList.remove("bg-rose-600");
                } else {
                    callMicIcon.setAttribute("data-lucide", "mic-off");
                    toggleMicBtn.classList.add("bg-rose-600");
                }
                lucide.createIcons();
            }
        }
    });
}

function openCallModal() {
    callModal.classList.remove("hidden");
    const lang = currentUser.native_language || "Telugu";
    const mode = currentUser.matching_mode || "local";
    
    if (mode === "local") {
        callStatusText.textContent = `Connecting to ${lang} queue...`;
        partnerName.textContent = `Searching for a fellow ${lang} speaker...`;
        partnerLevel.textContent = `Local Mode: ${lang} to ${lang}`;
        callMatchFlag.textContent = LANGUAGE_FLAGS[lang] || "🇮🇳";
        callMatchText.textContent = `${lang} ➔ ${lang} Match`;
    } else {
        callStatusText.textContent = "Connecting to global queue...";
        partnerName.textContent = "Searching for worldwide partner...";
        partnerLevel.textContent = "Global Mode: Open to all languages";
        callMatchFlag.textContent = "🌍";
        callMatchText.textContent = "Global Match";
    }

    partnerAvatar.src = "https://api.dicebear.com/7.x/bottts/svg?seed=search";
    callTimerDisplay.textContent = "15:00";
    rotateIcebreaker();
}

function connectCallSocket() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socketId = "sock_" + Math.random().toString(36).substring(2, 9);
    callSocket = new WebSocket(`${protocol}//${window.location.host}/ws/call/${socketId}`);

    callSocket.onopen = () => {
        callSocket.send(JSON.stringify({
            type: "join-queue",
            user: {
                user_id: currentUser.id,
                name: currentUser.name,
                incognito_name: currentUser.incognito_name,
                level: currentUser.level || "Intermediate",
                gender: currentUser.gender || "Boy",
                partner_gender_pref: currentUser.partner_gender_pref || partnerGenderPref || "Any",
                is_incognito: currentUser.is_incognito || false,
                native_language: currentUser.native_language || "Telugu",
                matching_mode: currentUser.matching_mode || "local",
                strict_level: false
            }
        }));
    };

    callSocket.onmessage = async (event) => {
        const msg = JSON.parse(event.data);

        if (msg.type === "waiting-in-queue") {
            callStatusText.textContent = msg.message || "Searching for a practice partner...";
            AudioFX.playRingtone();
        } else if (msg.type === "match-found") {
            handleMatchFound(msg);
        } else if (msg.type === "offer") {
            handleOffer(msg.offer);
        } else if (msg.type === "answer") {
            handleAnswer(msg.answer);
        } else if (msg.type === "ice-candidate") {
            if (peerConnection && msg.candidate) {
                try {
                    await peerConnection.addIceCandidate(new RTCIceCandidate(msg.candidate));
                } catch (e) {}
            }
        } else if (msg.type === "call-ended") {
            finishCallSession(msg.reason, msg.duration_seconds);
        } else if (msg.type === "talktime-exhausted") {
            alert(msg.message);
            closeCallModal();
        }
    };

    callSocket.onclose = () => {
        // Socket closed
    };
}

async function handleMatchFound(msg) {
    currentSessionId = msg.session_id;
    currentPartner = msg.partner;

    AudioFX.playConnected();
    callStatusText.textContent = "Connected • Live Voice Session";
    partnerName.textContent = msg.partner.name;
    
    const partnerLang = msg.partner.native_language || "Telugu";
    const partnerFlag = LANGUAGE_FLAGS[partnerLang] || "🌐";
    
    partnerLevel.textContent = `Level: ${msg.partner.level} ${msg.partner.is_incognito ? "(Incognito)" : ""}`;
    partnerLangBadge.textContent = `${partnerFlag} ${partnerLang}`;
    partnerAvatar.src = msg.partner.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${msg.partner.name}`;

    // Gender Badge
    const partnerGenderBadge = document.getElementById("partnerGenderBadge");
    if (partnerGenderBadge) {
        const pGender = msg.partner.gender || "Boy";
        const isGirl = pGender.toLowerCase() === "girl" || pGender.toLowerCase() === "female";
        partnerGenderBadge.textContent = isGirl ? "👧 Girl" : "👦 Boy";
        partnerGenderBadge.className = isGirl 
            ? "text-[11px] bg-rose-500/30 text-rose-200 font-semibold px-2.5 py-0.5 rounded-full" 
            : "text-[11px] bg-indigo-500/30 text-indigo-200 font-semibold px-2.5 py-0.5 rounded-full";
    }

    // In-Call Add Friend Button setup
    const inCallAddFriendBtn = document.getElementById("inCallAddFriendBtn");
    if (inCallAddFriendBtn) {
        inCallAddFriendBtn.innerHTML = `<i data-lucide="user-plus" class="w-3 h-3"></i> Add Friend`;
        inCallAddFriendBtn.classList.remove("bg-emerald-600", "cursor-default");
        inCallAddFriendBtn.onclick = async () => {
            if (!currentPartner || !currentPartner.user_id) return;
            try {
                const res = await fetch("/api/friends/add", {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${authToken}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({ friend_id: currentPartner.user_id })
                });
                if (res.ok) {
                    inCallAddFriendBtn.innerHTML = `<i data-lucide="check" class="w-3 h-3"></i> Added!`;
                    inCallAddFriendBtn.classList.add("bg-emerald-600");
                    loadFriends();
                }
            } catch (e) {}
        };
    }

    // Match Badge Info
    if (msg.match_type) {
        callMatchText.textContent = msg.match_type;
        callMatchFlag.textContent = msg.is_local ? partnerFlag : "🌍";
    }

    startCallTimer();
    initWebRTC(msg.role);
    lucide.createIcons();
}

function initWebRTC(role) {
    const config = {
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    };
    peerConnection = new RTCPeerConnection(config);

    if (localStream) {
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    }

    peerConnection.onicecandidate = (event) => {
        if (event.candidate && callSocket) {
            callSocket.send(JSON.stringify({
                type: "ice-candidate",
                candidate: event.candidate
            }));
        }
    };

    peerConnection.ontrack = (event) => {
        const remoteAudio = new Audio();
        remoteAudio.srcObject = event.streams[0];
        remoteAudio.play().catch(() => {});
    };

    if (role === "caller") {
        createAndSendOffer();
    }
}

async function createAndSendOffer() {
    try {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        if (callSocket) {
            callSocket.send(JSON.stringify({
                type: "offer",
                offer: offer
            }));
        }
    } catch (e) {}
}

async function handleOffer(offer) {
    try {
        if (!peerConnection) initWebRTC("receiver");
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        if (callSocket) {
            callSocket.send(JSON.stringify({
                type: "answer",
                answer: answer
            }));
        }
    } catch (e) {}
}

async function handleAnswer(answer) {
    try {
        if (peerConnection) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        }
    } catch (e) {}
}

function startCallTimer() {
    callDurationSeconds = 0;
    const maxSeconds = 15 * 60; // 15 mins session
    clearInterval(callTimerInterval);

    callTimerInterval = setInterval(() => {
        callDurationSeconds++;
        const remaining = maxSeconds - callDurationSeconds;
        if (remaining <= 0) {
            hangUpCall("Time limit reached");
            return;
        }

        const mins = Math.floor(remaining / 60);
        const secs = remaining % 60;
        callTimerDisplay.textContent = `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }, 1000);
}

function hangUpCall(reason = "Call ended") {
    if (callSocket) {
        callSocket.send(JSON.stringify({ type: "end-call" }));
        callSocket.close();
        callSocket = null;
    }
    finishCallSession(reason, callDurationSeconds);
}

function finishCallSession(reason, durationSec = 0) {
    clearInterval(callTimerInterval);
    AudioFX.playCallEnded();

    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
        localStream = null;
    }

    closeCallModal();

    if (currentPartner && durationSec > 5) {
        openFeedbackModal(currentPartner.name);
    }

    // Refresh profile stats
    loadUserProfile();
}

function closeCallModal() {
    callModal.classList.add("hidden");
    callStatusText.textContent = "Connecting to matchmaking queue...";
    clearInterval(callTimerInterval);
}

// ----------------- Post-Call Rating & Feedback -----------------
function openFeedbackModal(partnerNameStr) {
    const feedbackModal = document.getElementById("feedbackModal");
    const ratingPartnerName = document.getElementById("ratingPartnerName");
    if (ratingPartnerName) ratingPartnerName.textContent = partnerNameStr;
    
    const ratingFriendName = document.getElementById("ratingFriendName");
    if (ratingFriendName) ratingFriendName.textContent = partnerNameStr;

    feedbackModal.classList.remove("hidden");

    let selectedRating = 5;
    const starBtns = document.querySelectorAll(".star-btn");
    starBtns.forEach(btn => {
        btn.onclick = () => {
            selectedRating = parseInt(btn.getAttribute("data-val"));
            starBtns.forEach((b, idx) => {
                if (idx < selectedRating) {
                    b.classList.remove("text-slate-300");
                    b.classList.add("text-amber-400");
                } else {
                    b.classList.add("text-slate-300");
                    b.classList.remove("text-amber-400");
                }
            });
        };
    });

    // Reset and setup remark chips
    document.querySelectorAll(".remark-chip").forEach(chip => {
        chip.classList.remove("bg-brand-500", "text-white");
        chip.classList.add("bg-slate-100", "text-slate-700");
        chip.onclick = () => {
            const tag = chip.getAttribute("data-tag");
            const noteArea = document.getElementById("feedbackNote");
            if (noteArea) {
                if (noteArea.value.includes(tag)) {
                    noteArea.value = noteArea.value.replace(tag, "").replace(/\s*•\s*$/, "").trim();
                    chip.classList.remove("bg-brand-500", "text-white");
                    chip.classList.add("bg-slate-100", "text-slate-700");
                } else {
                    const current = noteArea.value.trim();
                    noteArea.value = current ? `${current} • ${tag}` : tag;
                    chip.classList.remove("bg-slate-100", "text-slate-700");
                    chip.classList.add("bg-brand-500", "text-white");
                }
            }
        };
    });

    const addFriendCheckbox = document.getElementById("addFriendCheckbox");
    if (addFriendCheckbox) addFriendCheckbox.checked = true;

    document.getElementById("submitFeedbackBtn").onclick = async () => {
        const feedbackText = document.getElementById("feedbackNote").value;
        const addFriend = addFriendCheckbox ? addFriendCheckbox.checked : false;

        try {
            await fetch("/api/feedback", {
                method: "POST",
                headers: { 
                    "Authorization": `Bearer ${authToken}`,
                    "Content-Type": "application/json" 
                },
                body: JSON.stringify({
                    session_id: currentSessionId || "session_generic",
                    user_id: currentUser ? currentUser.id : "guest",
                    partner_id: currentPartner ? (currentPartner.user_id || currentPartner.name) : "peer",
                    rating: selectedRating,
                    feedback: feedbackText,
                    add_friend: addFriend
                })
            });
            await loadUserProfile();
            await loadFriends();
            await loadCallHistory();
        } catch (e) {}

        feedbackModal.classList.add("hidden");
        document.getElementById("feedbackNote").value = "";
    };
    lucide.createIcons();
}

// ----------------- Friends & Call History Management -----------------
async function loadFriends() {
    const container = document.getElementById("friendsListContainer");
    const countBadge = document.getElementById("friendsCountBadge");
    if (!container || !authToken) return;

    try {
        const res = await fetch("/api/friends", {
            headers: { "Authorization": `Bearer ${authToken}` }
        });
        if (!res.ok) return;
        const friends = await res.json();
        if (countBadge) countBadge.textContent = friends.length;

        if (friends.length === 0) {
            container.innerHTML = `<p class="text-xs text-slate-400 italic text-center py-2">No friends added yet. Add peers during or after calls!</p>`;
            return;
        }

        container.innerHTML = "";
        friends.forEach(f => {
            const isGirl = (f.gender || "").toLowerCase() === "girl" || (f.gender || "").toLowerCase() === "female";
            const genderBadge = isGirl 
                ? `<span class="text-[9px] bg-rose-50 text-rose-700 font-bold px-1.5 py-0.5 rounded border border-rose-100">👧 Girl</span>`
                : `<span class="text-[9px] bg-indigo-50 text-indigo-700 font-bold px-1.5 py-0.5 rounded border border-indigo-100">👦 Boy</span>`;
            const flag = LANGUAGE_FLAGS[f.native_language] || "🌐";
            const avatar = f.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${f.name}`;

            const item = document.createElement("div");
            item.className = "flex items-center justify-between p-2.5 rounded-2xl border border-slate-100 hover:border-brand-200 transition bg-slate-50/50";
            item.innerHTML = `
                <div class="flex items-center gap-2.5">
                    <img src="${avatar}" class="w-9 h-9 rounded-full bg-white border border-slate-200">
                    <div class="flex flex-col">
                        <div class="flex items-center gap-1.5">
                            <span class="text-xs font-bold text-slate-800">${f.name}</span>
                            ${genderBadge}
                        </div>
                        <span class="text-[10px] text-slate-500 font-medium">
                            ${flag} ${f.native_language || "Telugu"} • ${f.level || "Intermediate"} • ⭐ ${f.rating || 4.8}
                        </span>
                    </div>
                </div>
                <button class="remove-friend-btn text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition" title="Remove Friend" data-id="${f.id}">
                    <i data-lucide="user-minus" class="w-4 h-4"></i>
                </button>
            `;
            const removeBtn = item.querySelector(".remove-friend-btn");
            removeBtn.onclick = async () => {
                if (!confirm(`Remove ${f.name} from friends?`)) return;
                try {
                    await fetch(`/api/friends/remove/${f.id}`, {
                        method: "DELETE",
                        headers: { "Authorization": `Bearer ${authToken}` }
                    });
                    loadFriends();
                    loadCallHistory();
                } catch (e) {}
            };
            container.appendChild(item);
        });
        lucide.createIcons();
    } catch (e) {}
}

async function loadCallHistory() {
    const container = document.getElementById("callHistoryContainer");
    if (!container || !authToken) return;

    try {
        const res = await fetch("/api/calls/history", {
            headers: { "Authorization": `Bearer ${authToken}` }
        });
        if (!res.ok) return;
        const history = await res.json();

        if (history.length === 0) {
            container.innerHTML = `<p class="text-xs text-slate-400 italic text-center py-2">No calls logged yet. Start a call to build your history!</p>`;
            return;
        }

        container.innerHTML = "";
        history.forEach(log => {
            const isGirl = (log.partner_gender || "").toLowerCase() === "girl" || (log.partner_gender || "").toLowerCase() === "female";
            const genderBadge = isGirl 
                ? `<span class="text-[9px] bg-rose-50 text-rose-700 font-bold px-1.5 py-0.5 rounded border border-rose-100">👧 Girl</span>`
                : `<span class="text-[9px] bg-indigo-50 text-indigo-700 font-bold px-1.5 py-0.5 rounded border border-indigo-100">👦 Boy</span>`;
            const flag = LANGUAGE_FLAGS[log.partner_language] || "🌐";
            const avatar = log.partner_avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${log.partner_name}`;

            const ratingDisplay = log.rating_given 
                ? `<span class="text-[10px] text-amber-600 font-bold flex items-center gap-0.5">⭐ ${log.rating_given}/5</span>` 
                : `<span class="text-[10px] text-slate-400 italic">No rating</span>`;

            const item = document.createElement("div");
            item.className = "flex items-center justify-between p-3 rounded-2xl border border-slate-100 bg-white shadow-xs hover:border-brand-200 transition";
            item.innerHTML = `
                <div class="flex items-center gap-3">
                    <img src="${avatar}" class="w-10 h-10 rounded-full bg-slate-100 border border-slate-200">
                    <div class="flex flex-col">
                        <div class="flex items-center gap-1.5">
                            <span class="text-xs font-bold text-slate-900">${log.partner_name}</span>
                            ${genderBadge}
                        </div>
                        <span class="text-[10px] text-slate-500 font-medium">
                            ${flag} ${log.partner_language || "Telugu"} • ⏱️ ${log.duration_text || log.duration_seconds + "s"} • ${log.created_at || "Recent"}
                        </span>
                        ${log.feedback_given ? `<p class="text-[10px] text-slate-600 italic mt-0.5 line-clamp-1">"${log.feedback_given}"</p>` : ''}
                    </div>
                </div>
                <div class="flex flex-col items-end gap-1.5">
                    ${ratingDisplay}
                    ${log.is_friend 
                        ? `<span class="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-0.5"><i data-lucide="check" class="w-3 h-3"></i> Friend</span>`
                        : `<button class="add-friend-history-btn text-[10px] bg-brand-50 hover:bg-brand-100 text-brand-700 font-bold px-2.5 py-1 rounded-full border border-brand-200 flex items-center gap-1 transition" data-friend-id="${log.partner_id}">
                            <i data-lucide="user-plus" class="w-3 h-3"></i> Add Friend
                           </button>`
                    }
                </div>
            `;
            const addBtn = item.querySelector(".add-friend-history-btn");
            if (addBtn) {
                addBtn.onclick = async () => {
                    const fid = addBtn.getAttribute("data-friend-id");
                    if (!fid) return;
                    try {
                        const r = await fetch("/api/friends/add", {
                            method: "POST",
                            headers: {
                                "Authorization": `Bearer ${authToken}`,
                                "Content-Type": "application/json"
                            },
                            body: JSON.stringify({ friend_id: fid })
                        });
                        if (r.ok) {
                            loadFriends();
                            loadCallHistory();
                        }
                    } catch (e) {}
                };
            }
            container.appendChild(item);
        });
        lucide.createIcons();
    } catch (e) {}
}

// ----------------- Audio Voice Clubs -----------------
function setupClubsHandlers() {
    const openCreateRoomModalBtn = document.getElementById("openCreateRoomModalBtn");
    const closeCreateRoomModalBtn = document.getElementById("closeCreateRoomModalBtn");
    const createRoomModal = document.getElementById("createRoomModal");
    const submitCreateRoomBtn = document.getElementById("submitCreateRoomBtn");
    const leaveRoomBtn = document.getElementById("leaveRoomBtn");
    const raiseHandBtn = document.getElementById("raiseHandBtn");
    const sendRoomMsgBtn = document.getElementById("sendRoomMsgBtn");
    const roomMsgInput = document.getElementById("roomMsgInput");

    openCreateRoomModalBtn.addEventListener("click", () => {
        if (!currentUser) {
            renderView("auth");
            return;
        }
        createRoomModal.classList.remove("hidden");
    });
    closeCreateRoomModalBtn.addEventListener("click", () => createRoomModal.classList.add("hidden"));

    submitCreateRoomBtn.addEventListener("click", async () => {
        const title = document.getElementById("newRoomTitle").value.trim();
        const category = document.getElementById("newRoomCategory").value;
        const desc = document.getElementById("newRoomDesc").value.trim();

        if (!title) {
            alert("Please enter a club title");
            return;
        }

        try {
            const res = await fetch("/api/rooms", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: title,
                    category: category,
                    description: desc,
                    host_id: currentUser ? currentUser.id : "host",
                    host_name: currentUser ? currentUser.name : "Learner Host"
                })
            });
            const data = await res.json();
            createRoomModal.classList.add("hidden");
            document.getElementById("newRoomTitle").value = "";
            document.getElementById("newRoomDesc").value = "";
            loadAudioRooms();
            joinAudioRoom(data.room_id, data.title, category, currentUser ? currentUser.name : "Host");
        } catch (e) {}
    });

    leaveRoomBtn.addEventListener("click", () => leaveAudioRoom());

    raiseHandBtn.addEventListener("click", () => {
        if (roomSocket) {
            roomSocket.send(JSON.stringify({ type: "raise-hand" }));
            raiseHandBtn.textContent = "Hand Raised!";
            raiseHandBtn.classList.replace("bg-brand-600", "bg-emerald-600");
        }
    });

    sendRoomMsgBtn.addEventListener("click", () => sendRoomMessage());
    roomMsgInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") sendRoomMessage();
    });
}

function sendRoomMessage() {
    const input = document.getElementById("roomMsgInput");
    const text = input.value.trim();
    if (text && roomSocket) {
        roomSocket.send(JSON.stringify({ type: "room-chat", text: text }));
        input.value = "";
    }
}

async function loadAudioRooms() {
    const container = document.getElementById("roomsContainer");
    try {
        const res = await fetch("/api/rooms");
        const rooms = await res.json();
        container.innerHTML = "";

        rooms.forEach(r => {
            const card = document.createElement("div");
            card.className = "bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex flex-col gap-2 hover:border-brand-300 transition cursor-pointer";
            card.innerHTML = `
                <div class="flex items-center justify-between">
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider bg-brand-50 text-brand-700">${r.category}</span>
                    <span class="text-xs text-slate-400 font-medium flex items-center gap-1">
                        <i data-lucide="headphones" class="w-3.5 h-3.5"></i> ${r.listener_count || 1} listening
                    </span>
                </div>
                <h3 class="font-extrabold text-sm text-slate-900">${r.title}</h3>
                <p class="text-xs text-slate-500 line-clamp-2">${r.description || 'Live speaking practice and audio stage.'}</p>
                <div class="flex items-center justify-between pt-2 border-t border-slate-100 mt-1">
                    <div class="flex items-center gap-1.5">
                        <img src="https://api.dicebear.com/7.x/bottts/svg?seed=${r.host_name}" class="w-6 h-6 rounded-full bg-slate-100">
                        <span class="text-xs font-semibold text-slate-700">${r.host_name}</span>
                    </div>
                    <button class="bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold px-3 py-1.5 rounded-xl shadow-sm">
                        Join Stage
                    </button>
                </div>
            `;
            card.addEventListener("click", () => {
                if (!currentUser) {
                    renderView("auth");
                    return;
                }
                joinAudioRoom(r.id, r.title, r.category, r.host_name);
            });
            container.appendChild(card);
        });
        lucide.createIcons();
    } catch (e) {}
}

function joinAudioRoom(roomId, title, category, hostName) {
    const roomModal = document.getElementById("roomModal");
    document.getElementById("roomTitleHeader").textContent = title;
    document.getElementById("roomCategoryBadge").textContent = category;
    document.getElementById("roomHostName").textContent = hostName;
    document.getElementById("roomHostAvatar").src = `https://api.dicebear.com/7.x/bottts/svg?seed=${hostName}`;
    roomModal.classList.remove("hidden");

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socketId = "room_sock_" + Math.random().toString(36).substring(2, 9);
    roomSocket = new WebSocket(`${protocol}//${window.location.host}/ws/room/${roomId}/${socketId}`);

    roomSocket.onopen = () => {
        roomSocket.send(JSON.stringify({
            type: "join-room",
            user: {
                id: currentUser ? currentUser.id : "guest",
                name: currentUser ? currentUser.name : "Learner",
                avatar: currentUser ? currentUser.avatar : ""
            }
        }));
    };

    roomSocket.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        const chatBox = document.getElementById("roomChatContainer");

        if (msg.type === "room-user-joined") {
            document.getElementById("roomAudienceCount").textContent = msg.total_listeners;
            const p = document.createElement("p");
            p.className = "text-emerald-400 text-[11px]";
            p.textContent = `👋 ${msg.user.name || "A learner"} joined the room`;
            chatBox.appendChild(p);
            chatBox.scrollTop = chatBox.scrollHeight;
        } else if (msg.type === "room-chat-message") {
            const p = document.createElement("p");
            p.innerHTML = `<strong class="text-brand-300">${msg.sender}:</strong> <span class="text-white">${msg.text}</span>`;
            chatBox.appendChild(p);
            chatBox.scrollTop = chatBox.scrollHeight;
        } else if (msg.type === "user-raised-hand") {
            const p = document.createElement("p");
            p.className = "text-amber-300 text-[11px]";
            p.textContent = `✋ ${msg.user_name} raised hand to speak`;
            chatBox.appendChild(p);
            chatBox.scrollTop = chatBox.scrollHeight;
        }
    };
}

function leaveAudioRoom() {
    if (roomSocket) {
        roomSocket.close();
        roomSocket = null;
    }
    document.getElementById("roomModal").classList.add("hidden");
    document.getElementById("roomChatContainer").innerHTML = '<p class="text-slate-400 italic text-[11px]">Welcome to the audio room! Raise your hand to speak.</p>';
}

// ----------------- AI Tutor ("Aria") -----------------
function setupAiTutorHandlers() {
    const aiTextInput = document.getElementById("aiTextInput");
    const sendAiTextBtn = document.getElementById("sendAiTextBtn");
    const aiMicBtn = document.getElementById("aiMicBtn");
    const aiVoiceStatusBanner = document.getElementById("aiVoiceStatusBanner");
    const aiVoiceStatusText = document.getElementById("aiVoiceStatusText");
    const aiVoiceTimerBadge = document.getElementById("aiVoiceTimerBadge");
    const aiVoiceSendNowBtn = document.getElementById("aiVoiceSendNowBtn");

    let isRecordingVoice = false;
    let countdownInterval = null;
    let secondsRemaining = 4;
    let recognition = null;

    const clearSilenceTimers = () => {
        if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
    };

    const stopVoiceRecognition = (submitNow = false) => {
        clearSilenceTimers();
        isRecordingVoice = false;

        if (aiMicBtn) {
            aiMicBtn.classList.remove("bg-rose-100", "text-rose-600", "animate-pulse");
        }
        if (aiVoiceStatusBanner) {
            aiVoiceStatusBanner.classList.add("hidden");
            aiVoiceStatusBanner.classList.remove("flex");
        }

        if (recognition) {
            try { recognition.stop(); } catch (e) {}
        }

        if (submitNow) {
            handleAiChatSubmit();
        }
    };

    const startSilenceCountdown = () => {
        clearSilenceTimers();
        secondsRemaining = 4;

        if (aiVoiceStatusText) aiVoiceStatusText.textContent = "⏳ Silence detected...";
        if (aiVoiceTimerBadge) aiVoiceTimerBadge.textContent = `Auto-send in ${secondsRemaining}s`;

        countdownInterval = setInterval(() => {
            secondsRemaining--;
            if (secondsRemaining > 0) {
                if (aiVoiceTimerBadge) aiVoiceTimerBadge.textContent = `Auto-send in ${secondsRemaining}s`;
            } else {
                clearSilenceTimers();
                stopVoiceRecognition(true);
            }
        }, 1000);
    };

    // Voice Dictation (Web Speech API)
    if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-US";

        recognition.onstart = () => {
            isRecordingVoice = true;
            aiMicBtn.classList.add("bg-rose-100", "text-rose-600", "animate-pulse");
            if (aiVoiceStatusBanner) {
                aiVoiceStatusBanner.classList.remove("hidden");
                aiVoiceStatusBanner.classList.add("flex");
            }
            if (aiVoiceStatusText) aiVoiceStatusText.textContent = "🎙️ Listening... speak naturally";
            if (aiVoiceTimerBadge) aiVoiceTimerBadge.textContent = "Will send after 4s silence";
        };

        recognition.onresult = (event) => {
            let fullTranscript = "";
            for (let i = 0; i < event.results.length; ++i) {
                fullTranscript += event.results[i][0].transcript;
            }
            const cleanText = fullTranscript.trim();
            if (cleanText) {
                aiTextInput.value = cleanText;
                if (aiVoiceStatusText) aiVoiceStatusText.textContent = "🎙️ Listening... speak naturally";
                // Reset or restart 4-second silence countdown on speech detected
                startSilenceCountdown();
            }
        };

        recognition.onerror = (event) => {
            if (event.error !== "no-speech") {
                stopVoiceRecognition(false);
            }
        };

        recognition.onend = () => {
            if (isRecordingVoice) {
                if (aiTextInput.value.trim().length > 0 && !countdownInterval) {
                    startSilenceCountdown();
                } else if (aiTextInput.value.trim().length === 0) {
                    stopVoiceRecognition(false);
                }
            } else {
                stopVoiceRecognition(false);
            }
        };

        aiMicBtn.addEventListener("click", () => {
            if (isRecordingVoice) {
                // User clicked mic to finish speaking -> stop and send immediately
                stopVoiceRecognition(true);
            } else {
                // Start voice dictation session
                aiTextInput.value = "";
                clearSilenceTimers();
                try {
                    recognition.start();
                } catch (e) {
                    try {
                        recognition.stop();
                        setTimeout(() => recognition.start(), 200);
                    } catch (err) {}
                }
            }
        });

        if (aiVoiceSendNowBtn) {
            aiVoiceSendNowBtn.addEventListener("click", () => {
                stopVoiceRecognition(true);
            });
        }
    } else {
        if (aiMicBtn) {
            aiMicBtn.title = "Voice recognition not supported in this browser";
            aiMicBtn.classList.add("opacity-50", "cursor-not-allowed");
        }
    }

    sendAiTextBtn.addEventListener("click", () => {
        stopVoiceRecognition(false);
        handleAiChatSubmit();
    });

    aiTextInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            stopVoiceRecognition(false);
            handleAiChatSubmit();
        }
    });
}

async function handleAiChatSubmit() {
    const input = document.getElementById("aiTextInput");
    const text = input.value.trim();
    if (!text) return;
    input.value = "";

    const aiChatBox = document.getElementById("aiChatBox");

    // Append user message
    const userBubble = document.createElement("div");
    userBubble.className = "flex gap-2.5 items-start justify-end";
    userBubble.innerHTML = `
        <div class="bg-brand-600 text-white rounded-2xl rounded-tr-none p-3 text-xs leading-relaxed max-w-[85%] shadow-sm">
            ${text}
        </div>
    `;
    aiChatBox.appendChild(userBubble);
    aiChatBox.scrollTop = aiChatBox.scrollHeight;

    aiChatHistory.push({ role: "user", content: text });

    // Show typing placeholder
    const typingBubble = document.createElement("div");
    typingBubble.className = "flex gap-2.5 items-start";
    typingBubble.innerHTML = `
        <div class="w-7 h-7 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center flex-shrink-0 text-xs font-bold">A</div>
        <div class="bg-slate-100 rounded-2xl rounded-tl-none p-3 text-xs text-slate-400 italic">
            Aria is typing...
        </div>
    `;
    aiChatBox.appendChild(typingBubble);
    aiChatBox.scrollTop = aiChatBox.scrollHeight;

    try {
        const res = await fetch("/api/ai/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                user_id: currentUser ? currentUser.id : "guest",
                message: text,
                history: aiChatHistory
            })
        });
        const data = await res.json();
        typingBubble.remove();

        // Append AI response
        const aiBubble = document.createElement("div");
        aiBubble.className = "flex gap-2.5 items-start";
        aiBubble.innerHTML = `
            <div class="w-7 h-7 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center flex-shrink-0 text-xs font-bold">A</div>
            <div class="bg-slate-100 rounded-2xl rounded-tl-none p-3 text-xs text-slate-800 leading-relaxed max-w-[85%] shadow-sm">
                ${data.reply}
            </div>
        `;
        aiChatBox.appendChild(aiBubble);
        aiChatBox.scrollTop = aiChatBox.scrollHeight;

        aiChatHistory.push({ role: "assistant", content: data.reply });

        // Update Grammar Polish Card
        const card = document.getElementById("aiCorrectionCard");
        if (data.feedback && data.feedback.corrections && data.feedback.corrections.length > 0) {
            const corr = data.feedback.corrections[0];
            document.getElementById("grammarOriginal").textContent = `"${corr.original}"`;
            document.getElementById("grammarSuggested").textContent = `"${corr.suggested}"`;
            document.getElementById("grammarRule").textContent = corr.rule;
            document.getElementById("fluencyScorePill").textContent = `Score: ${data.feedback.metrics.overall}%`;
            card.classList.remove("hidden");
        } else {
            card.classList.add("hidden");
        }
    } catch (e) {
        typingBubble.remove();
    }
}

// ----------------- Daily Learning Hub -----------------
async function loadDailyWords() {
    const container = document.getElementById("vocabListContainer");
    try {
        const res = await fetch("/api/catalog/words");
        const words = await res.json();
        container.innerHTML = "";

        words.forEach(w => {
            const card = document.createElement("div");
            card.className = "bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex flex-col gap-1.5";
            card.innerHTML = `
                <div class="flex items-center justify-between">
                    <span class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                        w.type === 'Idiom' ? 'bg-indigo-50 text-indigo-700' :
                        w.type === 'Slang' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
                    }">${w.type}</span>
                    <span class="text-[10px] text-slate-400 font-medium">${w.category}</span>
                </div>
                <h4 class="font-extrabold text-sm text-slate-900 mt-0.5">"${w.phrase}"</h4>
                <p class="text-xs text-slate-600 font-medium"><strong>Meaning:</strong> ${w.meaning}</p>
                <p class="text-xs text-slate-500 italic mt-0.5"><strong>e.g.</strong> "${w.example}"</p>
            `;
            container.appendChild(card);
        });
    } catch (e) {}
}

async function loadSpeakingTopics() {
    const container = document.getElementById("scenariosContainer");
    try {
        const res = await fetch("/api/catalog/topics");
        const topics = await res.json();
        container.innerHTML = "";

        topics.forEach(t => {
            const card = document.createElement("div");
            card.className = "bg-white rounded-2xl p-3.5 shadow-sm border border-slate-100 flex flex-col gap-1.5";
            card.innerHTML = `
                <div class="flex items-center gap-2">
                    <span class="text-lg">${t.icon}</span>
                    <h4 class="font-bold text-xs text-slate-800">${t.title}</h4>
                </div>
                <p class="text-[11px] text-slate-500">${t.cue_card}</p>
                <div class="flex flex-wrap gap-1 mt-1">
                    ${t.vocab_hints.map(v => `<span class="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium">${v}</span>`).join("")}
                </div>
            `;
            container.appendChild(card);
        });

        // Setup Daily Topic Card
        if (topics.length > 0) {
            const t0 = topics[0];
            document.getElementById("dailyTopicTitle").textContent = t0.title;
            document.getElementById("dailyTopicCue").textContent = t0.cue_card;
            document.getElementById("dailyTopicVocab").innerHTML = t0.vocab_hints.map(v => `<span class="text-[10px] bg-brand-50 text-brand-700 font-medium px-2 py-0.5 rounded-md">${v}</span>`).join("");
        }
    } catch (e) {}
}

async function loadIcebreakers() {
    try {
        const res = await fetch("/api/catalog/icebreakers");
        icebreakers = await res.json();
    } catch (e) {}
}

function rotateIcebreaker() {
    if (icebreakers.length > 0) {
        icebreakerIndex = (icebreakerIndex + 1) % icebreakers.length;
        inCallPromptText.textContent = `"${icebreakers[icebreakerIndex]}"`;
    }
}

// ----------------- PWA Service Worker & Android Install Prompt -----------------
let deferredInstallPrompt = null;

function setupPwaInstall() {
    const installBanner = document.getElementById("pwaInstallBanner");
    const installBtn = document.getElementById("pwaInstallBtn");
    const dismissBtn = document.getElementById("pwaDismissBtn");
    const profileInstallBtn = document.getElementById("profileInstallAppBtn");

    // Register Service Worker
    if ("serviceWorker" in navigator) {
        window.addEventListener("load", () => {
            navigator.serviceWorker.register("/sw.js")
                .then((reg) => {
                    console.log("OpenTalk Service Worker registered with scope:", reg.scope);
                })
                .catch((err) => {
                    console.warn("Service Worker registration notice:", err);
                });
        });
    }

    // Capture Android Chrome install prompt
    window.addEventListener("beforeinstallprompt", (e) => {
        // Prevent default mini-infobar from appearing
        e.preventDefault();
        deferredInstallPrompt = e;

        // Check if previously dismissed in this session
        const dismissed = sessionStorage.getItem("opentalk_pwa_dismissed");
        if (!dismissed && installBanner) {
            installBanner.classList.remove("hidden");
            installBanner.classList.add("flex");
        }
        if (profileInstallBtn) {
            profileInstallBtn.classList.remove("hidden");
        }
        lucide.createIcons();
    });

    const triggerInstall = async () => {
        if (!deferredInstallPrompt) {
            alert("To install OpenTalk on Android, open your browser menu (⋮) and tap 'Add to Home screen' or 'Install App'.");
            return;
        }
        deferredInstallPrompt.prompt();
        const choice = await deferredInstallPrompt.userChoice;
        if (choice && choice.outcome === "accepted") {
            console.log("User accepted OpenTalk PWA installation");
        }
        deferredInstallPrompt = null;
        if (installBanner) installBanner.classList.add("hidden");
        if (profileInstallBtn) profileInstallBtn.classList.add("hidden");
    };

    if (installBtn) installBtn.addEventListener("click", triggerInstall);
    if (profileInstallBtn) profileInstallBtn.addEventListener("click", triggerInstall);

    if (dismissBtn) {
        dismissBtn.addEventListener("click", () => {
            sessionStorage.setItem("opentalk_pwa_dismissed", "true");
            if (installBanner) installBanner.classList.add("hidden");
        });
    }

    window.addEventListener("appinstalled", () => {
        deferredInstallPrompt = null;
        if (installBanner) installBanner.classList.add("hidden");
        if (profileInstallBtn) profileInstallBtn.classList.add("hidden");
        console.log("OpenTalk installed successfully on device!");
    });
}

// Start application
window.addEventListener("DOMContentLoaded", initApp);
