const STORAGE_KEYS = {
  settings: "stalk_settings",
  conversations: "stalk_conversations",
  currentId: "stalk_current_id",
};

const DEFAULT_SETTINGS = {
  rememberConversations: true,
  personality: "friendly",
  customPrompt: "",
  provider: "groq",
  groqApiKey: "",
  geminiApiKey: "",
  model: "llama-3.3-70b-versatile",
  autoSpeak: false,
};

let settings = loadSettings();
let conversations = loadConversations();
let currentConversationId = localStorage.getItem(STORAGE_KEYS.currentId);
let uploadedFiles = [];
let isGenerating = false;
let serverConfig = { hosted: false, ready: true, provider: "groq", model: "llama-3.3-70b-versatile" };

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
const sidebar = document.getElementById("sidebar");

// --- Storage ---

function getApiKeyForProvider(provider) {
  if (provider === "groq") return settings.groqApiKey || null;
  if (provider === "gemini") return settings.geminiApiKey || null;
  return null;
}

function getModelForProvider(provider) {
  if (provider === "groq") return settings.model || "llama-3.3-70b-versatile";
  if (provider === "gemini") return settings.model || "gemini-2.0-flash";
  return settings.model || "llama3.2";
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

function loadConversations() {
  if (!settings.rememberConversations) return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.conversations) || "[]");
  } catch {
    return [];
  }
}

function saveConversations() {
  if (!settings.rememberConversations) return;
  localStorage.setItem(STORAGE_KEYS.conversations, JSON.stringify(conversations));
}

function getCurrentConversation() {
  if (!currentConversationId) return null;
  return conversations.find((c) => c.id === currentConversationId) || null;
}

function createConversation() {
  const conv = {
    id: crypto.randomUUID(),
    title: "New chat",
    messages: [],
    createdAt: Date.now(),
  };
  conversations.unshift(conv);
  currentConversationId = conv.id;
  localStorage.setItem(STORAGE_KEYS.currentId, conv.id);
  saveConversations();
  return conv;
}

function ensureConversation() {
  let conv = getCurrentConversation();
  if (!conv) {
    conv = createConversation();
  }
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
  if (!settings.rememberConversations) return;

  conversations.forEach((conv) => {
    const btn = document.createElement("button");
    btn.className = "conversation-item" + (conv.id === currentConversationId ? " active" : "");
    btn.textContent = conv.title;
    btn.onclick = () => loadConversation(conv.id);
    conversationListEl.appendChild(btn);
  });
}

function loadConversation(id) {
  currentConversationId = id;
  localStorage.setItem(STORAGE_KEYS.currentId, id);
  uploadedFiles = [];
  renderUploadedFiles();
  renderMessages();
  renderConversationList();
  sidebar.classList.remove("open");
}

function renderMessages() {
  const conv = getCurrentConversation();
  messagesEl.innerHTML = "";

  if (!conv || conv.messages.length === 0) {
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
  welcomeEl.remove?.();

  const conv = ensureConversation();
  if (save) {
    conv.messages.push({ role, content });
    if (role === "user" && conv.title === "New chat") {
      conv.title = content.slice(0, 40) + (content.length > 40 ? "..." : "");
    }
    saveConversations();
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

  isGenerating = true;
  sendBtn.disabled = true;
  chatInput.value = "";
  autoResize(chatInput);

  appendMessage("user", text);
  showTyping();

  const conv = getCurrentConversation();
  const fileContext = uploadedFiles.map((f) => `--- ${f.filename} ---\n${f.context}`).join("\n\n");

  try {
    const provider = serverConfig.hosted ? serverConfig.provider : settings.provider;
    const model = serverConfig.hosted ? serverConfig.model : settings.model;
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: conv.messages.map((m) => ({ role: m.role, content: m.content })),
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
      return;
    }

    appendMessage("assistant", data.reply);
  } catch (err) {
    hideTyping();
    showError("Could not reach STalk server. Is it running?");
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
    welcome.textContent = "Your free AI assistant — just type a message and go.";
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
    // Local mode without config endpoint
  }
}

function openSettings() {
  document.getElementById("rememberConversations").checked = settings.rememberConversations;
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
    modelHint.textContent = "Try gemini-2.5-flash. If quota is 0, your account may not have free tier — use Groq instead.";
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
    rememberConversations: document.getElementById("rememberConversations").checked,
    personality: document.getElementById("personality").value,
    customPrompt: document.getElementById("customPrompt").value,
    provider: document.getElementById("provider").value,
    groqApiKey: document.getElementById("groqApiKey").value.trim(),
    geminiApiKey: document.getElementById("geminiApiKey").value.trim(),
    model: document.getElementById("model").value.trim(),
    autoSpeak: document.getElementById("autoSpeak").checked,
  };
  saveSettingsToStorage();

  if (!settings.rememberConversations) {
    conversations = [];
    currentConversationId = null;
    localStorage.removeItem(STORAGE_KEYS.conversations);
    localStorage.removeItem(STORAGE_KEYS.currentId);
  } else {
    conversations = loadConversations();
  }

  renderConversationList();
  settingsModal.classList.add("hidden");
}

function newChat() {
  currentConversationId = null;
  localStorage.removeItem(STORAGE_KEYS.currentId);
  uploadedFiles = [];
  renderUploadedFiles();
  messagesEl.innerHTML = "";
  messagesEl.appendChild(welcomeEl.cloneNode(true));
  bindSuggestions();
  renderConversationList();
  sidebar.classList.remove("open");
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

document.querySelectorAll(".mode-tab").forEach((tab) => {
  tab.addEventListener("click", () => switchMode(tab.dataset.mode));
});

document.getElementById("menuBtn").addEventListener("click", () => sidebar.classList.add("open"));
document.getElementById("sidebarClose").addEventListener("click", () => sidebar.classList.remove("open"));

// --- Init ---

loadServerConfig().then(() => {
  initSpeech();
  renderConversationList();
  renderMessages();

  if (settings.rememberConversations && !currentConversationId && conversations.length > 0) {
    loadConversation(conversations[0].id);
  }
});
