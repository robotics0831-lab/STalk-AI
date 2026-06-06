const STORAGE_KEYS = {
  settings: "stalk_settings",
  token: "stalk_token",
};

const DEFAULT_SETTINGS = {
  personality: "friendly",
  customPrompt: "",
  provider: "groq",
  groqApiKey: "",
  geminiApiKey: "",
  model: "llama-3.3-70b-versatile",
  autoSpeak: false,
};

let settings = loadSettings();
let conversations = [];
let currentConversationId = null;
let uploadedFiles = [];
let isGenerating = false;
let serverConfig = { hosted: false, ready: true, provider: "groq", model: "llama-3.3-70b-versatile" };
let currentUser = null;
let authMode = "signin";

// DOM
const messagesEl = document.getElementById("messages");
const welcomeEl = document.getElementById("welcome");
const chatInput = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");
const fileInput = document.getElementById("fileInput");
const uploadedFilesEl = document.getElementById("uploadedFiles");
const conversationListEl = document.getElementById("conversationList");
const voiceBtn = document.getElementById("voiceBtn");
const imageInput = document.getElementById("imageInput");
const imageSendBtn = document.getElementById("imageSendBtn");
const imageGallery = document.getElementById("imageGallery");
const settingsModal = document.getElementById("settingsModal");
const authModal = document.getElementById("authModal");
const sidebar = document.getElementById("sidebar");

// --- Auth & API ---

function getToken() {
  return localStorage.getItem(STORAGE_KEYS.token);
}

function authHeaders() {
  const token = getToken();
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function authHeadersOnly() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function updateAuthUI() {
  document.getElementById("authArea").classList.toggle("hidden", !!currentUser);
  document.getElementById("userArea").classList.toggle("hidden", !currentUser);
  if (currentUser) {
    document.getElementById("userName").textContent = currentUser.name;
  }
}

async function loadSession() {
  const token = getToken();
  if (!token) {
    currentUser = null;
    updateAuthUI();
    return;
  }
  try {
    const res = await fetch("/api/auth/me", { headers: authHeadersOnly() });
    if (!res.ok) {
      localStorage.removeItem(STORAGE_KEYS.token);
      currentUser = null;
      updateAuthUI();
      return;
    }
    const data = await res.json();
    currentUser = data.user;
    updateAuthUI();
    await loadConversationsFromServer();
  } catch {
    currentUser = null;
    updateAuthUI();
  }
}

async function loadConversationsFromServer() {
  if (!currentUser) return;
  try {
    const res = await fetch("/api/conversations", { headers: authHeadersOnly() });
    if (!res.ok) return;
    const data = await res.json();
    conversations = data.conversations.map((c) => ({ ...c, messages: c.messages || [] }));
    renderConversationList();
  } catch {
    showError("Could not load your conversations.");
  }
}

function openAuthModal(mode = "signin") {
  setAuthTab(mode);
  document.getElementById("authError").classList.add("hidden");
  document.getElementById("authForm").reset();
  authModal.classList.remove("hidden");
}

function closeAuthModal() {
  authModal.classList.add("hidden");
}

function setAuthTab(mode) {
  authMode = mode;
  document.querySelectorAll(".auth-tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.authTab === mode);
  });
  document.getElementById("nameGroup").classList.toggle("hidden", mode !== "signup");
  document.getElementById("authTitle").textContent = mode === "signup" ? "Create your account" : "Sign in to STalk";
  document.getElementById("authSubmit").textContent = mode === "signup" ? "Sign up" : "Sign in";
  document.getElementById("authPassword").autocomplete = mode === "signup" ? "new-password" : "current-password";
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  const email = document.getElementById("authEmail").value.trim();
  const password = document.getElementById("authPassword").value;
  const name = document.getElementById("authName").value.trim();
  const errorEl = document.getElementById("authError");

  errorEl.classList.add("hidden");

  const endpoint = authMode === "signup" ? "/api/auth/signup" : "/api/auth/login";
  const body = authMode === "signup" ? { email, password, name } : { email, password };

  if (authMode === "signup" && !name) {
    errorEl.textContent = "Please enter your name.";
    errorEl.classList.remove("hidden");
    return;
  }

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      errorEl.textContent = data.detail || "Authentication failed.";
      errorEl.classList.remove("hidden");
      return;
    }

    localStorage.setItem(STORAGE_KEYS.token, data.token);
    currentUser = data.user;
    updateAuthUI();
    closeAuthModal();
    await loadConversationsFromServer();
    newChat();
  } catch {
    errorEl.textContent = "Could not reach STalk server.";
    errorEl.classList.remove("hidden");
  }
}

