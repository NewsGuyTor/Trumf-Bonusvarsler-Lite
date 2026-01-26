/**
 * Service selector view
 * First-run selector for choosing which services to enable
 */

import type { I18nAdapter } from "../../i18n/types.js";
import type { Settings } from "../../core/settings.js";
import type { ServiceRegistry } from "../../config/services.js";
import { getServiceSelectorStyles } from "../styles/index.js";
import { createShadowHost, injectStyles } from "../components/shadow-host.js";
import { LOGO_ICON_URL } from "../components/icons.js";

export interface ServiceSelectorOptions {
  settings: Settings;
  services: ServiceRegistry;
  i18n: I18nAdapter;
  onSave?: (enabledServices: string[]) => void;
}

/**
 * Create and show the service selector
 */
export function createServiceSelector(options: ServiceSelectorOptions): HTMLElement {
  const { settings, services, i18n, onSave } = options;

  // Create shadow host
  const shadowHost = createShadowHost();
  document.body.appendChild(shadowHost);
  const shadowRoot = shadowHost.attachShadow({ mode: "open" });

  // Inject styles
  injectStyles(shadowRoot, getServiceSelectorStyles());

  // Create container
  const container = document.createElement("div");
  container.className = `container animate-in ${settings.getPosition()}`;
  container.setAttribute("role", "dialog");
  container.setAttribute("aria-label", i18n.getMessage("selectServices"));

  // Force light theme for first-run selector
  shadowHost.className = "tbvl-light";

  // Header (simplified - no settings, minimize, or close buttons)
  const header = document.createElement("div");
  header.className = "header";

  const logo = document.createElement("div");
  logo.className = "logo";

  const logoIcon = document.createElement("img");
  logoIcon.className = "logo-icon";
  logoIcon.src = LOGO_ICON_URL;
  logoIcon.alt = "";

  const logoText = document.createElement("span");
  logoText.textContent = "BonusVarsler";

  logo.appendChild(logoIcon);
  logo.appendChild(logoText);
  header.appendChild(logo);

  // Body
  const body = document.createElement("div");
  body.className = "body";

  const content = document.createElement("div");
  content.className = "content";

  const title = document.createElement("div");
  title.className = "settings-title";
  title.textContent = i18n.getMessage("selectServices");

  content.appendChild(title);

  // Service order: active services first, then coming soon
  const serviceOrder = ["trumf", "remember", "dnb", "obos", "naf", "lofavor"];
  const toggleStates: Record<string, boolean> = {};

  // Initialize with Trumf enabled by default
  serviceOrder.forEach((serviceId) => {
    toggleStates[serviceId] = serviceId === "trumf";
  });

  // Create service rows
  serviceOrder.forEach((serviceId) => {
    const service = services[serviceId];
    if (!service) return;

    const row = document.createElement("div");
    row.className = "service-toggle-row";

    const info = document.createElement("div");
    info.className = "service-info";

    const dot = document.createElement("span");
    dot.className = "service-dot";
    dot.style.backgroundColor = service.color;

    const name = document.createElement("span");
    name.className = "service-name";
    name.textContent = service.name;

    info.appendChild(dot);
    info.appendChild(name);

    // Add "coming soon" text for placeholder services
    if (service.comingSoon) {
      const comingSoon = document.createElement("span");
      comingSoon.className = "coming-soon";
      comingSoon.textContent = i18n.getMessage("comingSoon");
      info.appendChild(comingSoon);
    }

    const toggle = document.createElement("div");
    toggle.className = "toggle-switch";
    if (toggleStates[serviceId]) {
      toggle.classList.add("active");
    }

    // Toggle click handler
    toggle.addEventListener("click", () => {
      toggleStates[serviceId] = !toggleStates[serviceId];
      toggle.classList.toggle("active", toggleStates[serviceId]);
    });

    row.appendChild(info);
    row.appendChild(toggle);
    content.appendChild(row);
  });

  // Save button
  const saveBtn = document.createElement("button");
  saveBtn.className = "action-btn";
  saveBtn.textContent = i18n.getMessage("saveServices");

  saveBtn.addEventListener("click", async () => {
    // Get enabled services
    const enabledServices = serviceOrder.filter((serviceId) => toggleStates[serviceId]);

    // Ensure at least one active (non-coming-soon) service is enabled
    const hasActiveService = enabledServices.some((id) => !services[id]?.comingSoon);
    if (!hasActiveService) {
      enabledServices.push("trumf");
    }

    // Save to storage
    await settings.setEnabledServices(enabledServices);
    await settings.setSetupComplete(true);

    // Call onSave callback or reload page
    if (onSave) {
      onSave(enabledServices);
    } else {
      window.location.reload();
    }
  });

  content.appendChild(saveBtn);
  body.appendChild(content);

  container.appendChild(header);
  container.appendChild(body);
  shadowRoot.appendChild(container);

  return shadowHost;
}
