// Trumf Bonusvarsler Lite - Options Page

const browser = globalThis.browser || globalThis.chrome;

// Storage keys
const KEYS = {
  hiddenSites: "TrumfBonusvarslerLite_HiddenSites",
  theme: "TrumfBonusvarslerLite_Theme",
  startMinimized: "TrumfBonusvarslerLite_StartMinimized",
  position: "TrumfBonusvarslerLite_Position",
  sitePositions: "TrumfBonusvarslerLite_SitePositions",
  feedData: "TrumfBonusvarslerLite_FeedData_v3",
  feedTime: "TrumfBonusvarslerLite_FeedTime_v3",
  hostIndex: "TrumfBonusvarslerLite_HostIndex_v3",
};

// Get value from storage
async function getValue(key, defaultValue) {
  try {
    const result = await browser.storage.local.get(key);
    return result[key] !== undefined ? result[key] : defaultValue;
  } catch {
    return defaultValue;
  }
}

// Set value in storage
async function setValue(key, value) {
  try {
    await browser.storage.local.set({ [key]: value });
  } catch {
    console.error("Failed to save setting:", key);
  }
}

// Show status message
function showStatus(message) {
  let statusEl = document.querySelector(".status-message");
  if (!statusEl) {
    statusEl = document.createElement("div");
    statusEl.className = "status-message";
    document.body.appendChild(statusEl);
  }
  statusEl.textContent = message;
  statusEl.classList.add("visible");
  setTimeout(() => {
    statusEl.classList.remove("visible");
  }, 2000);
}

// Initialize theme buttons
async function initTheme() {
  const currentTheme = await getValue(KEYS.theme, "system");
  const buttons = document.querySelectorAll("#theme-buttons .theme-btn");

  buttons.forEach((btn) => {
    if (btn.dataset.theme === currentTheme) {
      btn.classList.add("active");
    }

    btn.addEventListener("click", async () => {
      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      await setValue(KEYS.theme, btn.dataset.theme);
      showStatus("Tema lagret");
    });
  });
}

// Initialize start minimized toggle
async function initStartMinimized() {
  const startMinimized = await getValue(KEYS.startMinimized, false);
  const toggle = document.getElementById("start-minimized");

  if (startMinimized) {
    toggle.classList.add("active");
  }

  toggle.addEventListener("click", async () => {
    const isActive = toggle.classList.toggle("active");
    await setValue(KEYS.startMinimized, isActive);
    showStatus(isActive ? "Start minimert aktivert" : "Start minimert deaktivert");
  });
}

// Initialize position buttons
async function initPosition() {
  const currentPosition = await getValue(KEYS.position, "bottom-right");
  const buttons = document.querySelectorAll("#position-buttons .position-btn");

  buttons.forEach((btn) => {
    if (btn.dataset.position === currentPosition) {
      btn.classList.add("active");
    }

    btn.addEventListener("click", async () => {
      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      await setValue(KEYS.position, btn.dataset.position);
      showStatus("Posisjon lagret");
    });
  });
}

// Initialize hidden sites
async function initHiddenSites() {
  const hiddenSites = await getValue(KEYS.hiddenSites, []);
  const container = document.getElementById("hidden-sites-container");
  const list = document.getElementById("hidden-sites-list");
  const actions = document.getElementById("hidden-sites-actions");

  function render() {
    list.innerHTML = "";

    if (hiddenSites.length === 0) {
      container.style.display = "block";
      actions.style.display = "none";
      return;
    }

    container.style.display = "none";
    actions.style.display = "block";

    hiddenSites.forEach((site, index) => {
      const item = document.createElement("div");
      item.className = "hidden-site-item";

      const name = document.createElement("span");
      name.className = "hidden-site-name";
      name.textContent = site;

      const removeBtn = document.createElement("button");
      removeBtn.className = "remove-site-btn";
      removeBtn.textContent = "×";
      removeBtn.title = "Fjern";
      removeBtn.addEventListener("click", async () => {
        hiddenSites.splice(index, 1);
        await setValue(KEYS.hiddenSites, hiddenSites);
        render();
        showStatus(`${site} fjernet`);
      });

      item.appendChild(name);
      item.appendChild(removeBtn);
      list.appendChild(item);
    });
  }

  render();

  // Reset all hidden sites
  document.getElementById("reset-hidden-sites").addEventListener("click", async () => {
    if (confirm("Er du sikker på at du vil nullstille alle skjulte sider?")) {
      hiddenSites.length = 0;
      await setValue(KEYS.hiddenSites, []);
      render();
      showStatus("Alle skjulte sider fjernet");
    }
  });
}

// Initialize clear cache
function initClearCache() {
  document.getElementById("clear-cache").addEventListener("click", async () => {
    await setValue(KEYS.feedData, null);
    await setValue(KEYS.feedTime, null);
    await setValue(KEYS.hostIndex, null);
    showStatus("Cache tømt");
  });
}

// Initialize version display
function initVersion() {
  const manifest = browser.runtime.getManifest();
  document.querySelector(".version").textContent = `v${manifest.version}`;
}

// Initialize everything
document.addEventListener("DOMContentLoaded", () => {
  initVersion();
  initTheme();
  initStartMinimized();
  initPosition();
  initHiddenSites();
  initClearCache();
});
