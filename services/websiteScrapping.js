const puppeteer = require("puppeteer");
const axios = require("axios");
const puppeteerExtra = require("puppeteer-extra");
const stealthPlugin = require("puppeteer-extra-plugin-stealth");


async function isWebsiteAvailable(url) {
  try {
    const response = await axios.get(url, { timeout: 10000 });
    return response.status === 200;
  } catch (error) {
    console.error(`Website not available: ${url}`);
    return false;
  }
}

async function scrapeData(url) {
  puppeteerExtra.use(stealthPlugin());
  // const browserPath = getLocalBrowserPath();

  // Launch Puppeteer with fallback for hosted environments
  const browser = await puppeteerExtra.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });

  let about = "";
  let logoUrl = "";
  let email = "";
  let socialLinks = {
    youtube: "",
    instagram: "",
    facebook: "",
    linkedin: "",
  };

  // Check if website is available, if not skip the scraping process
  if (!(await isWebsiteAvailable(url))) {
    console.log(`Skipping website: ${url}`);
    await browser.close();
    return {};
  }

  try {
    const page = await browser.newPage();
    await safeNavigate(page, url, 90000); // Custom timeout of 90 seconds
    page.setDefaultTimeout(60000);

    await page.waitForSelector("body", { timeout: 60000 });

    // Scroll the page to load dynamic content
    await scrollPage(page);

    const header = await page.$("header");
    if (header) {
      logoUrl = await getLogoUrl(header);
      email = await getEmail(page);
      socialLinks = await getSocialLinks(page);
    }
    console.log("email before", email);
    console.log("socialLinks before", socialLinks);
    // Scroll the page to load dynamic content
    await scrollPage(page);
    if (!email || Object.values(socialLinks).some((link) => link === "")) {
      const footer = await page.$("footer");
      if (footer) {
        email = await getEmail(page);
        socialLinks = await getSocialLinks(page);
      }
    }
    console.log("email after", email);
    console.log("socialLinks after", socialLinks);
    // Check the Contact Us page, skip scraping if not available
    const contactUsUrl = constructContactUrl(url);
    console.log("Checking Contact Us page:", contactUsUrl);
    if (!(await isWebsiteAvailable(contactUsUrl))) {
      console.log("Skipping Contact Us page:", contactUsUrl);
    } else {
      // Scroll the page to load dynamic content
      await scrollPage(page);
      await safeNavigate(page, contactUsUrl, 90000);
      if (!email) {
        email = await getEmail(page);
      }
      if (Object.values(socialLinks).some((link) => link === "")) {
        socialLinks = await getSocialLinks(page);
      }
      console.log("email after contact", email);
      console.log("socialLinks after contact", socialLinks);
    }

    // Check the About Us page, skip scraping if not available
    const aboutUsUrl = constructAboutUsUrl(url);
    console.log("Checking About Us page:", aboutUsUrl);
    if (!(await isWebsiteAvailable(aboutUsUrl))) {
      console.log("Skipping About Us page:", aboutUsUrl);
    } else {
      // Scroll the page to load dynamic content
      await scrollPage(page);
      await safeNavigate(page, aboutUsUrl, 90000);
      if (!email) {
        email = await getEmail(page);
      }
      if (Object.values(socialLinks).some((link) => link === "")) {
        socialLinks = await getSocialLinks(page);
      }
      about = await getAbout(page);
      console.log("email after about", email);
      console.log("socialLinks after about", socialLinks);
    }
    console.log("email final", email);
    console.log("socialLinks final", socialLinks);
  } catch (error) {
    console.error("Error during scraping:", error);
  } finally {
    await browser.close();
  }

  return { logoUrl, email, socialLinks, about };
}

// Extract logo URL
async function getLogoUrl(header) {
  try {
    const logoSelector =
      'img[src*="logo"], .logo img, [class*="logo"] img, link[rel*="icon"], svg';

    const logoElement = await header.$(logoSelector);

    if (!logoElement) {
      return ""; // Return empty string if no logo found
    }

    // Handle the case for img elements
    const src = await logoElement.getProperty("src");
    if (src) {
      return await src.jsonValue(); // Extract the src value for image
    }

    // Handle the case for link rel="icon" elements
    const href = await logoElement.getProperty("href");
    if (href) {
      return await href.jsonValue(); // Extract the href value for icon
    }

    // Handle the case for SVG (if applicable)
    const svg = await logoElement.evaluate((el) => {
      if (el.tagName.toLowerCase() === "svg") {
        return el.outerHTML; // If it's an SVG, return its HTML content
      }
      return "";
    });
    if (svg) {
      return svg; // If it's an SVG, return the SVG markup (or handle it accordingly)
    }

    return ""; // Return empty if no logo found
  } catch (error) {
    console.error("Error extracting logo URL:", error);
    return "";
  }
}

