#!/usr/bin/env node

/**
 * Build script for BonusVarsler
 * - Downloads fresh sitelist from CDN
 * - Checks CSP on all sites to find those that block adblock detection URLs (cached for 24h)
 * - Updates CSP_RESTRICTED_SITES in content.js and userscript
 * - Creates Firefox XPI and Chrome ZIP packages with platform-specific manifests
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const { execSync } = require("child_process");

// ===================
// Configuration
// ===================

// Service definitions (must match content.js)
const SERVICES = {
  trumf: {
    id: "trumf",
    name: "Trumf",
    feedUrl: "https://wlp.tcb-cdn.com/trumf/notifierfeed.json",
    clickthroughUrl: "https://trumfnetthandel.no/cashback/{urlName}",
    reminderDomain: "trumfnetthandel.no",
    color: "#E31837",
    defaultEnabled: true,
  },
  remember: {
    id: "remember",
    name: "re:member",
    feedUrl: "https://wlp.tcb-cdn.com/remember/notifierfeed.json",
    clickthroughUrl: "https://remember.no/shop/{urlName}",
    reminderDomain: "remember.no",
    color: "#00A0D2",
    defaultEnabled: false,
  },
};

const FEED_URL = "https://wlp.tcb-cdn.com/trumf/notifierfeed.json";
const AD_TEST_URLS = [
  "https://widgets.outbrain.com/outbrain.js",
  "https://adligature.com/",
  "https://secure.quantserve.com/quant.js",
  "https://srvtrck.com/assets/css/LineIcons.css",
];

const BUILD_DIR = "dist";
const CSP_CACHE_FILE = ".csp-cache.json";
const CSP_CACHE_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours in ms

const EXTENSION_FILES = [
  "content.js",
  "background.js",
  "options.html",
  "options.js",
  "options.css",
  "icon.png",
  "icons",
  "_locales",
  "data",
];

const SUPPORTED_LOCALES = ["no", "en", "sv", "da", "fr", "es"];

// Extension metadata
const EXTENSION_CONFIG = {
  name: "BonusVarsler",
  shortName: "BonusVarsler",
  firefoxId: "bonusvarsler@kristofferR",
};

// ===================
// Utility Functions
// ===================

function fetch(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { timeout: 10000 }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return fetch(res.headers.location).then(resolve).catch(reject);
        }
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve({ statusCode: res.statusCode, data, headers: res.headers }));
      })
      .on("error", reject)
      .on("timeout", () => reject(new Error("Timeout")));
  });
}

function fetchHeaders(url, timeout = 5000) {
  return new Promise((resolve) => {
    const protocol = url.startsWith("https") ? https : http;
    const req = protocol.get(
      url,
      { timeout, headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" } },
      (res) => {
        resolve({ statusCode: res.statusCode, headers: res.headers, location: res.headers.location });
        res.destroy();
      }
    );
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
  });
}

function parseCSP(cspHeader) {
  if (!cspHeader) return null;
  const directives = {};
  const parts = cspHeader.split(";").map((p) => p.trim());
  for (const part of parts) {
    const [directive, ...values] = part.split(/\s+/);
    if (directive) directives[directive.toLowerCase()] = values;
  }
  return directives;
}

function wouldBlockUrl(csp, testUrl) {
  if (!csp) return false;
  const testHostname = new URL(testUrl).hostname;
  const connectSrc = csp["connect-src"];
  if (!connectSrc) return false;
  if (connectSrc.length === 0) return true;

  for (const source of connectSrc) {
    if (source === "*") return false;
    if (source === "'self'") continue;
    if (source.includes("*")) {
      const pattern = source.replace(/\./g, "\\.").replace(/\*/g, ".*").replace(/^https?:\/\//, "");
      try {
        if (new RegExp(`^${pattern}$`).test(testHostname)) return false;
      } catch {}
    }
    try {
      const sourceUrl = source.startsWith("http") ? source : `https://${source}`;
      const sourceHostname = new URL(sourceUrl).hostname;
      if (sourceHostname === testHostname || testHostname.endsWith(`.${sourceHostname}`)) return false;
    } catch {}
  }
  return true;
}

