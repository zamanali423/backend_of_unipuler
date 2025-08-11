const mongoose = require("mongoose");
const Job = require("../models/jobs");
const puppeteer = require("puppeteer");
const pLimit = require("p-limit");
const limit = pLimit(3); // max 3 concurrent browsers

// ================= Helper Functions =================
async function waitRandom(page, min = 2000, max = 4000) {
  await page.waitForTimeout(min + Math.random() * (max - min));
}

async function autoScroll(page) {
  let previousHeight = await page.evaluate("document.body.scrollHeight");
  while (true) {
    await page.evaluate("window.scrollTo(0, document.body.scrollHeight)");
    await waitRandom(page, 1500, 2500);
    let newHeight = await page.evaluate("document.body.scrollHeight");
    if (newHeight === previousHeight) break;
    previousHeight = newHeight;
  }
}

async function paginate(page, nextBtnSelector, scrapeFn) {
  let jobs = [];
  let pageNum = 1;
  while (true) {
    console.log(`📄 Scraping page ${pageNum}...`);
    jobs.push(...(await scrapeFn(page)));
    const nextBtn = await page.$(nextBtnSelector);
    if (!nextBtn) break;
    await Promise.all([
      nextBtn.click(),
      page.waitForNavigation({ waitUntil: "networkidle2" }),
    ]);
    await waitRandom(page);
    pageNum++;
  }
  return jobs;
}

// ================= Job Sites Config =================
const jobSites = [
  {
    name: "Indeed",
    url: "https://www.indeed.com/jobs?q=software+developer",
    type: "scroll",
    selector: async (page) =>
      await page.evaluate(() =>
        Array.from(document.querySelectorAll(".job_seen_beacon")).map(
          (job) => ({
            source: "Indeed",
            title: job.querySelector("h2")?.innerText.trim(),
            company: job.querySelector(".companyName")?.innerText.trim(),
            location: job.querySelector(".companyLocation")?.innerText.trim(),
            salary:
              job.querySelector(".salary-snippet")?.innerText.trim() || null,
            postedDate: job.querySelector(".date")?.innerText.trim() || null,
            link: job.querySelector("a")?.href,
          })
        )
      ),
  },
  {
    name: "LinkedIn",
    url: "https://www.linkedin.com/jobs/search/?keywords=software%20developer",
    type: "scroll",
    selector: async (page) =>
      await page.evaluate(() =>
        Array.from(document.querySelectorAll(".base-card")).map((job) => ({
          source: "LinkedIn",
          title: job
            .querySelector(".base-search-card__title")
            ?.innerText.trim(),
          company: job
            .querySelector(".base-search-card__subtitle")
            ?.innerText.trim(),
          location: job
            .querySelector(".job-search-card__location")
            ?.innerText.trim(),
          // LinkedIn often hides salary, so null if not available
          salary: null,
          postedDate:
            job.querySelector("time")?.getAttribute("datetime") || null,
          link: job.querySelector("a")?.href,
        }))
      ),
  },
  {
    name: "Glassdoor",
    url: "https://www.glassdoor.com/Job/software-developer-jobs-SRCH_KO0,18.htm",
    type: "pagination",
    nextBtn: ".nextButton",
    selector: async (page) =>
      await page.evaluate(() =>
        Array.from(document.querySelectorAll(".react-job-listing")).map(
          (job) => ({
            source: "Glassdoor",
            title: job.querySelector(".jobInfoItem")?.innerText.trim(),
            company: job.querySelector(".jobEmpolyerName")?.innerText.trim(),
            location: job.querySelector(".loc")?.innerText.trim(),
            salary: job.querySelector(".salary")?.innerText.trim() || null,
            postedDate: job.querySelector(".minor")?.innerText.trim() || null,
            link: job.querySelector("a")?.href,
          })
        )
      ),
  },
  {
    name: "Monster",
    url: "https://www.monster.com/jobs/search?q=Software-Developer",
    type: "pagination",
    nextBtn: ".next",
    selector: async (page) =>
      await page.evaluate(() =>
        Array.from(document.querySelectorAll("section.card-content")).map(
          (job) => ({
            source: "Monster",
            title: job.querySelector("h2")?.innerText.trim(),
            company: job.querySelector(".company")?.innerText.trim(),
            location: job.querySelector(".location")?.innerText.trim(),
            salary: job.querySelector(".salary")?.innerText.trim() || null,
            postedDate:
              job.querySelector("time")?.getAttribute("datetime") || null,
            link: job.querySelector("a")?.href,
          })
        )
      ),
  },
  {
    name: "SimplyHired",
    url: "https://www.simplyhired.com/search?q=software+developer",
    type: "scroll",
    selector: async (page) =>
      await page.evaluate(() =>
        Array.from(document.querySelectorAll(".SerpJob-jobCard")).map(
          (job) => ({
            source: "SimplyHired",
            title: job.querySelector("h3")?.innerText.trim(),
            company: job.querySelector(".jobposting-company")?.innerText.trim(),
            location: job
              .querySelector(".jobposting-location")
              ?.innerText.trim(),
            salary:
              job.querySelector(".jobposting-salary")?.innerText.trim() || null,
            postedDate:
              job.querySelector(".jobposting-posted")?.innerText.trim() || null,
            link: job.querySelector("a")?.href,
          })
        )
      ),
  },
  {
    name: "AngelList",
    url: "https://wellfound.com/jobs",
    type: "scroll",
    selector: async (page) =>
      await page.evaluate(() =>
        Array.from(document.querySelectorAll("[data-test='job-listing']")).map(
          (job) => ({
            source: "AngelList",
            title: job.querySelector("h2")?.innerText.trim(),
            company: job
              .querySelector("[data-test='company-name']")
              ?.innerText.trim(),
            location: job
              .querySelector("[data-test='location']")
              ?.innerText.trim(),
            salary:
              job
                .querySelector("[data-test='compensation']")
                ?.innerText.trim() || null,
            postedDate:
              job.querySelector("[data-test='posted-at']")?.innerText.trim() ||
              null,
            link: job.querySelector("a")?.href,
          })
        )
      ),
  },
  {
    name: "Dice",
    url: "https://www.dice.com/jobs?q=Software+Developer",
    type: "pagination",
    nextBtn: ".pagination-next",
    selector: async (page) =>
      await page.evaluate(() =>
        Array.from(document.querySelectorAll(".card")).map((job) => ({
          source: "Dice",
          title: job.querySelector(".card-title")?.innerText.trim(),
          company: job.querySelector(".card-company")?.innerText.trim(),
          location: job.querySelector(".card-location")?.innerText.trim(),
          salary: job.querySelector(".salary")?.innerText.trim() || null,
          postedDate:
            job.querySelector(".posted-date")?.innerText.trim() || null,
          link: job.querySelector("a")?.href,
        }))
      ),
  },
  {
    name: "RemoteOK",
    url: "https://remoteok.io/remote-dev-jobs",
    type: "scroll",
    selector: async (page) =>
      await page.evaluate(() =>
        Array.from(document.querySelectorAll(".job")).map((job) => ({
          source: "RemoteOK",
          title: job.querySelector("h2")?.innerText.trim(),
          company: job.querySelector(".companyLink")?.innerText.trim(),
          location: job.querySelector(".location")?.innerText.trim(),
          salary: job.querySelector(".salary")?.innerText.trim() || null,
          postedDate:
            job.querySelector("time")?.getAttribute("datetime") || null,
          link: job.querySelector("a")?.href,
        }))
      ),
  },
  {
    name: "StackOverflow Jobs",
    url: "https://stackoverflow.com/jobs?q=software+developer",
    type: "pagination",
    nextBtn: ".s-pagination--item__next",
    selector: async (page) =>
      await page.evaluate(() =>
        Array.from(document.querySelectorAll(".js-result")).map((job) => ({
          source: "StackOverflow",
          title: job.querySelector("h2")?.innerText.trim(),
          company: job.querySelector(".fc-black-700")?.innerText.trim(),
          location: job.querySelector(".fc-black-500")?.innerText.trim(),
          salary: job.querySelector(".-salary")?.innerText.trim() || null,
          postedDate:
            job.querySelector("time")?.getAttribute("datetime") || null,
          link: job.querySelector("a")?.href,
        }))
      ),
  },
  {
    name: "WeWorkRemotely",
    url: "https://weworkremotely.com/categories/remote-programming-jobs",
    type: "scroll",
    selector: async (page) =>
      await page.evaluate(() =>
        Array.from(document.querySelectorAll("section.jobs li")).map((job) => ({
          source: "WeWorkRemotely",
          title: job.querySelector("span.title")?.innerText.trim(),
          company: job.querySelector(".company")?.innerText.trim(),
          location: job.querySelector(".region")?.innerText.trim(),
          salary: null, // Not usually displayed
          postedDate:
            job.querySelector("time")?.getAttribute("datetime") || null,
          link: job.querySelector("a")?.href,
        }))
      ),
  },
];

