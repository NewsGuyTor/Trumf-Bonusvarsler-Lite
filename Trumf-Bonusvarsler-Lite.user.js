// ==UserScript==
// @name         Trumf Bonusvarsler Lite
// @description  Trumf Bonusvarsler Lite er et minimalistisk userscript (Firefox, Safari, Chrome) som gir deg varslel når du er inne på en nettbutikk som gir Trumf-bonus.
// @namespace    https://github.com/kristofferR/Trumf-Bonusvarsler-Lite
// @version      1.0.0
// @match        *://*/*
// @grant        GM.xmlHttpRequest
// @connect      wlp.tcb-cdn.com
// @homepageURL  https://github.com/kristofferR/Trumf-Bonusvarsler-Lite
// @supportURL   https://github.com/kristofferR/Trumf-Bonusvarsler-Lite/issues
// @icon         https://github.com/kristofferR/Trumf-Bonusvarsler-Lite/raw/main/icon.png
// @updateURL    https://github.com/kristofferR/Trumf-Bonusvarsler-Lite/raw/main/Trumf-Bonusvarsler-Lite.user.js
// @downloadURL  https://github.com/kristofferR/Trumf-Bonusvarsler-Lite/raw/main/Trumf-Bonusvarsler-Lite.user.js
// @license      GPL-3.0
// ==/UserScript==

