# Phase 3e: getting official law text without printing by hand, and what we may store (research only)

Date: 2026-10-13. Research only: nothing was built, downloaded in bulk, stored or changed. Three things are kept apart throughout: **A. automated-access terms**, **B. download permissions**, **C. storage rights**. Anything not read from a primary page is marked **UNVERIFIED**. What I could and could not open myself: `leginfo.legislature.ca.gov` and `codelibrary.amlegal.com` returned HTTP 403 to every automated fetch (plain `curl` and the fetch tool, no disguise, not retried or worked around); `law.cityofsanmateo.org`, `downloads.leginfo.legislature.ca.gov`, `github.com`, `library.municode.com` (page shell only) and `civicplus.com` could be read.

## 1. The four hosts

### 1.1 California Legislature: leginfo.legislature.ca.gov
- **A. Automated access.** Its `robots.txt` and its terms page could not be read (403). **UNVERIFIED.** A legal-tech blog says California's robots.txt asks for 10 seconds between requests ([Vaquill](https://www.vaquill.ai/blog/scraping-state-legislature-websites-what-breaks)); secondary, not relied on. The Assembly's conditions-of-use notice ([assembly.ca.gov](https://assembly.ca.gov/privacy-and-conditions-use-policy), dated 2011-03-07) is silent on bots and scraping, and does not name leginfo.
- **B. Download permissions: an official bulk download exists.** `https://downloads.leginfo.legislature.ca.gov/` is an open directory (read today). Its readme (`pubinfo_Readme.pdf`, dated 2021-05-21, saved from that site) opens: "The leginfo data is made available to the public via: http from https://downloads.leginfo.legislature.ca.gov/". It lists tab-delimited data for the code tables, among them `LAW_SECTION_TBL.dat` (with `LAW_SECTION_TBL_1.lob` files for the text), `LAW_TOC_TBL.dat`, `LAW_TOC_SECTIONS_TBL.dat` and `CODES_TBL.dat`, loadable into MySQL. Yearly `pubinfo_<year>.zip` files, daily `pubinfo_<day>.zip` files of new records, and `pubinfo_daily_<day>.zip` (current session data "except Code tables"). Sizes today by HEAD request only: `pubinfo_2025.zip` is 1,288,568,136 bytes (modified 2026-10-12), `pubinfo_Mon.zip` 134,277 bytes (modified 2026-10-13). The zip server sends `Accept-Ranges: bytes`, so a small piece could in principle be read without the whole 1.3 GB (**UNVERIFIED** that the code tables sit in a way that allows this; not tried). The old FAQ ([leginfo.ca.gov/faq.html](https://leginfo.ca.gov/faq.html), legacy) says: "You can download the entire California codes by using the FTP process". The readme gives no terms, licence or accuracy statement.
- **C. Storage rights.** No terms on the download site. A reported statutory basis, **UNVERIFIED (secondary source)**: Government Code §10248.5 makes the information the Legislative Counsel publishes on LegInfo public domain with no state copyright ([California Globe](https://californiaglobe.com/fr/legislative-records-are-not-proprietary-to-the-state/)). The Assembly notice says "Some of the information presented on this web site may be protected by copyright" and "Permission to use that material must be obtained in advance from the California State Assembly" (that notice covers the Assembly's own material and is 2011). **To settle it from a primary source: Leo prints Government Code §§10248 and 10248.5 from leginfo** and I record them as evidence.

### 1.2 City and County of San Francisco codes: codelibrary.amlegal.com (American Legal Publishing, now ICC Code Solutions)
- **A. Automated access.** Its `robots.txt` was read: it disallows only named bots (Amazonbot, SemrushBot, MJ12bot, ltx71, The Knowledge AI, LieBaoFast, TurnitinBot, YandexBot) with `Crawl-delay: 5`; no general disallow, and no Claude or GPT agent is named. The site itself returns 403 to automated fetches. Its terms page could not be found: `amlegal.com/terms-of-use/` redirects (302) to `icccodesolutions.org/terms-of-use/`, which returns 404. The owner changed: ICC bought American Legal Publishing in 2023 ([ICC release](https://www.iccsafe.org/about/periodicals-and-newsroom/american-legal-publishing-joins-the-international-code-councils-family-of-solutions)); a 2026-07-16 release says General Code and American Legal unite as ICC Code Solutions ([General Code](https://www.generalcode.com/blog/general-code-and-american-legal-publishing-unite-as-icc-code-solutions/)). **Terms: UNVERIFIED (not found).**
- **B. Download permissions.** No official bulk download or API found. **UNVERIFIED.** Per-section PDF or print from the site is the route Leo already uses.
- **C. Storage rights.** No notice found. **UNVERIFIED.**

### 1.3 County of San Mateo (unincorporated areas): library.municode.com
- **A. Automated access.** `library.municode.com/robots.txt` returns 404 (none). Municode is a CivicPlus product. The CivicPlus terms ([civicplus.com/terms-of-use](https://www.civicplus.com/terms-of-use)) cover "the CivicPlus proprietary websites" and its software; whether they govern `library.municode.com` is **UNVERIFIED**. If they do, section 7 prohibits: "Use or launch any automated system, including without limitation, "robots," "spiders," or "offline readers,"" and automated access sending more requests than a person could with a standard browser.
- **B. Download permissions.** No official bulk download or documented API found. **UNVERIFIED.** The Municode library is a JavaScript application; its page shell shows no terms, download or print text to the fetch tool. The county also publishes ordinances as PDFs on its own site (for example `smcgov.org/media/144591/download`, an ordinance PDF found in search): a possible official alternative, **UNVERIFIED** as a complete source.
- **C. Storage rights.** If the CivicPlus terms apply: "Copy, modify, create a derivative work from, reverse engineer or reverse assemble the Site or any Solution", content "may not be copied, reproduced, modified, published, uploaded, posted", and "Mirror or frame the Site". They say nothing specific about ordinance text, which is a government record; the terms do not mention storing content in a database. Whether this applies to ordinance text: **UNVERIFIED** (a question for the County Counsel or CivicPlus).

### 1.4 City of San Mateo: law.cityofsanmateo.org (City of San Mateo Law Library, Open Law Library platform)
- **A. Automated access.** The site's footer, read today ([the code page](https://law.cityofsanmateo.org/us/ca/cities/san-mateo/code)): "Please do not scrape. Instead, bulk download the HTML or XML." Its `robots.txt` ([link](https://law.cityofsanmateo.org/robots.txt)) sets `search=yes`, `ai-train=no`, allows all agents, disallows AI and data-collection crawlers by name (Amazonbot, Applebot-Extended, Bytespider, CCBot, ClaudeBot, Google-Extended, GPTBot, meta-externalagent) from the whole site, and disallows all agents from paths beginning `/_`. So **crawling this site is not allowed and Claude's own crawler is named; the invited route is the bulk download.**
- **B. Download permissions: an official bulk download exists.** Footer: "Powered by the non-profit Open Law Library." The City publishes the code as two public GitHub repositories, [cityofsanmateo/law-html](https://github.com/cityofsanmateo/law-html) (171 commits on branch `publication/2026-04-21`) and [cityofsanmateo/law-xml](https://github.com/cityofsanmateo/law-xml) (413 commits). Both show "No description" and no README or licence file in the visible listing. The HTML repository contains a `server.exe` and `server.py`; never run it (not needed to read the files).
- **C. Storage rights.** Footer, read today: "The codes and laws on this website are in the public domain." No licence file in either repository (**UNVERIFIED** beyond that footer statement; Leo can confirm by reading the footer).

## 2. What this means for the three kinds of question

| | Automated access | Download | Storage |
|---|---|---|---|
| leginfo (state codes) | UNVERIFIED (403) | **Official bulk files exist** | UNVERIFIED primary; public domain reported (secondary) |
| amlegal (SF) | robots.txt permissive for unnamed bots; site returns 403; terms not found | none found | UNVERIFIED |
| Municode (County of San Mateo) | CivicPlus terms prohibit robots and spiders if they apply | none found | UNVERIFIED; CivicPlus terms restrict copying if they apply |
| City of San Mateo | "Please do not scrape"; Claude's crawler disallowed | **Official GitHub bulk (HTML, XML)** | "public domain" (footer) |

## 3. Options for a supervised "print assistant" (only if the terms allow it)
The terms do **not** clearly allow it for the two hosts where it would be needed:
- For **state law and the City of San Mateo** an assistant is unnecessary: official bulk downloads exist.
- For **amlegal (SF)** the terms are not found and the site refuses automated fetches (403).
- For **Municode (County of San Mateo)** the CivicPlus terms, if they apply, prohibit "automated system[s]" including "offline readers"; a scripted browser, even visible and at human pace, is an automated system under that wording.

If it were ever built it would have to: be a visible browser Leo watches and confirms at each step; use the site's own Download PDF; wait like a person; never retry, rotate or disguise to get past a 403 or a block; and put every file through the Evidence Library with jurisdiction, recheck date and the provenance note "downloaded via print assistant, confirmed by Leo". **Recommendation: do not build it** until Juan and Leo have read the amlegal and CivicPlus terms or got written permission. Cheaper routes that need no assistant: Leo's own prints (as today); for SF, ask the Clerk of the Board or the Department of Building Inspection for their official PDF of the Housing Code (**UNVERIFIED** that one exists); for the County of San Mateo, ask County Counsel or the Clerk of the Board for the official ordinance PDFs.

## 4. Navigation index: direct section links
- **Deterministic links (verified from our own stored URLs and a page fetched today):** leginfo `https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?sectionNum=<n>.&lawCode=<CODE>`; City of San Mateo `https://law.cityofsanmateo.org/us/ca/cities/san-mateo/code/<section>` (for example `.../code/7.16.040`, which loads). The index can build these from a section number.
- **Opaque links:** amlegal section URLs end in an id (for example `.../sf_building/0-0-0-537` for Housing Code §351) and Municode uses node ids. They cannot be derived from a section number. They can come only from the links inside Leo's table-of-contents print if the PDF keeps its link annotations (plain text extraction drops them; the first Housing Code reprint is the test). If the PDF has no links: Leo also saves the table-of-contents page as HTML (links preserved), or the index records chapter, number, title and the table-of-contents page URL, and the print request says "find section N by title".
- A print request then names each section by jurisdiction, code, number, title and URL; claims still come only from Leo's section prints.

## 5. Storage rights: a mode that does not keep full prints
Where a host restricts reproduction or database storage (UNVERIFIED for amlegal and Municode), a **citation-only mode** would keep, per source: the official URL, exact citation (code, section, subsection), the effective date shown, the retrieval date, the SHA-256 of the print Leo made (a fingerprint, not the file), Leo's documented verification, and, per claim, only the minimal exact quote needed (the claim's `quote_full`, at most 1200 characters; or none, if even that is not allowed). The full PDF would not be stored and its passages not kept; the verbatim check would run against the quote Leo confirmed at print time.
**Trade-offs:** V1, Agent 2 and R1 would check a claim's wording against the stored quote, not a re-readable print; verbatim proof against the full section would be Leo's, not the code's; a section re-check needs a fresh print each time.

**Current Evidence Library sources, by risk (nothing deleted or changed):**

| Source | Host | Status |
|---|---|---|
| H&S 17920.3, Civil Code 1102, Civil Code 1102.6 (3 PDFs, 9 passages) | leginfo | Likely public domain (Gov. Code 10248.5, secondary); UNVERIFIED primary. |
| SF Health Code Art. 11 table of contents (49 passages), SF Housing Code table of contents (1), SF Housing Code §351 (6) | amlegal | Terms not found: UNVERIFIED. |
| San Mateo County Ordinance Code table of contents (23 passages) | Municode | CivicPlus terms may restrict copying: UNVERIFIED. |

The full PDFs and their extracted passages are held in the private `evidence` bucket and the `evidence_passages` table (service-key access only; not published). Whether that private internal copy is restricted is the open question for Juan.

## 6. Evidence status per legal point (plan only)
States: **Indexed** (the section is in the navigation index) to **Print requested** (an agent or Leo asked for the print) to **Evidence received** (Leo uploaded it and the passages were extracted) to **Verified** (a claim with its full record exists and V1 passed it) or **Blocked** (an open `leo_reference_needed` escalation, or the claim is BROADER, WRONG or reader impact "changes").
Where: a small table `legal_points` (article, point key, jurisdiction, citation, index entry, status, print-request time, evidence source, claim, blocked reason), shown by `npm run studio -- legal-points <article>` and in a Studio panel; the existing `escalations.reference_needed` rows feed "Blocked", the Evidence Library upload feeds "Evidence received". It needs a migration (shown to Leo with its rollback first). Not built.

**Pending prints (no list exists today; the nearest are open escalations and the `unresolved` lines of agent outputs, so this is the first list):**
1. Civil Code §1102.2 (the exceptions to 1102(a)); asked by Agent 2.
2. Civil Code §1102.3; asked by Agent 2.
3. The Real Estate Transfer Disclosure Statement text, Stats. 2020 ch. 370, §25, pp. 34-38; asked by Agent 2.
4. Penal Code §829.5 (definition of a code enforcement officer, cited by H&S 17920.3(a)(12) and (16)); asked by R1.
5. Government Code §10248.5 and §10248 (the public-domain basis for storing California statute text); proposed here.
6. SF Housing Code table of contents, complete reprint (Leo is printing it).
7. SF Health Code Article 11 sections and Housing Code §351 content are uploaded; the sections the Bay Area revision will cite are chosen after the table-of-contents reprint.
8. San Mateo County Ordinance Code and City of San Mateo sections: pending which jurisdiction applies (Juan).

## 7. The GPT-made "SF Housing Code chapter index" PDF
It is **not an official source**. It is never stored as Tier 1 (or any tier that a legal claim may cite). It may be used only to compare against Leo's official table-of-contents print: a script lists chapters or sections in one and not the other, with the official print as the reference. It would not be uploaded to the Evidence Library as a source; if kept at all, it is kept outside it (a comparison file) and flagged "derived, unofficial, comparison only". The navigation index is built from the official print, never from that PDF.

## 8. Options, risks, recommendation
| Option | What it gives | Risk |
|---|---|---|
| **A. Official bulk downloads where they exist** (state law via `downloads.leginfo.legislature.ca.gov`; City of San Mateo via its GitHub repos) | Complete, current, official text for the state codes and the City of San Mateo; no 403s; no scraping | Large files (1.3 GB yearly zip; a range request or the small daily files may avoid most of it, unverified); the state data's licence is UNVERIFIED (public-domain statute reported, secondary); the San Mateo repositories have no licence file, only the footer's "public domain" |
| **B. Leo prints** (today) for amlegal and Municode | Works now; human, within normal use | Manual; slow; the stored PDFs may still be restricted (UNVERIFIED) |
| **C. Citation-only storage** for hosts that restrict reproduction | Keeps proof and links without a full copy | Weaker machine check; needs a fresh print for each re-check; schema work |
| **D. Supervised print assistant** | Less typing for Leo | Likely prohibited for CivicPlus if its terms apply; no terms found for amlegal; a visible scripted browser is still automation. Not recommended |

**Recommendation:** (1) Use the official bulk downloads for state law and, if Juan agrees, the City of San Mateo, after Leo prints Government Code §10248.5 to settle the state's public-domain basis. (2) Keep Leo's prints for SF and the County of San Mateo; treat those four sources as "terms unverified" and ask ICC Code Solutions, CivicPlus or the County Counsel for their terms in writing while Juan decides. (3) Do not build the print assistant. (4) Plan citation-only storage as the fallback if either host restricts storage. (5) Build the navigation index and the evidence-status table only after Leo and Juan decide on storage.
