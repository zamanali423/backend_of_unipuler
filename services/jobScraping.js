// controllers/jobScraper.js
/* eslint-disable no-console */
const puppeteer = require("puppeteer");
const pLimit = require("p-limit");
const Job = require("../models/jobs");

// ================= Utils =================
const limit = pLimit(3); // Max 3 concurrent pages per run

function normalizeUrl(url = "") {
  try {
    const u = new URL(url);
    // strip tracking params that often cause duplicates
    [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "ref",
    ].forEach((p) => u.searchParams.delete(p));
    return u.toString();
  } catch {
    return url || "";
  }
}

async function waitRandom(page, min = 250, max = 900) {
  // short random think-time between micro-actions
  const delta = min + Math.random() * (max - min);
  await page.waitForTimeout(delta);
}

async function autoScroll(
  page,
  { chunk = 800, pauseMsMin = 400, pauseMsMax = 900, maxScrolls = 60 } = {}
) {
  let scrolled = 0;
  while (scrolled < maxScrolls) {
    const prevHeight = await page.evaluate("document.body.scrollHeight");
    await page.evaluate((y) => window.scrollBy(0, y), chunk);
    await waitRandom(page, pauseMsMin, pauseMsMax);
    const newHeight = await page.evaluate("document.body.scrollHeight");
    if (newHeight <= prevHeight) break;
    scrolled += 1;
  }
}

async function clickNextSmart(
  page,
  { nextBtnSelector, stableSelector, navigation = false, timeout = 15000 }
) {
  const nextBtn = await page.$(nextBtnSelector);
  if (!nextBtn) return false;

  if (navigation) {
    await Promise.all([
      nextBtn.click(),
      page
        .waitForNavigation({ waitUntil: "networkidle2", timeout })
        .catch(() => null),
    ]);
    return true;
  }

  // SPA-style pagination: wait for list mutation
  const before = await page.$$eval(stableSelector, (nodes) =>
    nodes.map((n) => n.outerHTML).join("::SPLIT::")
  );
  await nextBtn.click();
  await waitRandom(page, 400, 1000);

  const start = Date.now();
  while (Date.now() - start < timeout) {
    const after = await page.$$eval(stableSelector, (nodes) =>
      nodes.map((n) => n.outerHTML).join("::SPLIT::")
    );
    if (after && after !== before) return true;
    await waitRandom(page, 200, 500);
  }
  return true; // even if content didn’t change, we tried; caller can break if items repeat
}

async function paginate(
  page,
  { nextBtnSelector, stableSelector, scrapeFn, hardNav = false, maxPages = 12 }
) {
  let all = [];
  let pageNum = 1;
  let lastBatchFingerprint = "";

  while (pageNum <= maxPages) {
    // scrape current page
    const batch = (await scrapeFn(page)) || [];
    // detect repeats to break (some sites loop)
    const fingerprint = batch.map((b) => b.link || b.title).join("|");
    if (fingerprint && fingerprint === lastBatchFingerprint) break;
    lastBatchFingerprint = fingerprint;

    all.push(...batch);
    // go next
    const moved = await clickNextSmart(page, {
      nextBtnSelector,
      stableSelector,
      navigation: hardNav,
    });
    if (!moved) break;
    await waitRandom(page, 500, 1200);
    pageNum += 1;
  }
  return all;
}