(function() {
    'use strict';

    // Configuration Constants
    const FEED_URL           = `https://wlp.tcb-cdn.com/trumf/notifierfeed.json?v=${Date.now()}`;
    const LOCAL_KEY_DATA     = "TrumpBonusvarslerLiteFeedData";
    const LOCAL_KEY_TIME     = "TrumpBonusvarslerLiteFeedTimestamp";
    const CACHE_DURATION     = 1000 * 60 * 60 * 6; // 6 hours in milliseconds
    const WIDTH_THRESHOLD    = 700; // Window width threshold for responsive design (in pixels)
    const MESSAGE_DURATION   = 1000 * 60 * 10; // 10 minutes in milliseconds

    const currentHost        = window.location.hostname;
    const sessionClosedKey   = `TRUMPBONUSVARSLERLITE_CLOSED_${currentHost}`;
    const messageShownKey    = `TRUMPBONUSVARSLERLITE_MESSAGE_SHOWN_${currentHost}`;

    // Exit if the notifier has been closed in this tab or message was recently shown
    if (sessionStorage.getItem(sessionClosedKey) === "true") return;

    const messageShownTimestamp = localStorage.getItem(messageShownKey);
    if (messageShownTimestamp && (Date.now() - parseInt(messageShownTimestamp, 10)) < MESSAGE_DURATION) {
        return;
    }

    /**
     * Fetches the JSON feed, either from localStorage or via a network request.
     */
    function fetchFeed() {
        let feedData = null;
        const storedTime = localStorage.getItem(LOCAL_KEY_TIME);

        // Check if cached data exists and is still valid
        if (storedTime && (Date.now() - parseInt(storedTime, 10)) < CACHE_DURATION) {
            const rawData = localStorage.getItem(LOCAL_KEY_DATA);
            if (rawData) {
                try {
                    feedData = JSON.parse(rawData);
                } catch(e) {
                    console.error("Failed to parse cached JSON data:", e);
                }
            }
        }

        if (feedData) {
            processFeed(feedData);
        } else {
            // Fetch fresh data from the remote source
            GM.xmlHttpRequest({
                method: "GET",
                url: FEED_URL,
                headers: { "Accept": "application/json", "Cache-Control": "no-cache" },
                onload: (response) => {
                    if (response.status >= 200 && response.status < 300) {
                        try {
                            const json = JSON.parse(response.responseText);
                            localStorage.setItem(LOCAL_KEY_DATA, response.responseText);
                            localStorage.setItem(LOCAL_KEY_TIME, Date.now().toString());
                            processFeed(json);
                        } catch(e) {
                            console.error("Failed to parse fetched JSON data:", e);
                        }
                    } else {
                        console.error(`Failed to fetch JSON data. Status: ${response.status}`);
                    }
                },
                onerror: (error) => {
                    console.error("Error fetching JSON data:", error);
                }
            });
        }
    }

    /**
     * Processes the JSON feed and injects the notifier if the current host matches.
     * @param {Object} json - The parsed JSON data.
     */
    function processFeed(json) {
        if (!json || !json.merchants) return;

        const merchant = json.merchants[currentHost];
        if (merchant) {
            injectCSS();
            injectNotifier(merchant);
        }
    }

    /**
     * Injects the necessary CSS styles for the notifier.
     */
    function injectCSS() {
        const styles = `
/* Container for the entire notification */
.notification-container {
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 999999;
    width: 350px;
    background: #ffffff;
    border-radius: 10px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.2);
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    overflow: hidden;
    animation: slideIn 0.5s ease-out;
    transition: width 0.3s ease;
}

/* Slide-in animation for the notifier */
@keyframes slideIn {
    from {
        opacity: 0;
        transform: translateY(50px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

/* Wrapper for the notifier content */
.notification-wrapper {
    display: flex;
    flex-direction: column;
    position: relative; /* Needed for absolutely-positioned elements inside */
}

/* Header section of the notifier */
.notification-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    background-color: #f0f0f0;
    color: #333333;
}

/* Logo in the header */
.notification-logo img {
    max-height: 30px;
}

/* Close button in the header */
.notification-close-button img {
    width: 24px;
    height: 24px;
    cursor: pointer;
    transition: transform 0.2s;
}

.notification-close-button img:hover {
    transform: scale(1.2);
}

/* Body section of the notifier */
.notification-body {
    padding: 16px;
    background-color: #f9f9f9;
}

/* Text content in the notifier */
.notification-text {
    font-size: 1em;
    color: #333333;
    margin-bottom: 12px;
}

/* Cashback description styling */
.notification-cashback {
    font-size: 1.8em;
    font-weight: bold;
    color: #4D4DFF;
    display: block;
}

/* Action button styling */
.notification-button {
    display: block;
    margin: 0 auto;
    padding: 14px 28px;
    background: #4D4DFF;
    color: white;
    text-decoration: none;
    border-radius: 15px;
    font-weight: bold;
    transition: background 0.3s;
    text-align: center;
    width: 80%;
}

.notification-button:hover {
    background: #3A3AFF;
}

/* Styling for the "Husk å..." list */
.notification-list {
    list-style-type: disc;
    padding-left: 20px;
    margin-top: 8px;
    font-size: 0.9em;
    color: #555555;
}

.notification-list li {
    margin-bottom: 2px;
}

/* Info button styling (inside the box) */
.notification-info-button {
    position: absolute;
    bottom: 5px;
    right: 5px;
    width: 14px;
    height: 14px;
    font-size: 9px;
    font-weight: bold;
    font-family: sans-serif;
    color: #333;
    background-color: #ccc;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    text-decoration: none;
    opacity: 0.2;
    transition: opacity 0.2s, background-color 0.2s;
    cursor: pointer;
}

.notification-info-button:hover {
    opacity: 0.4;
    background-color: #aaa;
}

/* Responsive adjustments for smaller screens */
@media (max-width: 700px) {
    .notification-container {
        width: 90%;
        right: 5%;
    }

    .notification-text,
    .notification-list {
        display: none;
    }

    .notification-button {
        width: 100%;
    }
}
        `;
        const styleElement = document.createElement("style");
        styleElement.textContent = styles;
        document.head.appendChild(styleElement);
    }

    /**
     * Injects the notifier HTML into the page along with the info button.
     * @param {Object} merchant - The merchant data from the JSON feed.
     */
    function injectNotifier(merchant) {
        const desc = merchant.cashbackDescription;
        const basicRate = merchant.basicRate;

        // Create the notification container
        const container = document.createElement("div");
        container.classList.add("notification-container");
        container.innerHTML = `
            <div class="notification-wrapper">
                <div class="notification-header">
                    <div class="notification-logo">
                        <img src="https://trumfnetthandel.no/dest/img/Trumf/notifier/nett-handel-wrapper-logo.svg" alt="Trumf Nettbutikk Logo">
                    </div>
                    <div class="notification-close-button">
                        <img src="https://trumfnetthandel.no/dest/img/Trumf/notifier/close-button-wrapper.png" alt="Close">
                    </div>
                </div>
                <div class="notification-body">
                    <div class="notification-content">
                        <div class="notification-text">
                            <span class="notification-cashback">${desc}</span>
                            Trumf-bonus hos ${merchant.name}.<br/><br/>
                            Husk å:
                            <ul class="notification-list">
                                <li>Deaktivere uBlock Origin</li>
                                <li>Deaktivere AdGuard Home/Pi-Hole</li>
                                <li>Tømme handlevognen</li>
                            </ul>
                        </div>
                        <a class="notification-button"
                           href="https://trumfnetthandel.no/cashback/${merchant.urlName}"
                           target="_blank" rel="noopener noreferrer">
                            Få Trumf-bonus
                        </a>
                    </div>
                </div>
            </div>
        `;

        // Create the small, dim info button and append it inside the container
        const infoButton = document.createElement("a");
        infoButton.href = "https://github.com/kristofferR/Trumf-Bonusvarsler-Lite";
        infoButton.target = "_blank";
        infoButton.rel = "noopener noreferrer";
        infoButton.textContent = "i";
        infoButton.classList.add("notification-info-button");

        const wrapper = container.querySelector(".notification-wrapper");
        if (wrapper) {
            wrapper.appendChild(infoButton);
        }

        document.body.appendChild(container);

        // Initial UI Adjustment based on window size
        adjustNotifierUI(container, basicRate);

        // Attach a debounced resize event listener for responsive adjustments
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                adjustNotifierUI(container, basicRate);
            }, 150);
        });

        // Close button functionality
        const closeBtn = container.querySelector(".notification-close-button img");
        closeBtn?.addEventListener("click", () => {
            sessionStorage.setItem(sessionClosedKey, "true");
            container.remove();
        });

        // Action button click functionality
        const button = container.querySelector(".notification-button");
        button?.addEventListener("click", () => {
            // Replace the notifier content with the confirmation message
            const bodyContent = container.querySelector(".notification-content");
            if (bodyContent) {
                bodyContent.innerHTML = `<div class="notification-text">Hvis alt ble gjort riktig, skal kjøpet ha blitt registrert.</div>`;
            }

            // Set the message shown flag in localStorage with current timestamp
            localStorage.setItem(messageShownKey, Date.now().toString());
        });
    }

    /**
     * Adjusts the notifier UI based on the current window width.
     * @param {HTMLElement} container - The notification container element.
     * @param {string} basicRate - The basic rate from the JSON data.
     */
    function adjustNotifierUI(container, basicRate) {
        const windowWidth = window.innerWidth;

        const bodyText = container.querySelector(".notification-text");
        const button = container.querySelector(".notification-button");

        if (windowWidth <= WIDTH_THRESHOLD) {
            // Hide the "Husk å..." section
            if (bodyText) {
                bodyText.style.display = 'none';
            }

            // Update button text to include basicRate
            if (!button.dataset.originalText) {
                button.dataset.originalText = button.textContent.trim();
                button.textContent = `Få ${basicRate} Trumf-bonus`;
            }
        } else {
            // Show the "Husk å..." section
            if (bodyText) {
                bodyText.style.display = 'block';
            }

            // Revert button text to original
            if (button.dataset.originalText) {
                button.textContent = button.dataset.originalText;
                delete button.dataset.originalText;
            }
        }
    }

    // Initialize the script by fetching the feed
    fetchFeed();

})();
