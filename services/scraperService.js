const cheerio = require("cheerio");
const puppeteerExtra = require("puppeteer-extra");
const stealthPlugin = require("puppeteer-extra-plugin-stealth");
const Lead = require("../models/Lead");
const { scrapeData } = require("./websiteScrapping");
const Project = require("../models/Project");
const pLimit = require("p-limit");
const fs= require("fs");
puppeteerExtra.use(stealthPlugin());

async function searchGoogleMaps(project, io) {
  const {  _id:projectId } = project;
  const start = Date.now();
  const { city, businessCategory, vendorId } = project;
  const limit = pLimit(3); // concurrency limit

  const isCancelled = async () => {
    const p = await Project.findById(projectId);
    return p?.cancelRequested;
  };

  const isPaused = async () => {
    const p = await Project.findById(projectId);
    return p?.pauseRequested;
  };

  try {
    const browser = await puppeteerExtra.launch({
      headless: "new",
      ignoreHTTPSErrors: true,
executablePath: "/usr/bin/google-chrome-stable", // make sure chrome is installed
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });
    console.log("Browser launched");

    console.log("city and category", city, businessCategory);
    const page = await browser.newPage();
    const htmltest = await page.content();
if (htmltest.includes("recaptcha") || htmltest.includes("Our systems have detected unusual traffic")) {
  console.log("🚨 CAPTCHA detected!");
}
    await page.setUserAgent(
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0 Safari/537.36"
);
await page.setViewport({ width: 1366, height: 768 });
    const query = `${businessCategory} ${city}`;
    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(
      query
    )}?hl=en&gl=us`;
    console.log(`Navigating: ${searchUrl}`);

    await page.goto(searchUrl, {
      waitUntil: ["domcontentloaded", "load"],
      timeout: 60000,
    });

    // Handle Google consent screen
try {
    //await page.waitForSelector('button', { timeout: 10000 });

  const accepted = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button'))
      .find(el => el.textContent.trim().toLowerCase() === 'accept all');
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  });

  if (accepted) {
    console.log('✅ Accepted cookies page');
    await new Promise(res => setTimeout(res, 2000)); // short wait after click
  } else {
    console.log('No Accept all button found');
  }
} catch (err) {
  console.log('No consent screen detected');
}

    // Scroll feed
    // for (let i = 0; i < 20; i++) {
      if (await isCancelled()) {
        console.log(`Project ${projectId} cancelled during scroll...`);
        return;
      }
      while (await isPaused()) {
        console.log(`Project ${projectId} paused during scroll...`);
        await new Promise((res) => setTimeout(res, 2000));
      }

      // await page.evaluate(() => {
      //   const wrapper = document.querySelector('div[role="feed"]');
      //   if (wrapper) {
      //     wrapper.scrollBy(0, 1000);
      //   }
      // });
      async function detectPageType(page) {
  if (await page.$('div[role="feed"]')) {
    return "search_results";
  }
  if (await page.$('h1.DUwDvf')) {
    return "single_place";
  }
  if (await page.$('div[aria-label="Directions"]')) {
    return "directions";
  }
  return "unknown";
}

// Usage
//       const html = await page.content();
// fs.writeFileSync('debug-after-wait.html', html);
      const timestamp = Date.now();
await page.screenshot({
  path: `/var/www/html/snapshots/snapshot-${timestamp}.png`,
  fullPage: true
});
console.log(`Screenshot saved: http://164.68.122.98/snapshots/snapshot-${timestamp}.png`);
const pageType = await detectPageType(page);
console.log("Page type:", pageType);
    
      let oldHeight = 0;

while (true) {
  const newHeight = await page.evaluate(async () => {
    window.scrollBy(0, window.innerHeight);
          await new Promise((res) => setTimeout(res, 1500));

    return document.body.scrollHeight;
  });
 console.log(oldHeight,newHeight)
  if (newHeight === oldHeight) break; // 👉 stop when no more content
  oldHeight = newHeight;

  await page.waitForTimeout(1000);
}


    // }
await page.screenshot({
  path: `/var/www/html/snapshots/snapshot-${timestamp}.png`,
  fullPage: true
});
    console.log(`Screenshot saved: http://164.68.122.98/snapshots/snapshot-${timestamp}.png`);

    const html = await page.content();
    await browser.close();
    console.log("Browser closed");

    const $ = cheerio.load(html);
    const parents = [];
    $("a").each((i, el) => {
      const href = $(el).attr("href");
      if (href && href.includes("/maps/place/")) {
        parents.push($(el).parent());
      }
    });

    console.log("Number of businesses found:", parents.length);

    const businesses = [];
    await Promise.all(
      parents.map((parent) =>
        limit(async () => {
          if (await isCancelled()) {
            console.log(`Project ${projectId} cancelled. Stopping scraping.`);
            await browser.close();
            return;
          }

          while (await isPaused()) {
            console.log(`Project ${projectId} paused... waiting`);
            await new Promise((res) => setTimeout(res, 2000)); // check every 2s
          }
          // const parent = parents[i];
          const url = parent.find("a").attr("href");
          const website = parent.find('a[data-value="Website"]').attr("href");
          const storeName = parent.find("div.fontHeadlineSmall").text();
          const ratingText = parent
            .find("span.fontBodyMedium > span")
            .attr("aria-label");

          const bodyDiv = parent.find("div.fontBodyMedium").first();
          const children = bodyDiv.children();
          const firstOfLast = children.last().children().first();
          const lastOfLast = children.last().children().last();
          const imageUrl = parent.find("img").attr("src");

          businesses.push({
            placeId: url?.includes("ChI")
              ? `ChI${url.split("ChI")[1]?.split("?")[0]}`
              : null,
            address: firstOfLast?.text() || "",
            category: firstOfLast?.text()?.split("·")[0]?.trim() || "",
            projectCategory: businessCategory,
            phone: lastOfLast?.text()?.split("·")[1]?.trim() || "",
            city: city,
            googleUrl: url || "",
            bizWebsite: website || "",
            storeName: storeName || "",
            ratingText: ratingText || "",
            imageUrl: imageUrl || "",
            vendorId,
            stars: ratingText?.includes("stars")
              ? Number(ratingText.split("stars")[0].trim())
              : null,
            numberOfReviews: (() => {
              const reviewsText = ratingText
                ?.split("stars")[1]
                ?.replace("Reviews", "")
                ?.trim();
              return reviewsText && !isNaN(Number(reviewsText))
                ? Number(reviewsText)
                : 0;
            })(),
          });
        })
      )
    );

    await browser.close();
    console.log(`Found ${businesses.length} businesses`);

    // Process each business with concurrency
    await Promise.all(
      businesses.map((biz, index) =>
        limit(async () => {
          if (await isCancelled()) {
            console.log(`Project ${projectId} cancelled during enrichment.`);
            return;
          }

          while (await isPaused()) {
            console.log(`Project ${projectId} paused during enrichment...`);
            await new Promise((res) => setTimeout(res, 2000));
          }

          try {
            // const exists = await Lead.exists({
            //   placeId: biz.placeId,
            //   vendorId,
            // });
            // if (exists) return;

            let enriched = { ...biz };

            if (biz.bizWebsite) {
              console.log(`bizz website......: ${biz.bizWebsite}`);
              const siteData = await scrapeData(biz.bizWebsite);
              enriched = {
                ...enriched,
                about: siteData.about || "",
                logoUrl: siteData.logoUrl || "",
                email: siteData.email || "",
                socialLinks: siteData.socialLinks || {},
              };
            }

            const lead = await Lead.insertMany(enriched, { ordered: false });

            console.log(
              `lead saved... ${index + 1}/${businesses.length} ${
                lead.storeName
              }`
            );

            if (io) {
              console.log(`emitting lead...`);
              io.to(vendorId).emit("lead", lead);
              // Emit to specific lead watchers
              io.to(`lead_${lead.projectCategory}`).emit("lead_details", lead);
              // Count total leads in DB
              const totalLeads = await Lead.countDocuments({
                projectId: projectId,
                vendorId,
              });
              io.to(vendorId).emit("total_lead", totalLeads);

              // for specific category lead
              // if (lead.projectCategory === businessCategory) {
              //   io.to(vendorId).emit("category_lead", lead);
              // }
            }
            console.log(
              `[${index + 1}/${businesses.length}] Saved lead: ${
                lead.storeName
              }`
            );
          } catch (err) {
            console.error(`Error processing ${biz.storeName}:`, err.message);
          }
        })
      )
    );
    console.log(`Time taken: ${Math.floor((Date.now() - start) / 1000)}s`);
    return businesses;
  } catch (err) {
    console.error("Error in searchGoogleMaps:", err);
    throw err;
  }
}

module.exports = { searchGoogleMaps };
