function signOut() {
  localStorage.removeItem(STORAGE_KEYS.token);
  currentUser = null;
  conversations = [];
  currentConversationId = null;
  updateAuthUI();
  newChat();
}

// --- Storage ---

function getApiKeyForProvider(provider) {
  if (provider === "groq") return settings.groqApiKey || null;
  if (provider === "gemini") return settings.geminiApiKey || null;
  return null;
}

function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(STORAGE_KEYS.settings) || "{}") };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettingsToStorage() {
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
}

function getCurrentConversation() {
  if (!currentConversationId) return null;
  return conversations.find((c) => c.id === currentConversationId) || null;
}

async function ensureConversation() {
  let conv = getCurrentConversation();
  if (conv) return conv;

  if (currentUser) {
    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ title: "New chat" }),
    });
    if (!res.ok) {
      showError("Could not create conversation.");
      return null;
    }
    conv = { ...(await res.json()), messages: [] };
  } else {
    conv = { id: crypto.randomUUID(), title: "New chat", messages: [] };
  }

  conversations.unshift(conv);
  currentConversationId = conv.id;
  renderConversationList();
  return conv;
}

// --- UI helpers ---

function showError(msg) {
  const existing = document.querySelector(".error-toast");
  if (existing) existing.remove();
  const toast = document.createElement("div");
  toast.className = "error-toast";
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}

