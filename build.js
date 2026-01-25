#!/usr/bin/env node

/**
 * Build script for BonusVarsler
 * - Downloads fresh sitelist from CDN
 * - Checks CSP on all sites to find those that block adblock detection URLs (cached for 24h)
 * - Updates CSP_RESTRICTED_SITES in content.js and userscript
 * - Creates Firefox XPI and Chrome ZIP packages with platform-specific manifests
 * - Supports multiple variants (lite, full) via --variant flag
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const { execSync } = require("child_process");

// ===================
// CLI Argument Parsing
// ===================

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { variant: null };

  for (const arg of args) {
    if (arg.startsWith("--variant=")) {
      result.variant = arg.split("=")[1];
    }
  }

  return result;
}

// ===================
// Configuration
// ===================

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

const AVAILABLE_VARIANTS = ["lite", "full"];
const SUPPORTED_LOCALES = ["no", "en", "sv", "da", "fr", "es"];

// ===================
// Variant Management
// ===================

function loadVariantConfig(variantId) {
  const configPath = path.join("variants", variantId, "config.json");
  if (!fs.existsSync(configPath)) {
    throw new Error(`Variant config not found: ${configPath}`);
  }
  return JSON.parse(fs.readFileSync(configPath, "utf8"));
}

function getVariantsToBuild(requestedVariant) {
  if (requestedVariant) {
    if (!AVAILABLE_VARIANTS.includes(requestedVariant)) {
      throw new Error(`Unknown variant: ${requestedVariant}. Available: ${AVAILABLE_VARIANTS.join(", ")}`);
    }
    return [requestedVariant];
  }
  return AVAILABLE_VARIANTS;
}

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

async function downloadSitelist() {
  console.log("📥 Downloading fresh sitelist...");
  const response = await fetch(FEED_URL);
  if (response.statusCode !== 200) {
    throw new Error(`Failed to download sitelist: ${response.statusCode}`);
  }
  const sitelist = JSON.parse(response.data);

  // Save to both locations
  fs.writeFileSync("sitelist.json", JSON.stringify(sitelist));
  fs.writeFileSync("data/sitelist.json", JSON.stringify(sitelist));

  const merchantCount = Object.keys(sitelist.merchants || {}).length;
  console.log(`   ✓ Downloaded ${merchantCount} merchants`);
  return sitelist;
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

function createManifest(platform, variantConfig) {
  const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));

  // Inject variant-specific values
  manifest.name = variantConfig.name;
  manifest.action.default_title = variantConfig.shortName;

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
        id: variantConfig.firefoxId,
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

function injectVariantConfig(contentJs, variantConfig) {
  // Create a minimal config object to inject (only what's needed at runtime)
  const runtimeConfig = {
    id: variantConfig.id,
    shortName: variantConfig.shortName,
    showMigrationBanner: variantConfig.showMigrationBanner,
    migrationUrl: variantConfig.migrationUrl,
  };

  const configCode = `const VARIANT_CONFIG = ${JSON.stringify(runtimeConfig)};`;

  // Inject after the "use strict" line
  return contentJs.replace(
    /("use strict";)/,
    `$1\n\n  // Variant configuration (injected by build script)\n  ${configCode}`
  );
}

function generateLocaleMessages(variantConfig, locale) {
  // Read the original messages file
  const messagesPath = path.join("_locales", locale, "messages.json");
  const messages = JSON.parse(fs.readFileSync(messagesPath, "utf8"));

  // Update extensionDescription with variant-specific text
  if (variantConfig.description[locale]) {
    messages.extensionDescription.message = variantConfig.description[locale];
  }

  // Update optionsTitle to use variant name
  if (messages.optionsTitle) {
    messages.optionsTitle.message = `${variantConfig.shortName} - ${messages.optionsTitle.message.split(" - ")[1] || "Settings"}`;
  }

  return messages;
}

function createPackagesForVariant(variantConfig) {
  const variantId = variantConfig.id;
  console.log(`\n📦 Creating packages for variant: ${variantId}...`);

  // Create variant output directory
  const variantDir = path.join(BUILD_DIR, variantId);
  if (fs.existsSync(variantDir)) {
    fs.rmSync(variantDir, { recursive: true });
  }
  fs.mkdirSync(variantDir, { recursive: true });

  // Read and transform content.js
  let contentJs = fs.readFileSync("content.js", "utf8");
  contentJs = injectVariantConfig(contentJs, variantConfig);

  // Read version from manifest
  const baseManifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
  const version = baseManifest.version;

  // Determine package name prefix based on variant
  const packagePrefix = variantId === "lite" ? "bonusvarsler-lite" : "bonusvarsler";

  // Build Firefox XPI
  const firefoxDir = path.join(variantDir, "firefox");
  fs.mkdirSync(firefoxDir, { recursive: true });

  for (const file of EXTENSION_FILES) {
    if (!fs.existsSync(file)) continue;

    if (file === "content.js") {
      // Write transformed content.js
      fs.writeFileSync(path.join(firefoxDir, file), contentJs);
    } else if (file === "_locales") {
      // Generate variant-specific locale files
      for (const locale of SUPPORTED_LOCALES) {
        const localeDir = path.join(firefoxDir, "_locales", locale);
        fs.mkdirSync(localeDir, { recursive: true });
        const messages = generateLocaleMessages(variantConfig, locale);
        fs.writeFileSync(path.join(localeDir, "messages.json"), JSON.stringify(messages, null, 2));
      }
    } else {
      copyRecursive(file, path.join(firefoxDir, file));
    }
  }
  fs.writeFileSync(
    path.join(firefoxDir, "manifest.json"),
    JSON.stringify(createManifest("firefox", variantConfig), null, 2)
  );

  const xpiName = `${packagePrefix}-${version}.xpi`;
  execSync(`cd "${firefoxDir}" && zip -r "../${xpiName}" .`, { stdio: "pipe" });
  console.log(`   ✓ Created ${xpiName}`);

  // Build Chrome ZIP
  const chromeDir = path.join(variantDir, "chrome");
  fs.mkdirSync(chromeDir, { recursive: true });

  for (const file of EXTENSION_FILES) {
    if (!fs.existsSync(file)) continue;

    if (file === "content.js") {
      // Write transformed content.js
      fs.writeFileSync(path.join(chromeDir, file), contentJs);
    } else if (file === "_locales") {
      // Generate variant-specific locale files
      for (const locale of SUPPORTED_LOCALES) {
        const localeDir = path.join(chromeDir, "_locales", locale);
        fs.mkdirSync(localeDir, { recursive: true });
        const messages = generateLocaleMessages(variantConfig, locale);
        fs.writeFileSync(path.join(localeDir, "messages.json"), JSON.stringify(messages, null, 2));
      }
    } else {
      copyRecursive(file, path.join(chromeDir, file));
    }
  }
  fs.writeFileSync(
    path.join(chromeDir, "manifest.json"),
    JSON.stringify(createManifest("chrome", variantConfig), null, 2)
  );

  const zipName = `${packagePrefix}-${version}-chrome.zip`;
  execSync(`cd "${chromeDir}" && zip -r "../${zipName}" .`, { stdio: "pipe" });
  console.log(`   ✓ Created ${zipName}`);

  // Clean up temp directories
  fs.rmSync(firefoxDir, { recursive: true });
  fs.rmSync(chromeDir, { recursive: true });

  return { xpiName, zipName };
}

function createPackages(variants) {
  console.log("\n📦 Creating extension packages...");

  // Clean build directory only for variants we're building
  for (const variantId of variants) {
    const variantDir = path.join(BUILD_DIR, variantId);
    if (fs.existsSync(variantDir)) {
      fs.rmSync(variantDir, { recursive: true });
    }
  }

  // Ensure build directory exists
  fs.mkdirSync(BUILD_DIR, { recursive: true });

  const results = {};
  for (const variantId of variants) {
    const config = loadVariantConfig(variantId);
    results[variantId] = createPackagesForVariant(config);
  }

  console.log(`\n✅ Build complete! Packages in ${BUILD_DIR}/`);
  for (const [variantId, files] of Object.entries(results)) {
    console.log(`   ${variantId}/`);
    console.log(`     - ${files.xpiName}`);
    console.log(`     - ${files.zipName}`);
  }
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
  const args = parseArgs();

  try {
    const variants = getVariantsToBuild(args.variant);
    console.log(`🚀 Building BonusVarsler (variants: ${variants.join(", ")})\n`);

    // Download fresh sitelist
    const sitelist = await downloadSitelist();

    // Check CSP on all sites
    const restrictedSites = await checkAllSitesCSP(sitelist);

    // Update source files with new CSP-restricted sites list
    updateCSPRestrictedSites(restrictedSites);

    // Update .gitignore
    updateGitignore();

    // Create packages for each variant
    createPackages(variants);
  } catch (error) {
    console.error("\n❌ Build failed:", error.message);
    process.exit(1);
  }
}

main();