async function checkSiteCSP(hostname) {
  const url = `https://${hostname}`;
  let result = await fetchHeaders(url);

  let redirects = 0;
  while (result?.location && redirects < 3) {
    const redirectUrl = result.location.startsWith("http") ? result.location : new URL(result.location, url).href;
    result = await fetchHeaders(redirectUrl);
    redirects++;
  }

  if (!result) return { hostname, error: true, blocked: [] };

  const cspHeader = result.headers["content-security-policy"] || result.headers["content-security-policy-report-only"];
  if (!cspHeader) return { hostname, blocked: [] };

  const csp = parseCSP(cspHeader);
  const blocked = AD_TEST_URLS.filter((testUrl) => wouldBlockUrl(csp, testUrl));

  return { hostname, blocked, allBlocked: blocked.length === AD_TEST_URLS.length };
}

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const child of fs.readdirSync(src)) {
      copyRecursive(path.join(src, child), path.join(dest, child));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

// ===================
// Main Build Steps
// ===================

async function downloadServiceFeed(service) {
  console.log(`   Fetching ${service.name} feed...`);
  try {
    const response = await fetch(service.feedUrl);
    if (response.statusCode !== 200) {
      console.log(`   ⚠ Failed to download ${service.name} feed: ${response.statusCode}`);
      return null;
    }
    const feed = JSON.parse(response.data);
    const merchantCount = Object.keys(feed.merchants || {}).length;
    console.log(`   ✓ ${service.name}: ${merchantCount} merchants`);
    return feed;
  } catch (error) {
    console.log(`   ⚠ Error fetching ${service.name} feed: ${error.message}`);
    return null;
  }
}

async function downloadSitelist() {
  console.log("📥 Downloading service feeds...");

  // Download all service feeds in parallel
  const feedPromises = Object.values(SERVICES).map(async (service) => ({
    service,
    feed: await downloadServiceFeed(service),
  }));
  const results = await Promise.all(feedPromises);

  // Create unified feed structure
  const unifiedFeed = {
    services: {},
    merchants: {},
  };

  // Add service metadata
  for (const service of Object.values(SERVICES)) {
    unifiedFeed.services[service.id] = {
      name: service.name,
      clickthroughUrl: service.clickthroughUrl,
      reminderDomain: service.reminderDomain,
      color: service.color,
      defaultEnabled: service.defaultEnabled,
    };
  }

  // Merge merchants from all feeds
  for (const { service, feed } of results) {
    if (!feed || !feed.merchants) continue;

    for (const [host, merchant] of Object.entries(feed.merchants)) {
      // Create merchant entry if doesn't exist
      if (!unifiedFeed.merchants[host]) {
        unifiedFeed.merchants[host] = {
          hostName: merchant.hostName || host,
          name: merchant.name,
          offers: [],
        };
      }

      // Add offer for this service
      unifiedFeed.merchants[host].offers.push({
        serviceId: service.id,
        urlName: merchant.urlName,
        cashbackDescription: merchant.cashbackDescription,
      });
    }
  }

  // Save to both locations
  fs.writeFileSync("sitelist.json", JSON.stringify(unifiedFeed));
  fs.writeFileSync("data/sitelist.json", JSON.stringify(unifiedFeed));

  const merchantCount = Object.keys(unifiedFeed.merchants).length;
  const multiServiceCount = Object.values(unifiedFeed.merchants).filter(
    (m) => m.offers.length > 1
  ).length;
  console.log(`   ✓ Combined feed: ${merchantCount} merchants (${multiServiceCount} with multiple services)`);

  return unifiedFeed;
}

function loadCSPCache() {
  try {
    if (fs.existsSync(CSP_CACHE_FILE)) {
      const cache = JSON.parse(fs.readFileSync(CSP_CACHE_FILE, "utf8"));
      const age = Date.now() - cache.timestamp;
      if (age < CSP_CACHE_MAX_AGE) {
        return cache;
      }
    }
  } catch {}
  return null;
}

function saveCSPCache(restrictedSites) {
  const cache = {
    timestamp: Date.now(),
    restrictedSites,
  };
  fs.writeFileSync(CSP_CACHE_FILE, JSON.stringify(cache, null, 2));
}

async function checkAllSitesCSP(sitelist) {
  // Check cache first
  const cache = loadCSPCache();
  if (cache) {
    const ageHours = Math.round((Date.now() - cache.timestamp) / (60 * 60 * 1000));
    console.log(`\n🔍 Using cached CSP results (${ageHours}h old, ${cache.restrictedSites.length} restricted sites)`);
    return cache.restrictedSites;
  }

  // Get all unique merchant hosts
  const merchants = Object.keys(sitelist.merchants || {});
  console.log(`\n🔍 Checking CSP on ${merchants.length} sites (parallel)...`);

  const CONCURRENCY = 30;
  const restrictedSites = [];
  let checked = 0;

  // Process in parallel batches
  for (let i = 0; i < merchants.length; i += CONCURRENCY) {
    const batch = merchants.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map((hostname) => checkSiteCSP(hostname)));

    for (const result of results) {
      checked++;
      if (result.allBlocked) {
        restrictedSites.push(result.hostname);
        console.log(`   [${checked}/${merchants.length}] ${result.hostname}: CSP blocks all test URLs`);
      }
    }
    process.stdout.write(`\r   [${checked}/${merchants.length}] Checking...`);
  }

  const sorted = restrictedSites.sort();
  console.log(`\n   ✓ Found ${sorted.length} CSP-restricted sites`);

  // Save to cache
  saveCSPCache(sorted);

  return sorted;
}