// ================= Main Scraping Logic =================
async function scrapeJobs(site) {
  console.log(`\n🔍 Starting scrape for: ${site.name}`);
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109 Safari/537.36"
  );

  try {
    await page.goto(site.url, { waitUntil: "networkidle2", timeout: 60000 }); // 60s timeout
  } catch (error) {
    if (error.name === "TimeoutError") {
      console.warn(
        `⏳ Navigation timeout for ${site.name}, skipping this site.`
      );
      await page.close();
      await browser.close();
      return; // Skip current site, return early
    } else {
      // Other errors rethrow
      throw error;
    }
  }

  let jobs = [];
  if (site.type === "scroll") {
    await autoScroll(page);
    jobs = await site.selector(page);
  } else if (site.type === "pagination") {
    jobs = await paginate(page, site.nextBtn, site.selector);
  }

  // Save to MongoDB (avoid duplicates by link)
  for (let job of jobs) {
    if (job.link) {
      await Job.updateOne({ link: job.link }, { $set: job }, { upsert: true });
    }
  }

  console.log(`✅ ${jobs.length} jobs processed from ${site.name}`);
  await page.close();
  await browser.close();
}
const getJobs = async (req, res) => {
  try {
    const jobs = await Job.find().sort({ scrapedAt: -1 }); // newest first
    console.log("getjobs",jobs);
    res.status(200).json(jobs);
  } catch (error) {
    console.error("Error fetching jobs:", error);
    res.status(500).json({ error: "Failed to fetch jobs" });
  }
};
// ================= Runner =================
const scrapeAllJobs = async (req, res) => {
  try {
    const results = await Promise.all(
      jobSites.map((site) => limit(() => scrapeJobs(site)))
    );
    console.log("Scraping completed successfully");
    res.json({ message: "Scraping completed successfully", results });
  } catch (error) {
    console.error("Scraping failed:", error);
    res.status(500).json({ error: "Scraping failed" });
  }
};
module.exports = {scrapeAllJobs,getJobs};