// ================= Site Configs =================
// Note: selectors evolve. These work as of the general structure, but you may fine-tune per region.
const buildSites = (jobTitle) => [
  {
    name: "Indeed",
    url: `https://www.indeed.com/jobs?q=${encodeURIComponent(jobTitle)}`,
    mode: "scroll",
    stableSelector: ".job_seen_beacon",
    scrape: async (page) =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll(".job_seen_beacon")).map((el) => ({
          source: "Indeed",
          title:
            el.querySelector("h2 a span")?.textContent?.trim() ||
            el.querySelector("h2")?.textContent?.trim(),
          company: el.querySelector(".companyName")?.textContent?.trim(),
          location: el.querySelector(".companyLocation")?.textContent?.trim(),
          salary:
            el.querySelector(".salary-snippet")?.textContent?.trim() || null,
          postedDate: el.querySelector(".date")?.textContent?.trim() || null,
          link:
            el.querySelector("h2 a")?.href ||
            el.querySelector("a")?.href ||
            null,
        }))
      ),
  },
  {
    name: "LinkedIn",
    url: `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(
      jobTitle
    )}`,
    mode: "scroll",
    stableSelector: ".base-card",
    scrape: async (page) =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll(".base-card")).map((el) => ({
          source: "LinkedIn",
          title: el
            .querySelector(".base-search-card__title")
            ?.textContent?.trim(),
          company: el
            .querySelector(".base-search-card__subtitle")
            ?.textContent?.trim(),
          location: el
            .querySelector(".job-search-card__location")
            ?.textContent?.trim(),
          salary: null,
          postedDate:
            el.querySelector("time")?.getAttribute("datetime") || null,
          link:
            el.querySelector("a.base-card__full-link")?.href ||
            el.querySelector("a")?.href ||
            null,
        }))
      ),
  },
  {
    name: "Glassdoor",
    url: `https://www.glassdoor.com/Job/jobs.htm?sc.keyword=${encodeURIComponent(
      jobTitle
    )}`,
    mode: "pagination",
    nextBtnSelector: ".nextButton, button[aria-label='Next']",
    stableSelector: ".react-job-listing",
    hardNav: false,
    scrape: async (page) =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll(".react-job-listing")).map(
          (el) => ({
            source: "Glassdoor",
            title:
              el.querySelector("[data-test='jobTitle']")?.textContent?.trim() ||
              el.querySelector(".jobInfoItem")?.textContent?.trim(),
            company:
              el.querySelector(".employerName")?.textContent?.trim() ||
              el.querySelector(".jobEmpolyerName")?.textContent?.trim(),
            location:
              el.querySelector(".location")?.textContent?.trim() ||
              el.querySelector(".loc")?.textContent?.trim(),
            salary:
              el
                .querySelector("[data-test='detailSalary']")
                ?.textContent?.trim() ||
              el.querySelector(".salary")?.textContent?.trim() ||
              null,
            postedDate: el.querySelector(".minor")?.textContent?.trim() || null,
            link: el.querySelector("a")?.href || null,
          })
        )
      ),
  },
  {
    name: "Monster",
    url: `https://www.monster.com/jobs/search?q=${encodeURIComponent(
      jobTitle
    )}`,
    mode: "pagination",
    nextBtnSelector: ".next, a[aria-label='Next']",
    stableSelector: "section.card-content, .results-card",
    hardNav: false,
    scrape: async (page) =>
      page.evaluate(() =>
        Array.from(
          document.querySelectorAll("section.card-content, .results-card")
        ).map((el) => ({
          source: "Monster",
          title: el.querySelector("h2")?.textContent?.trim(),
          company: el
            .querySelector(".company, .company-name")
            ?.textContent?.trim(),
          location: el.querySelector(".location")?.textContent?.trim(),
          salary: el.querySelector(".salary")?.textContent?.trim() || null,
          postedDate:
            el.querySelector("time")?.getAttribute("datetime") || null,
          link: el.querySelector("a")?.href || null,
        }))
      ),
  },
  {
    name: "SimplyHired",
    url: `https://www.simplyhired.com/search?q=${encodeURIComponent(jobTitle)}`,
    mode: "scroll",
    stableSelector: ".SerpJob-jobCard",
    scrape: async (page) =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll(".SerpJob-jobCard")).map((el) => ({
          source: "SimplyHired",
          title: el.querySelector("h3")?.textContent?.trim(),
          company: el.querySelector(".jobposting-company")?.textContent?.trim(),
          location: el
            .querySelector(".jobposting-location")
            ?.textContent?.trim(),
          salary:
            el.querySelector(".jobposting-salary")?.textContent?.trim() || null,
          postedDate:
            el.querySelector(".jobposting-posted")?.textContent?.trim() || null,
          link: el.querySelector("a")?.href || null,
        }))
      ),
  },
  {
    name: "Wellfound (AngelList)",
    url: `https://wellfound.com/jobs?query=${encodeURIComponent(jobTitle)}`,
    mode: "scroll",
    stableSelector: "[data-test='job-listing']",
    scrape: async (page) =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll("[data-test='job-listing']")).map(
          (el) => ({
            source: "AngelList",
            title: el.querySelector("h2")?.textContent?.trim(),
            company: el
              .querySelector("[data-test='company-name']")
              ?.textContent?.trim(),
            location: el
              .querySelector("[data-test='location']")
              ?.textContent?.trim(),
            salary:
              el
                .querySelector("[data-test='compensation']")
                ?.textContent?.trim() || null,
            postedDate:
              el
                .querySelector("[data-test='posted-at']")
                ?.textContent?.trim() || null,
            link: el.querySelector("a")?.href || null,
          })
        )
      ),
  },
  {
    name: "Dice",
    url: `https://www.dice.com/jobs?q=${encodeURIComponent(jobTitle)}`,
    mode: "pagination",
    nextBtnSelector: ".pagination-next, a[aria-label='Next']",
    stableSelector: ".card, .search-card",
    hardNav: false,
    scrape: async (page) =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll(".card, .search-card")).map(
          (el) => ({
            source: "Dice",
            title: el
              .querySelector(".card-title, a[data-cy='job-title']")
              ?.textContent?.trim(),
            company: el
              .querySelector(".card-company, [data-cy='company-name']")
              ?.textContent?.trim(),
            location: el
              .querySelector(
                ".card-location, [data-cy='search-result-location']"
              )
              ?.textContent?.trim(),
            salary:
              el
                .querySelector(".salary, [data-cy='compensation']")
                ?.textContent?.trim() || null,
            postedDate:
              el.querySelector(".posted-date, time")?.textContent?.trim() ||
              el.querySelector("time")?.getAttribute("datetime") ||
              null,
            link: el.querySelector("a")?.href || null,
          })
        )
      ),
  },
  {
    name: "RemoteOK",
    url: `https://remoteok.com/remote-jobs/search?query=${encodeURIComponent(
      jobTitle
    )}`,
    mode: "scroll",
    stableSelector: "tr.job",
    scrape: async (page) =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll("tr.job")).map((el) => ({
          source: "RemoteOK",
          title: el.querySelector("h2")?.textContent?.trim(),
          company:
            el.querySelector(".companyLink")?.textContent?.trim() ||
            el.querySelector("td.company h3")?.textContent?.trim(),
          location: el.querySelector(".location")?.textContent?.trim(),
          salary: el.querySelector(".salary")?.textContent?.trim() || null,
          postedDate:
            el.querySelector("time")?.getAttribute("datetime") || null,
          link: el.querySelector("a")?.href || null,
        }))
      ),
  },
  {
    name: "WeWorkRemotely",
    url: `https://weworkremotely.com/remote-jobs/search?term=${encodeURIComponent(
      jobTitle
    )}`,
    mode: "scroll",
    stableSelector: "section.jobs li a",
    scrape: async (page) =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll("section.jobs li a")).map((a) => ({
          source: "WeWorkRemotely",
          title: a.querySelector("span.title")?.textContent?.trim(),
          company: a.querySelector("span.company")?.textContent?.trim(),
          location: a.querySelector("span.region")?.textContent?.trim(),
          salary: null,
          postedDate: a.querySelector("time")?.getAttribute("datetime") || null,
          link: a.href || null,
        }))
      ),
  },
];