function autoResize(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = Math.min(textarea.scrollHeight, 200) + "px";
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderConversationList() {
  conversationListEl.innerHTML = "";

  if (!currentUser && conversations.length === 0) return;

  conversations.forEach((conv) => {
    const btn = document.createElement("button");
    btn.className = "conversation-item" + (conv.id === currentConversationId ? " active" : "");
    btn.textContent = conv.title;
    btn.onclick = () => loadConversation(conv.id);
    conversationListEl.appendChild(btn);
  });
}

async function loadConversation(id) {
  if (currentUser) {
    try {
      const res = await fetch(`/api/conversations/${id}`, { headers: authHeadersOnly() });
      if (!res.ok) {
        showError("Could not load conversation.");
        return;
      }
      const conv = await res.json();
      const idx = conversations.findIndex((c) => c.id === id);
      if (idx >= 0) conversations[idx] = conv;
      else conversations.unshift(conv);
    } catch {
      showError("Could not load conversation.");
      return;
    }
  }

  currentConversationId = id;
  uploadedFiles = [];
  renderUploadedFiles();
  renderMessages();
  renderConversationList();
  sidebar.classList.remove("open");
}

function renderMessages() {
  const conv = getCurrentConversation();
  messagesEl.innerHTML = "";

  if (!conv || !conv.messages || conv.messages.length === 0) {
    messagesEl.appendChild(welcomeEl.cloneNode(true));
    bindSuggestions();
    return;
  }

  conv.messages.forEach((msg) => appendMessage(msg.role, msg.content, false));
  scrollToBottom();
}

function bindSuggestions() {
  messagesEl.querySelectorAll(".suggestion").forEach((btn) => {
    btn.onclick = () => {
      chatInput.value = btn.dataset.prompt;
      autoResize(chatInput);
      sendBtn.disabled = false;
      sendMessage();
    };
  });
}

function appendMessage(role, content, save = true) {
  const conv = getCurrentConversation();
  if (!conv) return;

  if (save) {
    if (!conv.messages) conv.messages = [];
    conv.messages.push({ role, content });
    if (role === "user" && conv.title === "New chat") {
      conv.title = content.slice(0, 40) + (content.length > 40 ? "..." : "");
    }
    renderConversationList();
  }

  const div = document.createElement("div");
  div.className = `message ${role}`;

  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.textContent = role === "user" ? "You" : "ST";

  const body = document.createElement("div");
  body.className = "message-content";
  body.textContent = content;

  div.appendChild(avatar);
  div.appendChild(body);

  if (role === "assistant") {
    const actions = document.createElement("div");
    actions.className = "message-actions";

    const speakBtn = document.createElement("button");
    speakBtn.textContent = "🔊 Read aloud";
    speakBtn.onclick = () => speak(content);
    actions.appendChild(speakBtn);

    const copyBtn = document.createElement("button");
    copyBtn.textContent = "📋 Copy";
    copyBtn.onclick = () => navigator.clipboard.writeText(content);
    actions.appendChild(copyBtn);

    body.appendChild(actions);
  }

  messagesEl.appendChild(div);
  scrollToBottom();

  if (role === "assistant" && settings.autoSpeak) {
    speak(content);
  }
}

function showTyping() {
  const div = document.createElement("div");
  div.className = "message assistant";
  div.id = "typing-indicator";
  div.innerHTML = `
    <div class="message-avatar">ST</div>
    <div class="message-content">
      <div class="typing"><span></span><span></span><span></span></div>
    </div>`;
  messagesEl.appendChild(div);
  scrollToBottom();
}

function hideTyping() {
  document.getElementById("typing-indicator")?.remove();
}

// --- Chat ---

async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text || isGenerating) return;

  const conv = await ensureConversation();
  if (!conv) return;

  isGenerating = true;
  sendBtn.disabled = true;
  chatInput.value = "";
  autoResize(chatInput);

  appendMessage("user", text);
  showTyping();

  const fileContext = uploadedFiles.map((f) => `--- ${f.filename} ---\n${f.context}`).join("\n\n");

  try {
    const provider = serverConfig.hosted ? serverConfig.provider : settings.provider;
    const model = serverConfig.hosted ? serverConfig.model : settings.model;
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        messages: conv.messages.map((m) => ({ role: m.role, content: m.content })),
        conversation_id: currentUser ? conv.id : null,
        personality: settings.personality,
        custom_prompt: settings.customPrompt,
        file_context: fileContext,
        provider,
        model,
        api_key: serverConfig.hosted ? null : getApiKeyForProvider(settings.provider),
      }),
    });

    const data = await res.json();
    hideTyping();

    if (!res.ok) {
      showError(data.detail || "Something went wrong");
      if (conv.messages.length) conv.messages.pop();
      return;
    }

    appendMessage("assistant", data.reply);

    if (currentUser) {
      await loadConversationsFromServer();
    }
  } catch {
    hideTyping();
    showError("Could not reach STalk server. Is it running?");
    if (conv.messages.length) conv.messages.pop();
  } finally {
    isGenerating = false;
    sendBtn.disabled = !chatInput.value.trim();
  }
}

// --- File upload ---

async function handleFileUpload(file) {
  const formData = new FormData();
  formData.append("file", file);

  try {
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) {
      showError(data.detail || "Upload failed");
      return;
    }
    uploadedFiles.push(data);
    renderUploadedFiles();
  } catch {
    showError("Upload failed");
  }
}

function renderUploadedFiles() {
  uploadedFilesEl.innerHTML = "";
  uploadedFiles.forEach((f, i) => {
    const chip = document.createElement("div");
    chip.className = "file-chip";
    chip.innerHTML = `📄 ${f.filename} <button aria-label="Remove">×</button>`;
    chip.querySelector("button").onclick = () => {
      uploadedFiles.splice(i, 1);
      renderUploadedFiles();
    };
    uploadedFilesEl.appendChild(chip);
  });
}

// --- Image generation ---

