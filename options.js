// BonusVarsler - Options Page

const browser = globalThis.browser || globalThis.chrome;

// Service registry (must match content.js)
const SERVICES = {
  trumf: {
    id: "trumf",
    name: "Trumf",
    color: "#E31837",
    defaultEnabled: true,
  },
  remember: {
    id: "remember",
    name: "re:member",
    color: "#00A0D2",
    defaultEnabled: false,
  },
};

// Storage keys
const KEYS = {
  hiddenSites: "BonusVarsler_HiddenSites",
  theme: "BonusVarsler_Theme",
  startMinimized: "BonusVarsler_StartMinimized",
  position: "BonusVarsler_Position",
  sitePositions: "BonusVarsler_SitePositions",
  feedData: "BonusVarsler_FeedData_v4",
  feedTime: "BonusVarsler_FeedTime_v4",
  hostIndex: "BonusVarsler_HostIndex_v4",
  language: "BonusVarsler_Language",
  enabledServices: "BonusVarsler_EnabledServices",
};

// Messages cache
let messages = {};
let currentLang = "no";

// Load messages for a specific language
async function loadMessages(lang) {
  try {
    const url = browser.runtime.getURL(`_locales/${lang}/messages.json`);
    const response = await fetch(url);
    return await response.json();
  } catch {
    return {};
  }
}

// i18n helper with placeholder support
function i18n(messageName, substitutions) {
  const entry = messages[messageName];
  if (!entry || !entry.message) {
    return messageName;
  }

  let msg = entry.message;

  // Handle substitutions
  if (substitutions !== undefined) {
    const subs = Array.isArray(substitutions) ? substitutions : [substitutions];
    subs.forEach((sub, index) => {
      const placeholder = `$${index + 1}`;
      msg = msg.replace(placeholder, sub);
      // Also handle named placeholders
      if (entry.placeholders) {
        for (const [name, config] of Object.entries(entry.placeholders)) {
          if (config.content === placeholder) {
            msg = msg.replace(new RegExp(`\\$${name.toUpperCase()}\\$`, "g"), sub);
          }
        }
      }
    });
  }

  return msg;
}

// Translate all elements with data-i18n attributes
function translatePage() {
  // Translate text content
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    const message = i18n(key);
    if (message && message !== key) {
      el.textContent = message;
    }
  });

  // Translate titles
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    const key = el.getAttribute("data-i18n-title");
    const message = i18n(key);
    if (message && message !== key) {
      el.title = message;
    }
  });

  // Translate aria-labels
  document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    const key = el.getAttribute("data-i18n-aria");
    const message = i18n(key);
    if (message && message !== key) {
      el.setAttribute("aria-label", message);
    }
  });

  // Update page title
  document.title = i18n("optionsTitle");
}

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

// Initialize language buttons
async function initLanguage() {
  const buttons = document.querySelectorAll("#language-buttons .theme-btn");

  buttons.forEach((btn) => {
    if (btn.dataset.lang === currentLang) {
      btn.classList.add("active");
    }

    btn.addEventListener("click", async () => {
      const newLang = btn.dataset.lang;
      if (newLang === currentLang) return;

      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      await setValue(KEYS.language, newLang);
      currentLang = newLang;
      messages = await loadMessages(newLang);
      translatePage();
      showStatus(i18n("languageSaved"));
    });
  });
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
      showStatus(i18n("themeSaved"));
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
    showStatus(isActive ? i18n("startMinimizedEnabled") : i18n("startMinimizedDisabled"));
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
      showStatus(i18n("positionSaved"));
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
      removeBtn.title = i18n("remove");
      removeBtn.addEventListener("click", async () => {
        hiddenSites.splice(index, 1);
        await setValue(KEYS.hiddenSites, hiddenSites);
        render();
        showStatus(i18n("siteRemoved", site));
      });

      item.appendChild(name);
      item.appendChild(removeBtn);
      list.appendChild(item);
    });
  }

  render();

  // Reset all hidden sites
  document.getElementById("reset-hidden-sites").addEventListener("click", async () => {
    if (confirm(i18n("confirmResetHiddenSites"))) {
      hiddenSites.length = 0;
      await setValue(KEYS.hiddenSites, []);
      render();
      showStatus(i18n("allHiddenSitesRemoved"));
    }
  });
}

// Initialize services checkboxes
async function initServices() {
  const container = document.getElementById("services-list");
  if (!container) return;

  // Get default enabled services
  const defaultEnabled = Object.values(SERVICES)
    .filter((s) => s.defaultEnabled)
    .map((s) => s.id);

  // Load enabled services from storage
  let enabledServices = await getValue(KEYS.enabledServices, null);
  if (!enabledServices) {
    enabledServices = defaultEnabled;
  }

  // Create checkbox for each service
  Object.values(SERVICES).forEach((service) => {
    const row = document.createElement("div");
    row.className = "service-row";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = `service-${service.id}`;
    checkbox.checked = enabledServices.includes(service.id);

    const label = document.createElement("label");
    label.htmlFor = `service-${service.id}`;
    label.className = "service-label";

    const colorDot = document.createElement("span");
    colorDot.className = "service-color";
    colorDot.style.backgroundColor = service.color;

    const nameSpan = document.createElement("span");
    nameSpan.className = "service-name";
    nameSpan.textContent = service.name;

    label.appendChild(colorDot);
    label.appendChild(nameSpan);

    row.appendChild(checkbox);
    row.appendChild(label);
    container.appendChild(row);

    // Handle checkbox change
    checkbox.addEventListener("change", async () => {
      const checkboxes = container.querySelectorAll('input[type="checkbox"]');
      const checkedCount = Array.from(checkboxes).filter((cb) => cb.checked).length;

      // Prevent disabling all services
      if (checkedCount === 0) {
        checkbox.checked = true;
        showStatus(i18n("cannotDisableAllServices"));
        return;
      }

      // Update enabled services
      const newEnabled = Array.from(checkboxes)
        .filter((cb) => cb.checked)
        .map((cb) => cb.id.replace("service-", ""));

      await setValue(KEYS.enabledServices, newEnabled);
      showStatus(i18n("servicesSaved"));
    });
  });
}

// Initialize clear cache
function initClearCache() {
  document.getElementById("clear-cache").addEventListener("click", async () => {
    await setValue(KEYS.feedData, null);
    await setValue(KEYS.feedTime, null);
    await setValue(KEYS.hostIndex, null);
    showStatus(i18n("cacheCleared"));
  });
}

// Initialize version display
function initVersion() {
  const manifest = browser.runtime.getManifest();
  document.querySelector(".version").textContent = `v${manifest.version}`;
}

// Initialize everything
document.addEventListener("DOMContentLoaded", async () => {
  // Load language preference and messages first
  currentLang = await getValue(KEYS.language, "no");
  messages = await loadMessages(currentLang);

  translatePage();
  initVersion();
  initLanguage();
  initTheme();
  initStartMinimized();
  initPosition();
  initServices();
  initHiddenSites();
  initClearCache();
});