function updateCSPRestrictedSites(restrictedSites) {
  console.log("\n📝 Updating CSP_RESTRICTED_SITES in source files...");

  const siteListCode = restrictedSites.map((s) => `    "${s}",`).join("\n");
  const newSetCode = `const CSP_RESTRICTED_SITES = new Set([\n${siteListCode}\n  ]);`;

  // Update content.js
  let contentJs = fs.readFileSync("content.js", "utf8");
  contentJs = contentJs.replace(
    /const CSP_RESTRICTED_SITES = new Set\(\[\n[\s\S]*?\]\);/,
    newSetCode
  );
  fs.writeFileSync("content.js", contentJs);
  console.log("   ✓ Updated content.js");

  // Update userscript
  let userscript = fs.readFileSync("BonusVarsler.user.js", "utf8");
  userscript = userscript.replace(
    /const CSP_RESTRICTED_SITES = new Set\(\[\n[\s\S]*?\]\);/,
    newSetCode
  );
  fs.writeFileSync("BonusVarsler.user.js", userscript);
  console.log("   ✓ Updated BonusVarsler.user.js");
}

function createManifest(platform) {
  const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));

  // Set extension name
  manifest.name = EXTENSION_CONFIG.name;
  manifest.action.default_title = EXTENSION_CONFIG.shortName;

  if (platform === "chrome") {
    // Chrome uses service_worker
    manifest.background = {
      service_worker: "background.js",
    };
    // Remove Firefox-specific settings
    delete manifest.browser_specific_settings;
  } else {
    // Firefox uses scripts array
    manifest.background = {
      scripts: ["background.js"],
    };
    // Firefox-specific settings
    manifest.browser_specific_settings = {
      gecko: {
        id: EXTENSION_CONFIG.firefoxId,
        strict_min_version: "142.0",
        granted_host_permissions: true,
        data_collection_permissions: {
          required: ["none"],
          optional: [],
        },
      },
    };
  }

  return manifest;
}

function createPackages() {
  console.log("\n📦 Creating extension packages...");

  // Clean and create build directory
  if (fs.existsSync(BUILD_DIR)) {
    fs.rmSync(BUILD_DIR, { recursive: true });
  }
  fs.mkdirSync(BUILD_DIR, { recursive: true });

  // Read version from manifest
  const baseManifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
  const version = baseManifest.version;

  // Build Firefox XPI
  const firefoxDir = path.join(BUILD_DIR, "firefox");
  fs.mkdirSync(firefoxDir, { recursive: true });

  for (const file of EXTENSION_FILES) {
    if (!fs.existsSync(file)) continue;
    copyRecursive(file, path.join(firefoxDir, file));
  }
  fs.writeFileSync(
    path.join(firefoxDir, "manifest.json"),
    JSON.stringify(createManifest("firefox"), null, 2)
  );

  const xpiName = `bonusvarsler-lite-${version}.xpi`;
  execSync(`cd "${firefoxDir}" && zip -r "../${xpiName}" .`, { stdio: "pipe" });
  console.log(`   ✓ Created ${xpiName}`);

  // Build Chrome ZIP
  const chromeDir = path.join(BUILD_DIR, "chrome");
  fs.mkdirSync(chromeDir, { recursive: true });

  for (const file of EXTENSION_FILES) {
    if (!fs.existsSync(file)) continue;
    copyRecursive(file, path.join(chromeDir, file));
  }
  fs.writeFileSync(
    path.join(chromeDir, "manifest.json"),
    JSON.stringify(createManifest("chrome"), null, 2)
  );

  const zipName = `bonusvarsler-lite-${version}-chrome.zip`;
  execSync(`cd "${chromeDir}" && zip -r "../${zipName}" .`, { stdio: "pipe" });
  console.log(`   ✓ Created ${zipName}`);

  // Clean up temp directories
  fs.rmSync(firefoxDir, { recursive: true });
  fs.rmSync(chromeDir, { recursive: true });

  console.log(`\n✅ Build complete! Packages in ${BUILD_DIR}/`);
  console.log(`   - ${xpiName}`);
  console.log(`   - ${zipName}`);
}

function updateGitignore() {
  const gitignorePath = ".gitignore";
  let gitignore = "";
  let updated = false;

  if (fs.existsSync(gitignorePath)) {
    gitignore = fs.readFileSync(gitignorePath, "utf8");
  }

  if (!gitignore.includes(BUILD_DIR)) {
    gitignore = gitignore.trimEnd() + `\n\n# Build output\n${BUILD_DIR}/\n`;
    updated = true;
  }

  if (!gitignore.includes(CSP_CACHE_FILE)) {
    gitignore = gitignore.trimEnd() + `\n${CSP_CACHE_FILE}\n`;
    updated = true;
  }

  if (updated) {
    fs.writeFileSync(gitignorePath, gitignore);
    console.log("   ✓ Updated .gitignore");
  }
}

// ===================
// Main
// ===================

async function main() {
  try {
    console.log("🚀 Building BonusVarsler\n");

    // Download fresh sitelist
    const sitelist = await downloadSitelist();

    // Check CSP on all sites
    const restrictedSites = await checkAllSitesCSP(sitelist);

    // Update source files with new CSP-restricted sites list
    updateCSPRestrictedSites(restrictedSites);

    // Update .gitignore
    updateGitignore();

    // Create packages
    createPackages();
  } catch (error) {
    console.error("\n❌ Build failed:", error.message);
    process.exit(1);
  }
}

main();
