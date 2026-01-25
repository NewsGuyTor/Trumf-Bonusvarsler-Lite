/**
 * Trumf Netthandel Scraper
 *
 * Uses Playwright to scrape all merchants from trumfnetthandel.no/kategori
 * by scrolling to trigger lazy loading.
 *
 * Strategy:
 * 1. Fetch the official CDN feed to get hostname -> urlName mappings
 * 2. Use Playwright to load /kategori and scroll until all merchants are loaded
 * 3. Use manual hostname mappings for merchants not in CDN feed
 * 4. Output updated sitelist.json
 */

import { chromium } from "playwright";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";

const BASE_URL = "https://trumfnetthandel.no";
const CDN_FEED_URL = "https://wlp.tcb-cdn.com/trumf/notifierfeed.json";

// Manual hostname mappings for merchants not in CDN feed
const MANUAL_HOSTNAME_MAPPINGS: Record<string, string> = {
  // Travel
  "trumfhotels-no": "www.hotels.com",
  "expedia-trumf": "www.expedia.no",
  "vrbo-trumf": "www.vrbo.com",
  // Electronics
  "apple-trumf": "www.apple.com",
  // Opticians
  "brilleland-trumf": "www.brilleland.no",
  "interoptik-trumf": "www.interoptik.no",
  // Health
  "dentway-trumfs": "www.dentway.no",
};

// Hostname aliases (alternative domains that should map to same merchant)
const HOSTNAME_ALIASES: Record<string, string> = {
  "no.hotels.com": "www.hotels.com",
  "hotels.com": "www.hotels.com",
  "expedia.com": "www.expedia.no",
  "expedia.no": "www.expedia.no",
  "vrbo.no": "www.vrbo.com",
  "apple.com": "www.apple.com",
};

interface Merchant {
  hostName: string;
  urlName: string;
  name: string;
  cashbackDescription: string;
  basicRate: string;
  headerId?: number;
  programId?: number;
}

interface CDNFeed {
  settings: Record<string, unknown>;
  merchants: Record<string, Merchant>;
}

interface SiteList {
  settings: Record<string, unknown>;
  merchants: Record<string, Merchant>;
}

interface ScrapedMerchant {
  name: string;
  cashbackDescription: string;
  slug: string;
}

/**
 * Fetch CDN feed and build urlName -> hostname mapping
 */
async function fetchCDNFeed(): Promise<{
  feed: CDNFeed;
  urlNameToHostname: Map<string, string>;
}> {
  const response = await fetch(CDN_FEED_URL);
  const feed: CDNFeed = await response.json();

  const urlNameToHostname = new Map<string, string>();
  for (const [hostname, merchant] of Object.entries(feed.merchants)) {
    urlNameToHostname.set(merchant.urlName, hostname);
  }

  return { feed, urlNameToHostname };
}

/**
 * Infer hostname from merchant name
 */
function inferHostname(name: string): string | null {
  const cleanName = name.toLowerCase().trim();

  // If name looks like a domain already
  if (cleanName.includes(".com") || cleanName.includes(".no") || cleanName.includes(".se")) {
    const domainMatch = cleanName.match(/([a-z0-9-]+\.[a-z]{2,})/);
    if (domainMatch) {
      return `www.${domainMatch[1]}`;
    }
  }

  // Check well-known brands
  const normalized = cleanName.replace(/[^a-z0-9]/g, "").toLowerCase();
  const wellKnownBrands: Record<string, string> = {
    hotelscom: "www.hotels.com",
    expedia: "www.expedia.no",
    vrbo: "www.vrbo.com",
    apple: "www.apple.com",
    ebay: "www.ebay.com",
  };

  return wellKnownBrands[normalized] || null;
}

/**
 * Extract basic rate from cashback description
 */
function extractBasicRate(cashbackDescription: string): string {
  const optilMatch = cashbackDescription.match(/Opptil\s+(\d+[,.]?\d*\s*%|\d+\s*kr)/i);
  if (optilMatch) {
    return optilMatch[1].replace(/\s+/g, "");
  }
  const rateMatch = cashbackDescription.match(/(\d+[,.]?\d*\s*%|\d+\s*kr)/i);
  return rateMatch ? rateMatch[0].replace(/\s+/g, "") : cashbackDescription;
}

