const cheerio = require("cheerio");
const puppeteerExtra = require("puppeteer-extra");
const stealthPlugin = require("puppeteer-extra-plugin-stealth");
const Lead = require("../models/Lead");
const { scrapeData } = require("./websiteScrapping");
const Project = require("../models/Project");
const pLimit = require("p-limit");

puppeteerExtra.use(stealthPlugin());

async function searchGoogleMaps(project, io) {
  const { _id: projectId } = project;
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
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });
    console.log("Browser launched");

    const page = await browser.newPage();
    const query = `${businessCategory} ${city}`;
    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(
      query
    )}`;
    console.log(`Navigating: ${searchUrl}`);

    await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 60000 });

    // Scroll feed

    for (let i = 0; i < 20; i++) {
      if (await isCancelled()) {
        console.log(`Project ${projectId} cancelled during scroll...`);
        return;
      }
      while (await isPaused()) {
        console.log(`Project ${projectId} paused during scroll...`);
        await new Promise((res) => setTimeout(res, 2000));
      }

      await page.evaluate(() => {
        const wrapper = document.querySelector('div[role="feed"]');
        if (wrapper) {
          wrapper.scrollBy(0, 1000);
        }
      });

      await new Promise((res) => setTimeout(res, 1500));
    }

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
    for (let i = 0; i < parents.length; i++) {
      if (await isCancelled()) {
        console.log(`Project ${projectId} cancelled. Stopping scraping.`);
        await browser.close();
        return;
      }

      while (await isPaused()) {
        console.log(`Project ${projectId} paused... waiting`);
        await new Promise((res) => setTimeout(res, 2000)); // check every 2s
      }
      const parent = parents[i];
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
    }

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

            const lead = new Lead(enriched);
            await lead.save();
            console.log(
              `lead saved... ${index + 1}/${businesses.length} ${
                lead.storeName
              }`
            );

            if (io) {
              console.log(`emitting lead...`);
              io.to(vendorId).emit("lead", lead);
              // Count total leads in DB
              const totalLeads = await Lead.countDocuments({
                projectId: _id,
                vendorId,
              });
              io.to(vendorId).emit("total_lead", totalLeads);
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
  } catch (err) {
    console.error("Error in searchGoogleMaps:", err);
    throw err;
  }
}

module.exports = { searchGoogleMaps };