async function generateImage() {
  const prompt = imageInput.value.trim();
  if (!prompt || isGenerating) return;

  isGenerating = true;
  imageSendBtn.disabled = true;
  imageInput.value = "";

  const loading = document.createElement("div");
  loading.className = "image-loading";
  loading.textContent = "Generating image...";
  imageGallery.querySelector(".image-welcome")?.remove();
  imageGallery.appendChild(loading);

  try {
    const res = await fetch("/api/image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    const data = await res.json();
    loading.remove();

    if (!res.ok) {
      showError(data.detail || "Image generation failed");
      return;
    }

    const wrapper = document.createElement("div");
    wrapper.style.textAlign = "center";

    const label = document.createElement("p");
    label.className = "image-prompt-label";
    label.textContent = prompt;

    const img = document.createElement("img");
    img.className = "generated-image";
    img.src = data.image;
    img.alt = prompt;

    wrapper.appendChild(label);
    wrapper.appendChild(img);
    imageGallery.appendChild(wrapper);
  } catch {
    loading.remove();
    showError("Image generation failed");
  } finally {
    isGenerating = false;
    imageSendBtn.disabled = false;
  }
}

// --- Voice ---

let recognition = null;
let isListening = false;

function initSpeech() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    voiceBtn.title = "Voice not supported in this browser";
    voiceBtn.disabled = true;
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = "en-US";

  recognition.onresult = (event) => {
    let transcript = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    chatInput.value = transcript;
    autoResize(chatInput);
    sendBtn.disabled = !transcript.trim();
  };

  recognition.onend = () => {
    isListening = false;
    voiceBtn.classList.remove("listening");
  };

  recognition.onerror = () => {
    isListening = false;
    voiceBtn.classList.remove("listening");
    showError("Voice input failed. Check microphone permissions.");
  };
}

function toggleVoice() {
  if (!recognition) return;
  if (isListening) {
    recognition.stop();
    return;
  }
  isListening = true;
  voiceBtn.classList.add("listening");
  recognition.start();
}

function speak(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

// --- Settings ---

function applyHostedUI() {
  const isHosted = serverConfig.hosted;
  document.getElementById("hostedNotice").classList.toggle("hidden", !isHosted);
  document.getElementById("aiConfigGroup").classList.toggle("hidden", isHosted);

  const welcome = document.querySelector("#welcome p");
  if (welcome && isHosted) {
    welcome.textContent = currentUser
      ? "Welcome back! Your chats are saved to your account."
      : "Sign in to save chats. Guests start fresh each visit.";
  }
}

async function loadServerConfig() {
  try {
    const res = await fetch("/api/config");
    if (res.ok) {
      serverConfig = await res.json();
      applyHostedUI();
    }
  } catch {
    // Local mode
  }
}

function openSettings() {
  document.getElementById("personality").value = settings.personality;
  document.getElementById("customPrompt").value = settings.customPrompt;
  document.getElementById("provider").value = settings.provider;
  document.getElementById("groqApiKey").value = settings.groqApiKey;
  document.getElementById("geminiApiKey").value = settings.geminiApiKey || "";
  document.getElementById("model").value = settings.model;
  document.getElementById("autoSpeak").checked = settings.autoSpeak;
  document.getElementById("connectionStatus").textContent = "";
  document.getElementById("connectionStatus").className = "setting-hint";
  updateSettingsUI();
  settingsModal.classList.remove("hidden");
}

function updateSettingsUI() {
  const personality = document.getElementById("personality").value;
  const provider = document.getElementById("provider").value;

  document.getElementById("customPromptGroup").classList.toggle("hidden", personality !== "custom");
  document.getElementById("groqKeyGroup").classList.toggle("hidden", provider !== "groq");
  document.getElementById("geminiKeyGroup").classList.toggle("hidden", provider !== "gemini");

  const modelHint = document.getElementById("modelHint");
  const modelInput = document.getElementById("model");

  if (provider === "groq") {
    modelInput.value = "llama-3.3-70b-versatile";
    modelHint.textContent = "Groq free tier model";
  } else if (provider === "gemini") {
    modelInput.value = settings.model || "gemini-2.5-flash";
    modelHint.textContent = "Try gemini-2.5-flash";
  } else {
    modelInput.value = settings.model || "llama3.2";
    modelHint.innerHTML = 'For Ollama: run <code>ollama pull llama3.2</code>';
  }
}

async function testConnection() {
  const provider = document.getElementById("provider").value;
  const model = document.getElementById("model").value;
  const apiKey =
    provider === "groq"
      ? document.getElementById("groqApiKey").value
      : provider === "gemini"
        ? document.getElementById("geminiApiKey").value
        : null;

  const statusEl = document.getElementById("connectionStatus");
  statusEl.textContent = "Testing connection...";
  statusEl.className = "setting-hint";

  try {
    const res = await fetch("/api/test-connection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, model, api_key: apiKey || null }),
    });
    const data = await res.json();
    if (!res.ok) {
      statusEl.textContent = data.detail || "Connection failed";
      statusEl.className = "setting-hint error";
      return;
    }
    statusEl.textContent = `Connected! STalk replied: "${data.reply}"`;
    statusEl.className = "setting-hint ok";
  } catch {
    statusEl.textContent = "Could not reach STalk server.";
    statusEl.className = "setting-hint error";
  }
}