// ================= Core scraping per site =================
async function scrapeSiteInPage(browser, site, vendorId, io) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 900 });
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36"
  );

  // softer defaults: let JS settle but avoid hangs
  await page.setDefaultTimeout(35000);
  await page.setDefaultNavigationTimeout(45000);

  try {
    console.log(`🔎 [${vendorId}] ${site.name}: opening ${site.url}`);
    await page.goto(site.url, { waitUntil: "domcontentloaded" });
    await page
      .waitForSelector(site.stableSelector, { timeout: 20000 })
      .catch(() => null);

    let items = [];
    if (site.mode === "scroll") {
      await autoScroll(page);
      items = (await site.scrape(page)) || [];
    } else if (site.mode === "pagination") {
      items = await paginate(page, {
        nextBtnSelector: site.nextBtnSelector,
        stableSelector: site.stableSelector,
        scrapeFn: site.scrape,
        hardNav: !!site.hardNav,
        maxPages: site.maxPages || 10,
      });
    }

    // save & emit
    let savedCount = 0;
    for (const raw of items) {
      const linkNorm = normalizeUrl(raw.link);
      if (!linkNorm) continue;

      const doc = {
        ...raw,
        link: linkNorm,
        vendorId,
        scrapedAt: new Date(),
      };

      // await Job.updateOne(
      //   { vendorId, link: linkNorm },
      //   { $set: doc },
      //   { upsert: true }
      // );
      const job = await Job.insertMany(doc, { ordered: false });
      savedCount += 1;
      if (io) {
        console.log(
          `✅ [${vendorId}] ${site.name}: ${savedCount}/${items.length} saved`
        );
        io.to(vendorId).emit("job", job);
      }
    }
    return savedCount;
  } catch (err) {
    console.warn(`⚠️  [${vendorId}] ${site.name} failed:`, err.message);
    return 0;
  } finally {
    await page.close().catch(() => null);
  }
}