async function getEmail(page) {
  try {
    return await page.evaluate(() => {
      const emailsFound = new Set();
      const textContent = document.body.innerText;

      // 1. Standard email regex
      const standardEmails = textContent.match(
        /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
      );
      if (standardEmails) standardEmails.forEach((e) => emailsFound.add(e));

      // 2. mailto: links
      document.querySelectorAll("a[href^='mailto:']").forEach((a) => {
        const email = a
          .getAttribute("href")
          .replace("mailto:", "")
          .split("?")[0];
        emailsFound.add(email);
      });

      // 3. Obfuscated forms
      const obfuscatedPatterns = [
        /\b([a-zA-Z0-9._%+-]+)\s?\[at\]\s?([a-zA-Z0-9.-]+)\s?\[dot\]\s?([a-zA-Z]{2,})\b/gi,
        /\b([a-zA-Z0-9._%+-]+)\s?\(at\)\s?([a-zA-Z0-9.-]+)\s?\(dot\)\s?([a-zA-Z]{2,})\b/gi,
      ];
      obfuscatedPatterns.forEach((regex) => {
        let match;
        while ((match = regex.exec(textContent)) !== null) {
          emailsFound.add(`${match[1]}@${match[2]}.${match[3]}`);
        }
      });

      // 4. HTML entity-encoded emails
      const decodedHTML = document.documentElement.innerHTML.replace(
        /&#(\d+);/g,
        (_, code) => String.fromCharCode(code)
      );
      const htmlEmails = decodedHTML.match(
        /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
      );
      if (htmlEmails) htmlEmails.forEach((e) => emailsFound.add(e));
      console.log("All emails found.......>", emailsFound);
      return Array.from(emailsFound)[0];
    });
  } catch (error) {
    console.error("Error getting email:", error);
    return "";
  }
}

// Extract About Us content
async function getAbout(page) {
  try {
    return await page.evaluate(() => {
      const aboutTexts = [];

      // 1. Check obvious "about" sections by class or id
      document
        .querySelectorAll('[class*="about"], [id*="about"]')
        .forEach((el) => {
          if (el.innerText.trim().length > 30)
            aboutTexts.push(el.innerText.trim());
        });

      // 2. Look for headings that contain "About" or similar
      const headingKeywords = ["about", "who we are", "our story", "company"];
      document.querySelectorAll("h1, h2, h3, h4, h5").forEach((h) => {
        const text = h.innerText.toLowerCase();
        if (headingKeywords.some((k) => text.includes(k))) {
          let sectionText = h.parentElement.innerText.trim();
          if (sectionText.length > 30) aboutTexts.push(sectionText);
        }
      });

      // 3. Search in meta description if no visible section
      if (aboutTexts.length === 0) {
        const metaDesc = document.querySelector('meta[name="description"]');
        if (metaDesc?.content) aboutTexts.push(metaDesc.content.trim());
      }

      // 4. Search in JSON-LD structured data
      document
        .querySelectorAll('script[type="application/ld+json"]')
        .forEach((script) => {
          try {
            const data = JSON.parse(script.innerText);
            if (data.description) aboutTexts.push(data.description.trim());
          } catch {}
        });
      console.log("all about texts.........>", aboutTexts);
      // 5. Deduplicate and return
      return Array.from(new Set(aboutTexts))[0];
    });
  } catch {
    return "";
  }
}

async function getSocialLinks(page) {
  try {
    const socialPatterns = {
      facebook: ["facebook.com", "fb.com", "m.facebook.com", "fb.me"],
      instagram: ["instagram.com", "instagr.am"],
      linkedin: ["linkedin.com", "linkedin.cn"],
      youtube: ["youtube.com", "youtu.be"],
      // twitter: ["twitter.com", "x.com"],
      // pinterest: ["pinterest.com", "pin.it"],
      // tiktok: ["tiktok.com"],
    };

    // Selector for all anchors
    const allLinks = await page.$$eval("a[href]", (anchors) =>
      anchors.map((a) => a.href.trim()).filter(Boolean)
    );

    // Try to also extract from meta and JSON-LD if links missing
    const metaLinks = await page.$$eval(
      'meta[property*="og:"], meta[name*="twitter:"], script[type="application/ld+json"]',
      (metas) => metas.map((m) => m.content || m.innerText).filter(Boolean)
    );

    const combinedLinks = [...new Set([...allLinks, ...metaLinks])];

    // Prepare result
    let socialLinks = {
      facebook: "",
      instagram: "",
      linkedin: "",
      youtube: "",
      // twitter: "",
      // pinterest: "",
      // tiktok: ""
    };

    // Match each platform
    for (const link of combinedLinks) {
      for (const [platform, patterns] of Object.entries(socialPatterns)) {
        if (
          !socialLinks[platform] &&
          patterns.some((pattern) => link.toLowerCase().includes(pattern))
        ) {
          socialLinks[platform] = link;
        }
      }
    }

    console.log("All social links.........>", socialLinks);
    return socialLinks;
  } catch (err) {
    console.error("Error getting social links:", err);
    return {
      facebook: "",
      instagram: "",
      linkedin: "",
      youtube: "",
      // twitter: "",
      // pinterest: "",
      // tiktok: ""
    };
  }
}

function constructContactUrl(baseUrl) {
  const paths = [
    "/contact-us",
    "/contact",
    "/contacts",
    "/contactus",
    "/contact-us.html",
  ];
  return `${baseUrl}${paths[0]}`; // Choose only the first constructed URL
}

function constructAboutUsUrl(baseUrl) {
  const paths = [
    "/about-us",
    "/about",
    "/abouts",
    "/aboutus",
    "/about-us.html",
  ];
  return `${baseUrl}${paths[0]}`;
}

async function safeNavigate(page, url, timeout) {
  try {
    // Navigate with custom timeout to avoid hanging forever
    await page.goto(url, { waitUntil: "networkidle2", timeout });
  } catch (error) {
    console.error(`Navigation error at ${url}:`, error);
    throw new Error(`Failed to navigate to ${url} within ${timeout}ms`);
  }
}

async function scrollPage(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      let distance = 1000;

      const scroll = () => {
        let scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight < scrollHeight) {
          setTimeout(scroll, 200);
        } else {
          resolve();
        }
      };
      scroll();
    });
  });
}

module.exports = { scrapeData };
