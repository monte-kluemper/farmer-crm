import * as cheerio from "cheerio";

export type ScrapeSources = {
    homepage: string | null;
    menu: string | null;
    about: string | null;
    contact: string | null;
    listing: string | null; // optional external snippet if you have it; left null here
    jsonld: string | null;  // JSON-LD concatenated (raw)
    resolved_urls: {
        homepage: string | null;
        menu: string | null;
        about: string | null;
        contact: string | null;
    };
};

const USER_AGENT =
    "Mozilla/5.0 (compatible; RestaurantLeadBot/1.0; +https://example.com/bot)";

function absolutize(base: string, pathOrUrl: string) {
    try {
        return new URL(pathOrUrl, base).toString();
    } catch {
        return null;
    }
}

async function fetchHtml(url: string, timeoutMs = 12000): Promise<string | null> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);

    try {
        const res = await fetch(url, {
            method: "GET",
            headers: { "User-Agent": USER_AGENT, "Accept": "text/html,*/*" },
            redirect: "follow",
            signal: ctrl.signal,
        });

        if (!res.ok) return null;
        const ct = res.headers.get("content-type") || "";
        if (!ct.includes("text/html")) return null;

        return await res.text();
    } catch {
        return null;
    } finally {
        clearTimeout(t);
    }
}

function htmlToText(html: string): string {
    const $ = cheerio.load(html);

    // remove noisy nodes
    $("script, style, noscript, svg, canvas, iframe").remove();

    const text = $("body").text();
    return text
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 16000); // cap to keep prompts sane
}

function extractJsonLd(html: string): string | null {
    const $ = cheerio.load(html);
    const blocks: string[] = [];
    $('script[type="application/ld+json"]').each((_, el) => {
        const t = $(el).text().trim();
        if (t) blocks.push(t);
    });
    if (blocks.length === 0) return null;
    // cap total size
    return blocks.join("\n\n").slice(0, 12000);
}

function findBestLink(html: string, baseUrl: string, keywords: string[]): string | null {
    const $ = cheerio.load(html);
    const candidates: string[] = [];

    $("a[href]").each((_, el) => {
        const href = ($(el).attr("href") || "").trim();
        const label = ($(el).text() || "").trim().toLowerCase();
        if (!href) return;

        const hay = `${href} ${label}`.toLowerCase();
        if (keywords.some((k) => hay.includes(k))) {
            const abs = absolutize(baseUrl, href);
            if (abs) candidates.push(abs);
        }
    });

    // Prefer same-domain links and non-social links
    const uniq = Array.from(new Set(candidates)).filter(
        (u) => !u.includes("facebook.com") && !u.includes("instagram.com") && !u.includes("tiktok.com")
    );

    return uniq[0] ?? null;
}

async function bestEffortFetchPage(baseUrl: string, html: string, type: "menu" | "about" | "contact") {
    const hints: Record<typeof type, { keywords: string[]; paths: string[] }> = {
        menu: {
            keywords: ["menu", "carta", "carta-", "menú", "menus", "platos", "comida"],
            paths: ["/menu", "/carta", "/carta/", "/menus", "/menú"],
        },
        about: {
            keywords: ["about", "nosotros", "equipo", "team", "historia", "filosof", "chef"],
            paths: ["/about", "/about-us", "/nosotros", "/equipo", "/team", "/historia"],
        },
        contact: {
            keywords: ["contact", "contacto", "reservas", "reservation", "book", "ubicacion", "location"],
            paths: ["/contact", "/contacto", "/reservas", "/reservation", "/book", "/ubicacion", "/location"],
        },
    };

    // 1) Try to find link in homepage HTML
    const linked = findBestLink(html, baseUrl, hints[type].keywords);
    if (linked) {
        const linkedHtml = await fetchHtml(linked);
        if (linkedHtml) return { url: linked, text: htmlToText(linkedHtml) };
    }

    // 2) Try common paths
    for (const p of hints[type].paths) {
        const u = absolutize(baseUrl, p);
        if (!u) continue;
        const pHtml = await fetchHtml(u);
        if (pHtml) return { url: u, text: htmlToText(pHtml) };
    }

    return { url: null, text: null };
}

export async function scrapeRestaurantSources(website_url: string): Promise<ScrapeSources> {
    const homepageHtml = await fetchHtml(website_url);
    if (!homepageHtml) {
        return {
            homepage: null,
            menu: null,
            about: null,
            contact: null,
            listing: null,
            jsonld: null,
            resolved_urls: { homepage: website_url, menu: null, about: null, contact: null },
        };
    }

    const homepageText = htmlToText(homepageHtml);
    const jsonld = extractJsonLd(homepageHtml);

    const [menu, about, contact] = await Promise.all([
        bestEffortFetchPage(website_url, homepageHtml, "menu"),
        bestEffortFetchPage(website_url, homepageHtml, "about"),
        bestEffortFetchPage(website_url, homepageHtml, "contact"),
    ]);

    return {
        homepage: homepageText || null,
        menu: menu.text,
        about: about.text,
        contact: contact.text,
        listing: null,
        jsonld,
        resolved_urls: {
            homepage: website_url,
            menu: menu.url,
            about: about.url,
            contact: contact.url,
        },
    };
}
