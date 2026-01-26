/**
 * CSS exports
 * These are imported as strings via the esbuild CSS plugin
 */

import baseCSS from "./base.css";
import notificationCSS from "./notification.css";
import reminderCSS from "./reminder.css";
import serviceSelectorCSS from "./service-selector.css";

export { baseCSS, notificationCSS, reminderCSS, serviceSelectorCSS };

/**
 * Get combined CSS for main notification
 */
export function getNotificationStyles(): string {
  return baseCSS + notificationCSS;
}

/**
 * Get combined CSS for reminder notification
 */
export function getReminderStyles(): string {
  return baseCSS + reminderCSS;
}

/**
 * Get combined CSS for service selector
 */
export function getServiceSelectorStyles(): string {
  return baseCSS + serviceSelectorCSS;
}
