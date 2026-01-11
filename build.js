#!/usr/bin/env node

/**
 * Build script for Trumf Bonusvarsler Lite
 * - Downloads fresh sitelist from CDN
 * - Checks CSP on all sites to find those that block adblock detection URLs
 * - Updates CSP_RESTRICTED_SITES in content.js and userscript
 * - Creates Firefox XPI and Chrome ZIP packages
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const { execSync } = require("child_process");

const FEED_URL = "https://wlp.tcb-cdn.com/trumf/notifierfeed.json";
const AD_TEST_URLS = [
  "https://widgets.outbrain.com/outbrain.js",
  "https://adligature.com/",
  "https://secure.quantserve.com/quant.js",
  "https://srvtrck.com/assets/css/LineIcons.css",
];

const BUILD_DIR = "dist";
const EXTENSION_FILES = [
  "manifest.json",
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

async function checkAllSitesCSP(sitelist) {
  const merchants = Object.keys(sitelist.merchants || {});
  console.log(`\n🔍 Checking CSP on ${merchants.length} sites (parallel)...`);

  const CONCURRENCY = 50;
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

  console.log(`\n   ✓ Found ${restrictedSites.length} CSP-restricted sites`);
  return restrictedSites.sort();
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
  let userscript = fs.readFileSync("Trumf-Bonusvarsler-Lite.user.js", "utf8");
  userscript = userscript.replace(
    /const CSP_RESTRICTED_SITES = new Set\(\[\n[\s\S]*?\]\);/,
    newSetCode
  );
  fs.writeFileSync("Trumf-Bonusvarsler-Lite.user.js", userscript);
  console.log("   ✓ Updated Trumf-Bonusvarsler-Lite.user.js");
}

function createPackages() {
  console.log("\n📦 Creating extension packages...");

  // Clean and create build directory
  if (fs.existsSync(BUILD_DIR)) {
    fs.rmSync(BUILD_DIR, { recursive: true });
  }
  fs.mkdirSync(BUILD_DIR, { recursive: true });

  // Create temp directory for extension files
  const tempDir = path.join(BUILD_DIR, "temp");
  fs.mkdirSync(tempDir, { recursive: true });

  // Copy extension files
  for (const file of EXTENSION_FILES) {
    if (fs.existsSync(file)) {
      copyRecursive(file, path.join(tempDir, file));
    }
  }

  // Read version from manifest
  const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
  const version = manifest.version;

  // Create Firefox XPI (ZIP with .xpi extension)
  const xpiName = `trumf-bonusvarsler-lite-${version}.xpi`;
  execSync(`cd "${tempDir}" && zip -r "../${xpiName}" .`, { stdio: "pipe" });
  console.log(`   ✓ Created ${xpiName}`);

  // Create Chrome ZIP
  const zipName = `trumf-bonusvarsler-lite-${version}-chrome.zip`;
  execSync(`cd "${tempDir}" && zip -r "../${zipName}" .`, { stdio: "pipe" });
  console.log(`   ✓ Created ${zipName}`);

  // Clean up temp directory
  fs.rmSync(tempDir, { recursive: true });

  console.log(`\n✅ Build complete! Packages in ${BUILD_DIR}/`);
}

function updateGitignore() {
  const gitignorePath = ".gitignore";
  let gitignore = "";

  if (fs.existsSync(gitignorePath)) {
    gitignore = fs.readFileSync(gitignorePath, "utf8");
  }

  if (!gitignore.includes(BUILD_DIR)) {
    gitignore = gitignore.trimEnd() + `\n\n# Build output\n${BUILD_DIR}/\n`;
    fs.writeFileSync(gitignorePath, gitignore);
    console.log("   ✓ Added dist/ to .gitignore");
  }
}

// ===================
// Main
// ===================

async function main() {
  console.log("🚀 Building Trumf Bonusvarsler Lite\n");

  try {
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
