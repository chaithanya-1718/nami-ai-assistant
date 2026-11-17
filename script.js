let apiKey = localStorage.getItem("nami_api_key");
if (!apiKey) {
  apiKey = prompt("Enter your Gemini API Key:");
  if (apiKey) localStorage.setItem("nami_api_key", apiKey.trim());
}

let memory = JSON.parse(localStorage.getItem("nami_memory")) || [];
let wakeMode = false;
let selectedVoice = null;

// Load and select the best natural female voice available on Android/Chrome
function loadFemaleVoice() {
  const voices = speechSynthesis.getVoices();
  selectedVoice =
    voices.find(v => /Google UK English Female|Google US English|Microsoft Aria|Samantha|Victoria|Zira/i.test(v.name)) ||
    voices.find(v => /female|woman/i.test(v.name)) ||
    voices.find(v => v.lang.startsWith("en"));
}
speechSynthesis.onvoiceschanged = loadFemaleVoice;
loadFemaleVoice();

// Nami's Personality System Prompt
const NAMI_PERSONA = `You are Nami, a charming, witty, affectionate, and highly intelligent personal AI assistant. 
Address the user warmly (e.g., "darling", "boss", or "love" naturally without overdoing it). 
Keep spoken responses concise, playful, confident, and helpful (2-3 sentences max unless asked for details). Never use markdown symbols like asterisks in your replies.`;

function speak(text) {
  speechSynthesis.cancel();
  const cleanText = text.replace(/[*#_`]/g, "");
  const utterance = new SpeechSynthesisUtterance(cleanText);
  if (selectedVoice) utterance.voice = selectedVoice;
  utterance.pitch = 1.18; // Slightly higher pitch for a sweeter, feminine tone
  utterance.rate = 0.96;  // Smooth, alluring pacing
  utterance.onstart = () => document.getElementById("orb").classList.add("speaking");
  utterance.onend = () => {
    document.getElementById("orb").classList.remove("speaking");
    if (wakeMode) listenForWakeWord();
  };
  speechSynthesis.speak(utterance);
}

function addMessage(sender, text) {
  const box = document.getElementById("chatBox");
  const div = document.createElement("div");
  div.className = `msg ${sender}`;
  div.textContent = text;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

// Built-in Quick Tools (Episode 6)
function checkTools(query) {
  const q = query.toLowerCase();
  if (q.includes("time")) {
    return `It's ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} right now.`;
  }
  if (q.startsWith("play ")) {
    const song = q.replace("play ", "");
    window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(song)}`, "_blank");
    return `Opening ${song} on YouTube for you.`;
  }
  if (q.includes("open youtube")) {
    window.open("https://m.youtube.com", "_blank");
    return "Opening YouTube right away.";
  }
  return null;
}

async function sendMessage(customText = null, imageBase64 = null) {
  const input = document.getElementById("userInput");
  const text = customText || input.value.trim();
  if (!text && !imageBase64) return;

  addMessage("user", text || "📷 [Sent an image]");
  input.value = "";
  document.getElementById("status").textContent = "Nami is thinking...";

  // Check instant tools first
  if (!imageBase64) {
    const toolReply = checkTools(text);
    if (toolReply) {
      addMessage("nami", toolReply);
      speak(toolReply);
      document.getElementById("status").textContent = "Ready";
      return;
    }
  }

  const userParts = [{ text: text || "Describe what you see in this image." }];
  if (imageBase64) {
    userParts.push({ inline_data: { mime_type: "image/jpeg", data: imageBase64 } });
  }

  memory.push({ role: "user", parts: userParts });
  if (memory.length > 12) memory = memory.slice(-12);

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: NAMI_PERSONA }] },
        contents: memory
      })
    });
    const data = await res.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "Sorry love, my connection glitched for a second.";
    
    memory.push({ role: "model", parts: [{ text: reply }] });
    localStorage.setItem("nami_memory", JSON.stringify(memory));

    addMessage("nami", reply);
    speak(reply);
    document.getElementById("status").textContent = "Ready";
  } catch (err) {
    document.getElementById("status").textContent = "Error connecting to Gemini.";
  }
}

// Vision / Camera Input (Episode 5)
function handleImage(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const base64 = reader.result.split(",")[1];
    sendMessage("What do you see here, Nami?", base64);
  };
  reader.readAsDataURL(file);
}

// Push-to-Talk Voice Input (Episode 4)
function startListening() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return alert("Speech recognition not supported in this browser.");
  const rec = new SpeechRecognition();
  rec.lang = "en-US";
  document.getElementById("status").textContent = "Listening...";
  rec.onresult = (e) => sendMessage(e.results[0][0].transcript);
  rec.start();
}

// Wake Word Mode: "Hey Nami" (Episode 9)
function toggleWakeMode() {
  wakeMode = !wakeMode;
  document.getElementById("wakeBtn").textContent = `Wake Mode: ${wakeMode ? "ON" : "OFF"}`;
  if (wakeMode) listenForWakeWord();
}

function listenForWakeWord() {
  if (!wakeMode) return;
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const rec = new SpeechRecognition();
  rec.lang = "en-US";
  rec.onresult = (e) => {
    const transcript = e.results[0][0].transcript.toLowerCase();
    if (transcript.includes("nami")) {
      const command = transcript.replace(/hey nami|nami/g, "").trim();
      if (command) sendMessage(command);
      else speak("Yes darling? I'm listening.");
    } else if (wakeMode) {
      listenForWakeWord();
    }
  };
  rec.onend = () => { if (wakeMode) setTimeout(listenForWakeWord, 400); };
  rec.start();
}

function clearMemory() {
  memory = [];
  localStorage.removeItem("nami_memory");
  document.getElementById("chatBox").innerHTML = "";
  speak("Memory wiped clean, sweetheart.");
}
