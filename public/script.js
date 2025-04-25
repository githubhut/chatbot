if (!localStorage.getItem('authToken')) {
    window.location.href = 'login.html';
}
// Global variables
let selectedLanguage = "en-US";
let currentConversationId = localStorage.getItem("currentConversationId") || generateConversationId();
let isSpeaking = false;
let recognition;
let authToken = localStorage.getItem("authToken") || null;
let currentUserId = localStorage.getItem("currentUserId") || null;
let speechRate = 1;

// DOM Elements
const chatBox = document.getElementById("chat-box");
const messageInput = document.getElementById("message");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const languageBtn = document.getElementById("languageBtn");
const toggleDarkMode = document.getElementById("toggleDarkMode");
const newChatBtn = document.getElementById("new-chat-btn");
const conversationList = document.getElementById("conversation-list");
const conversationTitle = document.getElementById("conversation-title");

// Initialize speech recognition if available
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = selectedLanguage;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        messageInput.value = transcript;
    };

    recognition.onerror = (event) => {
        console.error("Speech recognition error", event.error);
        showSystemMessage("Speech recognition error: " + event.error);
    };
} else {
    startBtn.style.display = "none";
}

// Generate unique conversation ID
function generateConversationId() {
    const newId = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem("currentConversationId", newId);
    return newId;
}

// Format date for display
function formatDate(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Load all conversations for the sidebar
async function loadAllConversations() {
    try {
        const response = await fetchWithAuth("https://chatbot-jl8o.onrender.com/conversations");
        if (!response.ok) throw new Error("Failed to load conversations");
        
        const conversations = await response.json();
        renderConversationList(conversations);
    } catch (error) {
        console.error("Error loading conversations:", error);
        showSystemMessage("Failed to load conversation list");
    }
}

// Render conversation list in sidebar
function renderConversationList(conversations) {
    conversationList.innerHTML = '';
    
    conversations.forEach(conv => {
        const convElement = document.createElement("div");
        // Compare with conversationId instead of _id
        const isActive = conv.conversationId === currentConversationId;
        convElement.className = `conversation-item ${isActive ? 'active' : ''}`;
        
        // Get the first user message (skip system message) or use default text
        const userMessage = conv.messages.find(msg => msg.role === "user");
        convElement.textContent = userMessage ? 
            userMessage.content.substring(0, 50) + (userMessage.content.length > 50 ? '...' : '') : 
            'New Conversation';
        
        convElement.title = formatDate(conv.createdAt);
        
        convElement.addEventListener('click', () => {
            currentConversationId = conv.conversationId;
            localStorage.setItem("currentConversationId", currentConversationId);
            loadConversationHistory();
            
            // Update active state
            document.querySelectorAll('.conversation-item').forEach(item => {
                item.classList.remove('active');
            });
            convElement.classList.add('active');
        });
        
        conversationList.appendChild(convElement);
    });
}

// Load specific conversation history
async function loadConversationHistory() {
    try {
        showLoadingIndicator();
        const response = await fetchWithAuth(`https://chatbot-jl8o.onrender.com/conversation/${currentConversationId}`);
        
        if (!response.ok) throw new Error("Failed to load history");
        
        const data = await response.json();
        hideLoadingIndicator();
        
        if (data.messages) {
            chatBox.innerHTML = "";
            
            data.messages.forEach(msg => {
                if (msg.role === "system") return;
                
                const timestamp = formatDate(msg.timestamp || msg.createdAt);
                const messageClass = msg.role === "user" ? "user-message" : "bot-message";
                
                chatBox.innerHTML += `
                    <div class="${messageClass}">
                        <span>${formatMessageContent(msg.content)}</span>
                        <span class="timestamp">${timestamp}</span>
                    </div>
                `;
            });
            
            chatBox.scrollTop = chatBox.scrollHeight;
            updateConversationTitle();
            loadAllConversations();
        }
    } catch (error) {
        hideLoadingIndicator();
        console.error("Error loading history:", error);
        showSystemMessage("Failed to load conversation history");
    }
}

// Format message content (bold, line breaks, etc.)
function formatMessageContent(content) {
    if (!content) return '';
    return content
        .replace(/\\n/g, "<br>")
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.*?)\*/g, "<em>$1</em>");
}

// Show system message in chat
function showSystemMessage(message) {
    chatBox.innerHTML += `
        <div class="system-message">
            <span>${message}</span>
        </div>
    `;
    chatBox.scrollTop = chatBox.scrollHeight;
}

// Start a new conversation
function startNewConversation() {
    currentConversationId = generateConversationId();
    chatBox.innerHTML = "";
    updateConversationTitle();
    showSystemMessage("Started a new conversation");
    loadAllConversations();
}

// Update conversation title
function updateConversationTitle() {
    const date = new Date(parseInt(currentConversationId.split('_')[1]));
    conversationTitle.textContent = `Conversation - ${date.toLocaleDateString()}`;
}

// Show loading indicator
function showLoadingIndicator() {
    chatBox.innerHTML += `
        <div class="loading-indicator">
            <div class="dot-flashing"></div>
        </div>
    `;
    chatBox.scrollTop = chatBox.scrollHeight;
}

// Hide loading indicator
function hideLoadingIndicator() {
    const indicator = document.querySelector(".loading-indicator");
    if (indicator) indicator.remove();
}