/**
 * Use Playwright to scrape all merchants from /kategori with lazy loading
 */
async function scrapeWithPlaywright(): Promise<ScrapedMerchant[]> {
  console.log("Launching browser...");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log("Loading /kategori page...");
    await page.goto(`${BASE_URL}/kategori`, { waitUntil: "domcontentloaded" });

    // Wait for initial content
    await page.waitForSelector('a[href^="/cashback/"]', { timeout: 10000 });

    // Scroll to load all lazy-loaded content
    console.log("Scrolling to load all merchants...");
    let previousCount = 0;
    let currentCount = 0;
    let stableCount = 0;
    let scrollAttempts = 0;
    const maxScrollAttempts = 100;

    do {
      previousCount = currentCount;

      // Scroll down incrementally
      await page.evaluate(() => {
        window.scrollBy(0, window.innerHeight);
      });

      // Wait for potential new content to load
      await page.waitForTimeout(300);

      // Also try waiting for network to settle
      try {
        await page.waitForLoadState("networkidle", { timeout: 1000 });
      } catch {
        // Timeout is fine, continue scrolling
      }

      // Count current merchants
      currentCount = await page.locator('a[href^="/cashback/"]').count();

      // Track how many times count has been stable
      if (currentCount === previousCount) {
        stableCount++;
      } else {
        stableCount = 0;
      }

      scrollAttempts++;
      process.stdout.write(`\r  Found ${currentCount} merchants (scroll ${scrollAttempts}, stable: ${stableCount})...`);

      // Stop if count has been stable for 5 scrolls at the bottom
    } while (stableCount < 5 && scrollAttempts < maxScrollAttempts);

    console.log(`\n  Finished scrolling. Total: ${currentCount} merchants`);

    // Extract merchant data
    console.log("Extracting merchant data...");
    const merchants = await page.evaluate(() => {
      const results: { name: string; cashbackDescription: string; slug: string }[] = [];
      const seen = new Set<string>();

      document.querySelectorAll('a[href^="/cashback/"]').forEach((link) => {
        const href = link.getAttribute("href") || "";
        const slug = decodeURIComponent(href.replace("/cashback/", "").split("?")[0]);

        if (!slug || seen.has(slug)) return;
        seen.add(slug);

        // Get merchant name - look for heading or image alt
        const name =
          link.querySelector("h3, h4, h5")?.textContent?.trim() ||
          link.querySelector("img")?.getAttribute("alt")?.trim() ||
          "";

        // Get cashback rate - look for text containing %
        const allText = link.textContent || "";
        const cashbackMatch = allText.match(/(\d+[,.]?\d*\s*%|Opptil\s+\d+[,.]?\d*\s*%|\d+\s*kr)/i);
        const cashbackDescription = cashbackMatch ? cashbackMatch[0].trim() : "";

        if (name) {
          results.push({ name, cashbackDescription, slug });
        }
      });

      return results;
    });

    return merchants;
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log("Starting Trumf scraper...\n");

  // Step 1: Fetch CDN feed for hostname mappings
  console.log("Fetching CDN feed for hostname mappings...");
  let cdnFeed: CDNFeed | null = null;
  let urlNameToHostname = new Map<string, string>();

  try {
    const result = await fetchCDNFeed();
    cdnFeed = result.feed;
    urlNameToHostname = result.urlNameToHostname;
    console.log(`  Found ${urlNameToHostname.size} hostname mappings in CDN feed\n`);
  } catch (error) {
    console.error("  Failed to fetch CDN feed, continuing without it\n");
  }

  // Step 2: Scrape all merchants using Playwright
  const scrapedMerchants = await scrapeWithPlaywright();
  console.log(`\nScraped ${scrapedMerchants.length} unique merchants\n`);

  // Step 3: Resolve hostnames and build merchant list
  console.log("Resolving hostnames...");
  const resolvedMerchants: Merchant[] = [];
  const unmappedMerchants: string[] = [];
  const newMerchants: string[] = [];

  for (const merchant of scrapedMerchants) {
    const slug = merchant.slug;

    // Try to find hostname from various sources
    let hostname: string | null = null;

    // 1. Check CDN feed
    if (urlNameToHostname.has(slug)) {
      hostname = urlNameToHostname.get(slug)!;
    }
    // 2. Check manual mappings
    else if (MANUAL_HOSTNAME_MAPPINGS[slug]) {
      hostname = MANUAL_HOSTNAME_MAPPINGS[slug];
      newMerchants.push(`${merchant.name} -> ${hostname} (manual mapping)`);
    }
    // 3. Try to infer from name
    else {
      hostname = inferHostname(merchant.name);
      if (hostname) {
        newMerchants.push(`${merchant.name} -> ${hostname} (inferred)`);
      }
    }

    if (!hostname) {
      unmappedMerchants.push(`${merchant.name} (slug: ${slug})`);
      continue;
    }

    // Get existing merchant data for headerId/programId only
    const existingMerchant = cdnFeed?.merchants[hostname];

    resolvedMerchants.push({
      hostName: hostname,
      urlName: slug,
      name: merchant.name,
      cashbackDescription: merchant.cashbackDescription,
      basicRate: extractBasicRate(merchant.cashbackDescription),
      ...(existingMerchant?.headerId && { headerId: existingMerchant.headerId }),
      ...(existingMerchant?.programId && { programId: existingMerchant.programId }),
    });
  }

  // Step 4: Load existing sitelist.json for settings
  const sitelistPath = join(import.meta.dir, "..", "sitelist.json");
  let existingSitelist: SiteList;

  try {
    const content = await readFile(sitelistPath, "utf-8");
    existingSitelist = JSON.parse(content);
  } catch (error) {
    console.error("Failed to read sitelist.json:", error);
    process.exit(1);
  }

  // Step 5: Build final merchant list
  const merchants: Record<string, Merchant> = {};
  const removedMerchants: string[] = [];

  // Add resolved merchants from scrape
  for (const merchant of resolvedMerchants) {
    if (!merchant.hostName || merchant.hostName.length < 4) continue;
    const resolvedHostname = HOSTNAME_ALIASES[merchant.hostName] || merchant.hostName;
    merchants[resolvedHostname] = {
      ...merchant,
      hostName: resolvedHostname,
    };
  }

  // Track removed merchants
  for (const [hostname, merchant] of Object.entries(existingSitelist.merchants)) {
    if (!merchants[hostname]) {
      removedMerchants.push(`${merchant.name} (${hostname})`);
    }
  }

  // Step 6: Write updated sitelist.json
  const updatedSitelist: SiteList = {
    settings: existingSitelist.settings,
    merchants,
  };

  await writeFile(sitelistPath, JSON.stringify(updatedSitelist, null, 2) + "\n");

  // Step 7: Summary
  console.log("\n=== Summary ===");
  console.log(`Total merchants in output: ${Object.keys(merchants).length}`);
  console.log(`  - Scraped and mapped: ${resolvedMerchants.length}`);
  console.log(`  - Removed (no longer on site): ${removedMerchants.length}`);
  console.log(`  - Unmapped (skipped): ${unmappedMerchants.length}`);

  if (newMerchants.length > 0) {
    console.log("\nNew merchants added:");
    for (const m of newMerchants) {
      console.log(`  + ${m}`);
    }
  }

  if (removedMerchants.length > 0) {
    console.log("\nRemoved merchants (no longer on website):");
    for (const m of removedMerchants.slice(0, 15)) {
      console.log(`  - ${m}`);
    }
    if (removedMerchants.length > 15) {
      console.log(`  ... and ${removedMerchants.length - 15} more`);
    }
  }

  if (unmappedMerchants.length > 0) {
    console.log("\nUnmapped merchants (need manual hostname mapping):");
    for (const m of unmappedMerchants.slice(0, 15)) {
      console.log(`  - ${m}`);
    }
    if (unmappedMerchants.length > 15) {
      console.log(`  ... and ${unmappedMerchants.length - 15} more`);
    }
  }

  console.log("\nDone! Updated sitelist.json");
}

main().catch(console.error);