function saveSettings() {
  settings = {
    personality: document.getElementById("personality").value,
    customPrompt: document.getElementById("customPrompt").value,
    provider: document.getElementById("provider").value,
    groqApiKey: document.getElementById("groqApiKey").value.trim(),
    geminiApiKey: document.getElementById("geminiApiKey").value.trim(),
    model: document.getElementById("model").value.trim(),
    autoSpeak: document.getElementById("autoSpeak").checked,
  };
  saveSettingsToStorage();
  settingsModal.classList.add("hidden");
}

function newChat() {
  currentConversationId = null;
  uploadedFiles = [];
  renderUploadedFiles();
  messagesEl.innerHTML = "";
  messagesEl.appendChild(welcomeEl.cloneNode(true));
  bindSuggestions();
  renderConversationList();
  sidebar.classList.remove("open");
  applyHostedUI();
}

function switchMode(mode) {
  document.querySelectorAll(".mode-tab").forEach((t) => t.classList.toggle("active", t.dataset.mode === mode));
  document.getElementById("chatView").classList.toggle("active", mode === "chat");
  document.getElementById("imageView").classList.toggle("active", mode === "image");
  document.getElementById("modeLabel").textContent = mode === "chat" ? "Chat" : "Images";
}

// --- Event listeners ---

chatInput.addEventListener("input", () => {
  autoResize(chatInput);
  sendBtn.disabled = !chatInput.value.trim() || isGenerating;
});

chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

sendBtn.addEventListener("click", sendMessage);

fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) handleFileUpload(file);
  fileInput.value = "";
});

voiceBtn.addEventListener("click", toggleVoice);

imageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    generateImage();
  }
});

imageSendBtn.addEventListener("click", generateImage);

document.getElementById("newChatBtn").addEventListener("click", newChat);
document.getElementById("settingsBtn").addEventListener("click", openSettings);
document.getElementById("closeSettings").addEventListener("click", () => settingsModal.classList.add("hidden"));
document.getElementById("settingsBackdrop").addEventListener("click", () => settingsModal.classList.add("hidden"));
document.getElementById("saveSettings").addEventListener("click", saveSettings);
document.getElementById("testConnection").addEventListener("click", testConnection);
document.getElementById("personality").addEventListener("change", updateSettingsUI);
document.getElementById("provider").addEventListener("change", updateSettingsUI);

document.getElementById("signInBtn").addEventListener("click", () => openAuthModal("signin"));
document.getElementById("signUpBtn").addEventListener("click", () => openAuthModal("signup"));
document.getElementById("signOutBtn").addEventListener("click", signOut);
document.getElementById("closeAuth").addEventListener("click", closeAuthModal);
document.getElementById("authBackdrop").addEventListener("click", closeAuthModal);
document.getElementById("authForm").addEventListener("submit", handleAuthSubmit);
document.querySelectorAll(".auth-tab").forEach((tab) => {
  tab.addEventListener("click", () => setAuthTab(tab.dataset.authTab));
});

document.querySelectorAll(".mode-tab").forEach((tab) => {
  tab.addEventListener("click", () => switchMode(tab.dataset.mode));
});

document.getElementById("menuBtn").addEventListener("click", () => sidebar.classList.add("open"));
document.getElementById("sidebarClose").addEventListener("click", () => sidebar.classList.remove("open"));

// --- Init ---

loadServerConfig().then(async () => {
  initSpeech();
  await loadSession();
  newChat();
});