// Send message to server
async function sendMessage(event) {
    event.preventDefault();
    
    const message = messageInput.value.trim();
    if (!message) return;
    
    // Display user message
    const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    chatBox.innerHTML += `
        <div class="user-message">
            <span>${formatMessageContent(message)}</span>
            <span class="timestamp">${timestamp}</span>
        </div>
    `;
    
    messageInput.value = "";
    chatBox.scrollTop = chatBox.scrollHeight;
    
    // Show typing indicator
    const typingIndicator = document.createElement("div");
    typingIndicator.classList.add("bot-message");
    typingIndicator.id = "typingIndicator";
    typingIndicator.innerHTML = "<em>Chatbot is typing...</em>";
    chatBox.appendChild(typingIndicator);
    chatBox.scrollTop = chatBox.scrollHeight;
    
    try {
        const response = await fetchWithAuth("https://chatbot-jl8o.onrender.com/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                message, 
                conversation_id: currentConversationId,
                lang: selectedLanguage 
            })
        });
        
        const data = await response.json();
        document.getElementById("typingIndicator")?.remove();
        
        if (response.ok) {
            const botTimestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            chatBox.innerHTML += `
                <div class="bot-message">
                    <span>${formatMessageContent(data.response)}</span>
                    <span class="timestamp">${botTimestamp}</span>
                </div>
            `;
            speakMessage(data.response);
            loadAllConversations();
        } else {
            chatBox.innerHTML += `<div class="bot-message">Error: ${data.error || "Unknown error"}</div>`;
        }
    } catch (error) {
        document.getElementById("typingIndicator")?.remove();
        chatBox.innerHTML += `<div class="bot-message">Connection Error: ${error.message}</div>`;
    }
    
    chatBox.scrollTop = chatBox.scrollHeight;
}

// Text-to-Speech function
function speakMessage(text) {
    if (window.speechSynthesis.speaking || isSpeaking) {
        window.speechSynthesis.cancel();
    }

    const speech = new SpeechSynthesisUtterance(text);
    speech.lang = selectedLanguage;
    speech.rate = speechRate;

    speech.onstart = () => isSpeaking = true;
    speech.onend = () => isSpeaking = false;

    window.speechSynthesis.speak(speech);
}

// Set language and update UI
function setLanguage(lang, name = "English") {
    selectedLanguage = lang;
    languageBtn.innerHTML = `<i class="fas fa-globe"></i> ${name}`;

    if (recognition) {
        recognition.lang = selectedLanguage;
    }
    
    // Show language change confirmation
    showSystemMessage(`Language set to ${name}`);
}

// Initialize event listeners
function initEventListeners() {
    // Form submission
    document.querySelector(".input-box").addEventListener("submit", sendMessage);

    // Speech recognition
    if (SpeechRecognition) {
        startBtn.addEventListener("click", () => {
            recognition.lang = selectedLanguage;
            recognition.start();
        });
    }

    // Stop speech/recognition
    stopBtn.addEventListener("click", () => {
        if (window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
        }
        if (recognition) {
            recognition.stop();
        }
        isSpeaking = false;
    });

    // Dark mode toggle
    toggleDarkMode.addEventListener("click", () => {
        document.body.classList.toggle("dark-mode");
        localStorage.setItem("darkMode", document.body.classList.contains("dark-mode"));
    });

    // Language dropdown
    languageBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        document.getElementById("languageDropdown").style.display = 
            document.getElementById("languageDropdown").style.display === "block" ? "none" : "block";
    });

    // New conversation
    newChatBtn.addEventListener("click", startNewConversation);

    // Click outside to close dropdowns
    document.addEventListener("click", () => {
        document.getElementById("languageDropdown").style.display = "none";
    });

    // Speech rate controls
    document.getElementById('speechRate').addEventListener('input', (e) => {
        speechRate = parseFloat(e.target.value);
        document.getElementById('rateValue').textContent = `${speechRate.toFixed(1)}x`;
    });
    
    document.getElementById('rateDownBtn').addEventListener('click', () => {
        speechRate = Math.max(0.5, speechRate - 0.1);
        updateRateControls();
    });
    
    document.getElementById('rateUpBtn').addEventListener('click', () => {
        speechRate = Math.min(2, speechRate + 0.1);
        updateRateControls();
    });
}
document.getElementById('logoutBtn')?.addEventListener('click', () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUserId');
    localStorage.removeItem('currentUsername');
    window.location.href = 'login.html';
});



// Update all fetch calls to include the auth token
async function fetchWithAuth(url, options = {}) {
    if (!authToken) {
        window.location.href = 'login.html';
        throw new Error('Not authenticated');
    }

    options.headers = {
        ...options.headers,
        'Authorization': `Bearer ${authToken}`
    };

    return fetch(url, options);
}

// Initialize the app
function init() {
    // Load initial conversation and list
    loadConversationHistory();
    loadAllConversations();
    initEventListeners();

    // Set dark mode if previously enabled
    if (localStorage.getItem("darkMode") === "true") {
        document.body.classList.add("dark-mode");
    }
    
    
    // Set default language
    setLanguage(selectedLanguage);
}

// Start the app when DOM is loaded
document.addEventListener("DOMContentLoaded", init);