// ================= Public Controller (factory with io) =================
function createJobScraperController(io) {
  // GET /api/jobs/scrape?jobTitle=react%20developer
  const scrapeAllJobs = async (req, res) => {
    const jobTitle = (req.query.jobTitle || "").trim();
    const vendorId = req.user?.email || req.user?.id || "anonymous";

    if (!jobTitle) {
      return res
        .status(400)
        .json({ error: "jobTitle query param is required" });
    }

    const sites = buildSites(jobTitle);
    let browser;

    try {
      browser = await puppeteer.launch({
        headless: "new",
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-gpu",
          "--disable-dev-shm-usage",
        ],
      });

      io?.to(vendorId).emit("scrape_start", {
        vendorId,
        jobTitle,
        sites: sites.map((s) => s.name),
      });

      // Run sites with concurrency limit, reuse ONE browser instance
      const counts = await Promise.all(
        sites.map((site) =>
          limit(() => scrapeSiteInPage(browser, site, vendorId, io))
        )
      );

      const totalSaved = counts.reduce((a, b) => a + b, 0);

      io?.to(vendorId).emit("scrape_complete", {
        vendorId,
        jobTitle,
        // totalSaved,
        // perSite: sites.map((s, i) => ({ site: s.name, saved: counts[i] })),
      });

      return res.json({
        message: "Scraping completed successfully",
        // totalSaved,
        // perSite: sites.map((s, i) => ({ site: s.name, saved: counts[i] })),
      });
    } catch (err) {
      console.error("❌ Scraping failed:", err);
      return res
        .status(500)
        .json({ error: "Scraping failed", details: err.message });
    } finally {
      await browser?.close().catch(() => null);
    }
  };

  // GET /api/jobs
  const getJobs = async (req, res) => {
    const vendorId = req.user?.email || req.user?.id || "anonymous";
    try {
      const jobs = await Job.find({ vendorId }).sort({ scrapedAt: -1 });
      return res.status(200).json(jobs);
    } catch (err) {
      console.error("Error fetching jobs:", err);
      return res.status(500).json({ error: "Failed to fetch jobs" });
    }
  };

  return { scrapeAllJobs, getJobs };
}

module.exports = createJobScraperController;
