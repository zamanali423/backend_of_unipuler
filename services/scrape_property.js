const mongoose = require("mongoose");
const Property = require("../models/property"); // Adjust path as needed
const puppeteer = require("puppeteer");
const pLimit = require("p-limit");
const limit = pLimit(3); // Max 3 concurrent browsers
const { URL } = require("url"); // Node built-in

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
  let listings = [];
  let pageNum = 1;
  while (true) {
    console.log(`📄 Scraping page ${pageNum}...`);
    listings.push(...(await scrapeFn(page)));
    const nextBtn = await page.$(nextBtnSelector);
    if (!nextBtn) break;
    await Promise.all([
      nextBtn.click(),
      page.waitForNavigation({ waitUntil: "networkidle2" }),
    ]);
    await waitRandom(page);
    pageNum++;
  }
  return listings;
}

// ================= Property Sites Config =================
const sites = [
  {
    name: "Rightmove",
    url: "https://www.rightmove.co.uk/property-for-sale.html",
    type: "pagination",
    nextBtn: "button.pagination-direction--next",
    selector: async (page) =>
      await page.evaluate(() =>
        Array.from(document.querySelectorAll(".propertyCard")).map((card) => ({
          title: card.querySelector("h2.propertyCard-title")?.innerText.trim(),
          price:
            card.querySelector(".propertyCard-priceValue")?.innerText.trim() ||
            null,
          location:
            card.querySelector(".propertyCard-address")?.innerText.trim() ||
            null,
          url: card.querySelector("a.propertyCard-link")?.href || null,
          image: card.querySelector("img.propertyCard-img")?.src || null,
        }))
      ),
  },
  {
    name: "Idealista",
    url: "https://www.idealista.pt/en/comprar-casas/",
    type: "scroll",
    selector: async (page) =>
      await page.evaluate(() =>
        Array.from(document.querySelectorAll("article.item")).map((card) => ({
          title: card.querySelector("a.item-link")?.innerText.trim(),
          price: card.querySelector(".item-price")?.innerText.trim() || null,
          location:
            card.querySelector(".item-detail-location")?.innerText.trim() ||
            null,
          url: card.querySelector("a.item-link")?.href || null,
          image: card.querySelector("img[itemprop='image']")?.src || null,
        }))
      ),
  },
  {
    name: "ImmoScout24",
    url: "https://www.immobilienscout24.de/Suche/de/wohnung-kaufen",
    type: "pagination",
    selector: async (page) =>
      await page.evaluate(() =>
        Array.from(document.querySelectorAll(".result-list__listing")).map(
          (card) => ({
            title: card.querySelector("h5")?.innerText.trim(),
            price:
              card
                .querySelector(".result-list-entry__primary-criteria div")
                ?.innerText.trim() || null,
            location:
              card
                .querySelector(".result-list-entry__address")
                ?.innerText.trim() || null,
            url:
              card.querySelector("a.result-list-entry__brand-title-container")
                ?.href || null,
            image: card.querySelector("img")?.src || null,
          })
        )
      ),
  },
  {
    name: "Immoweb",
    url: "https://www.immoweb.be/en/search/house-and-apartment/for-sale",
    type: "pagination",
    nextBtn: "a.pagination__link--next",
    selector: async (page) =>
      await page.evaluate(() =>
        Array.from(document.querySelectorAll(".search-results__item")).map(
          (card) => ({
            title: card.querySelector(".card__title")?.innerText.trim(),
            price: card.querySelector(".card__price")?.innerText.trim() || null,
            location:
              card.querySelector(".card__location")?.innerText.trim() || null,
            url: card.querySelector("a.card__title-link")?.href || null,
            image: card.querySelector("img.card__image")?.src || null,
          })
        )
      ),
  },
  {
    name: "SeLoger",
    url: "https://www.seloger.com/list.htm?tri=initial&enterprise=0&types=1,2&projects=2&places=%5B%7Bcp%3A75000%7D%5D",
    type: "pagination",
    nextBtn: ".Pagination-next a",
    selector: async (page) =>
      await page.evaluate(() =>
        Array.from(document.querySelectorAll(".c-pa-list__item")).map(
          (card) => ({
            title: card.querySelector(".CardTitle")?.innerText.trim(),
            price: card.querySelector(".Price")?.innerText.trim() || null,
            location: card.querySelector(".Card-location")?.innerText.trim(),
            url: card.querySelector("a")?.href || null,
            image: card
              .querySelector("img[data-src]")
              ?.getAttribute("data-src"),
          })
        )
      ),
  },
];

// ================= Main Scraping Logic =================
async function scrapeSite(site) {
  console.log(`\n🔍 Starting scrape for: ${site.name}`);

  if (
    !site.url ||
    typeof site.url !== "string" ||
    !site.url.startsWith("http")
  ) {
    console.warn(`⚠️ Invalid start URL for ${site.name}, skipping...`);
    return;
  }

  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109 Safari/537.36"
  );

  try {
    await page.goto(site.url, { waitUntil: "networkidle2", timeout: 60000 });
  } catch (error) {
    if (error.name === "TimeoutError") {
      console.warn(`⏳ Navigation timeout for ${site.name}, skipping...`);
      await page.close();
      await browser.close();
      return;
    } else {
      throw error;
    }
  }

  let listings = [];
  if (site.type === "scroll") {
    await autoScroll(page);
    listings = await site.selector(page);
  } else if (site.type === "pagination") {
    listings = await paginate(page, site.nextBtn, site.selector);
  }

  // Normalize URLs to absolute
  listings = listings.map((property) => {
    if (property.url && !property.url.startsWith("http")) {
      try {
        property.url = new URL(property.url, site.url).toString();
      } catch {
        property.url = null;
      }
    }
    return property;
  });

  // Save to MongoDB (avoid duplicates by URL)
  for (let property of listings) {
    if (property.url) {
      await Property.updateOne(
        { url: property.url },
        { $set: { ...property, source: site.name } },
        { upsert: true }
      );
    }
  }

  console.log(`✅ ${listings.length} listings processed from ${site.name}`);
  await page.close();
  await browser.close();
}

// ================= Runner =================
const scrapeAllProperties = async (req, res) => {
  try {
    await Promise.all(sites.map((site) => limit(() => scrapeSite(site))));
    console.log("🏠 Property scraping completed successfully");
    if (res) res.json({ message: "Scraping completed successfully" });
  } catch (error) {
    console.error("Scraping failed:", error);
    if (res) res.status(500).json({ error: "Scraping failed" });
  }
};

module.exports = scrapeAllProperties;
