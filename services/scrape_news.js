const mongoose = require("mongoose");
const News = require("../models/news");
const puppeteer = require("puppeteer");
const pLimit = require("p-limit"); // ✅ Required for p-limit v5+
const limit = pLimit(3); // Max 3 concurrent browsers

// ================= Helper Functions =================
async function waitRandom(page, min = 1500, max = 3000) {
  await page.waitForTimeout(min + Math.random() * (max - min));
}

async function autoScroll(page) {
  let previousHeight = await page.evaluate("document.body.scrollHeight");
  while (true) {
    await page.evaluate("window.scrollBy(0, window.innerHeight)");
    await waitRandom(page);
    let newHeight = await page.evaluate("document.body.scrollHeight");
    if (newHeight === previousHeight) break;
    previousHeight = newHeight;
  }
}

async function paginate(page, nextBtnSelector, scrapeFn) {
  let data = [];
  let pageNum = 1;
  while (true) {
    console.log(`📄 Scraping page ${pageNum}...`);
    data.push(...(await scrapeFn(page)));
    const nextBtn = await page.$(nextBtnSelector);
    if (!nextBtn) break;
    await Promise.all([
      nextBtn.click(),
      page.waitForNavigation({ waitUntil: "networkidle2" }),
    ]);
    await waitRandom(page);
    pageNum++;
  }
  return data;
}

// ================= News Sites Config =================
const newsSites = [
  {
    name: "BBC Europe",
    url: "https://www.bbc.com/news/world/europe",
    type: "scroll",
    selector: async (page) =>
      await page.evaluate(() =>
        Array.from(document.querySelectorAll(".gs-c-promo")).map((el) => ({
          source: "BBC Europe",
          title:
            el.querySelector(".gs-c-promo-heading__title")?.innerText.trim() ||
            "",
          link: el.querySelector("a.gs-c-promo-heading")?.href || "",
        }))
      ),
  },
  {
    name: "Euronews",
    url: "https://www.euronews.com/news/europe",
    type: "pagination",
    nextBtn: "a[rel='next']",
    selector: async (page) =>
      await page.evaluate(() =>
        Array.from(document.querySelectorAll(".m-object")).map((el) => ({
          source: "Euronews",
          title: el.querySelector(".m-object__title")?.innerText.trim() || "",
          link: el.querySelector("a.m-object__title__link")?.href || "",
        }))
      ),
  },
  {
    name: "The Guardian Europe",
    url: "https://www.theguardian.com/world/europe-news",
    type: "scroll",
    selector: async (page) =>
      await page.evaluate(() =>
        Array.from(document.querySelectorAll(".fc-item__container")).map(
          (el) => ({
            source: "The Guardian Europe",
            title: el.querySelector(".fc-item__title")?.innerText.trim() || "",
            link: el.querySelector("a.fc-item__link")?.href || "",
          })
        )
      ),
  },
];

// ================= Main Scraping Logic =================
async function scrapeSite(site) {
  console.log(`\n📰 Starting scrape for: ${site.name}`);
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109 Safari/537.36"
  );

  try {
    await page.goto(site.url, { waitUntil: "networkidle2", timeout: 60000 });
  } catch (error) {
    if (error.name === "TimeoutError") {
      console.warn(`⏳ Timeout for ${site.name}, skipping...`);
      await page.close();
      await browser.close();
      return;
    }
    throw error;
  }

  let newsItems = [];
  if (site.type === "scroll") {
    await autoScroll(page);
    newsItems = await site.selector(page);
  } else if (site.type === "pagination") {
    newsItems = await paginate(page, site.nextBtn, site.selector);
  }

  // Save to MongoDB without duplicates (match by link)
  for (let item of newsItems) {
    if (item.link) {
      await News.updateOne(
        { link: item.link },
        { $set: item },
        { upsert: true }
      );
    }
  }

  console.log(`✅ ${newsItems.length} articles processed from ${site.name}`);
  await page.close();
  await browser.close();
}

// ================= Runner =================
const scrapeAllNews = async (req, res) => {
  try {
    const results = await Promise.all(
      newsSites.map((site) => limit(() => scrapeSite(site)))
    );
    console.log("✅ All news scraping completed");
    if (res) res.json({ message: "Scraping completed successfully", results });
  } catch (error) {
    console.error("❌ Scraping failed:", error);
    if (res) res.status(500).json({ error: "Scraping failed" });
  }
};

module.exports = scrapeAllNews;
