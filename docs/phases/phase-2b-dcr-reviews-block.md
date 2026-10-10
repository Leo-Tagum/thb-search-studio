# Developer Change Request: reviews block shows a typed review count

**For:** Gian · **From:** Leo / Search Studio (Phase 2b blog audit) · **Date:** 2026-10-10 · **Status:** REQUESTED (nothing has been changed; the Studio never edits WordPress)

## What is wrong
The same hand-written HTML "reviews" section (`<section id="thb-reviews-god-mode">`, classes `thb-*`) is pasted into **60 blog posts**. It contains:
- a button typed as **"See All 115 Reviews"** (links to /reviews/);
- a line **"⭐ 92% excellent rating"** (in 58 of the posts);
- a hand-typed row of stars (`<div class="thb-star-row">★★★★★</div>`) and four typed customer quotes headed "What our clients say" / "Real people. Real results.".

**Why it matters (permanent rule, Leo 2026-10-10):** the site's rating badge is a live Google widget. No page may show a star rating, score or review count typed into the content, because typed numbers go stale and can contradict the widget. The count "115" and "92%" are typed, not live.

## What we need
One fix in one place, not 60 post edits:
1. Find where this block comes from. It sits inside the post content, so it was probably pasted per post or inserted from a shared snippet/shortcode/Elementor template. We did not look in WP admin, so please confirm.
2. Replace the typed count and score with the live Google reviews widget, or reword the button to "See all reviews" and remove the "92% excellent rating" line, whichever Leo prefers.
3. If the block really is pasted into each post, move it into a single reusable block/shortcode first, then change it once.

Also check (outside the blog posts): whether the same block appears on pages (the audit only covered the 122 posts; the 230 pages were not fetched).

## Acceptance
- No page content contains "See All 115 Reviews", "115 Reviews" or "92% excellent rating" typed as text.
- The rating shown comes from the live Google widget.
- Spot check: three of the posts below render the same section, correctly styled, on desktop and mobile.

## Evidence
Found by comparing the stored text of all 122 blog posts (REST API, fetched 2026-10-10): this text appears in 8+ posts, so the audit treats it as site-wide template text and does not blame each post. The 16-month audit run is `2026-10-10`.

### Affected posts (60)
- https://www.twinhomebuyer.com/bay-area-title-issues-and-liens/
- https://www.twinhomebuyer.com/inherited-house-squatters-california/
- https://www.twinhomebuyer.com/foundation-problems-in-older-bay-area-homes-repair-costs-financing-impact-and-selling-as-is/
- https://www.twinhomebuyer.com/sewer-lateral-compliance-east-bay-home-sale/
- https://www.twinhomebuyer.com/inherited-a-house-with-a-mortgage-bay-area/
- https://www.twinhomebuyer.com/tired-landlord-bay-area-when-to-sell/
- https://www.twinhomebuyer.com/what-can-delay-as-is-home-sale-bay-area/
- https://www.twinhomebuyer.com/selling-house-with-judgment-lien-bay-area/
- https://www.twinhomebuyer.com/daly-city-converted-garage-sell-house/
- https://www.twinhomebuyer.com/inherited-property-bay-area-legal-authority-to-sell/
- https://www.twinhomebuyer.com/helping-an-aging-parent-sell-a-bay-area-home/
- https://www.twinhomebuyer.com/sell-bay-area-house-full-of-belongings/
- https://www.twinhomebuyer.com/can-i-stay-in-my-house-after-selling/
- https://www.twinhomebuyer.com/tax-implications-selling-bay-area-home-2026/
- https://www.twinhomebuyer.com/best-time-to-sell-bay-area-home-2026/
- https://www.twinhomebuyer.com/sell-house-now-or-wait-2026/
- https://www.twinhomebuyer.com/what-happens-after-accepting-cash-offer/
- https://www.twinhomebuyer.com/empty-nest-in-the-bay-area/
- https://www.twinhomebuyer.com/downsizing-your-bay-area-home/
- https://www.twinhomebuyer.com/selling-bay-area-home-during-divorce/
- https://www.twinhomebuyer.com/sell-luxury-home-bay-area-2026/
- https://www.twinhomebuyer.com/relocating-from-the-bay-area/
- https://www.twinhomebuyer.com/probate-sales-california-2026/
- https://www.twinhomebuyer.com/hidden-costs-selling-home-bay-area-2026/
- https://www.twinhomebuyer.com/how-to-choose-cash-home-buyer-bay-area/
- https://www.twinhomebuyer.com/top-reasons-bay-area-homeowners-selling-fast-2026/
- https://www.twinhomebuyer.com/sell-inherited-house-bay-area/
- https://www.twinhomebuyer.com/contractor-license-bay-area-cash-offers/
- https://www.twinhomebuyer.com/myths-about-cash-home-buyers-bay-area/
- https://www.twinhomebuyer.com/how-to-sell-your-house-fast-for-cash-bay-area-2026/
- https://www.twinhomebuyer.com/mid-march-2026-bay-area-housing-update/
- https://www.twinhomebuyer.com/early-march-2026-bay-area-housing-update/
- https://www.twinhomebuyer.com/can-cash-buyer-close-title-problems/
- https://www.twinhomebuyer.com/spring-2026-bay-area-market-update/
- https://www.twinhomebuyer.com/sell-fixer-upper-as-is-bay-area-2026/
- https://www.twinhomebuyer.com/licensed-cash-home-buyer-bay-area/
- https://www.twinhomebuyer.com/oakland-housing-market-history/
- https://www.twinhomebuyer.com/oakland-code-violations-2026/
- https://www.twinhomebuyer.com/sell-bay-area-home-fast/
- https://www.twinhomebuyer.com/sell-house-as-is-bay-area-ca/
- https://www.twinhomebuyer.com/sell-rental-property-with-tenants-bay-area/
- https://www.twinhomebuyer.com/bay-area-real-estate-market-update-february-2026/
- https://www.twinhomebuyer.com/bay-area-spring-real-estate-2026/
- https://www.twinhomebuyer.com/sell-house-title-issues-bay-area/
- https://www.twinhomebuyer.com/sell-house-as-is-bay-area/
- https://www.twinhomebuyer.com/cash-home-buyers-backing-out/
- https://www.twinhomebuyer.com/home-sale-falls-through-bay-area/
- https://www.twinhomebuyer.com/sell-my-house-as-is-bay-area/
- https://www.twinhomebuyer.com/sell-your-house-fast-bay-area/
- https://www.twinhomebuyer.com/sell-your-house-fast-in-san-jose-real-stories-results/
- https://www.twinhomebuyer.com/who-are-the-cash-buyers-in-the-bay-area/
- https://www.twinhomebuyer.com/power-of-gratitude-and-learning/
- https://www.twinhomebuyer.com/4-things-you-should-know-about-selling-your-house-to-a-direct-buyer-in-the-bay-area/
- https://www.twinhomebuyer.com/administrator-vs-executor-selling-inherited-house/
- https://www.twinhomebuyer.com/alameda-county-probate-court-process-for-selling/
- https://www.twinhomebuyer.com/bay-area-cash-home-buyer-guide/
- https://www.twinhomebuyer.com/bay-area-home-auctions-to-today/
- https://www.twinhomebuyer.com/bay-area-home-seller-regrets-2026/
- https://www.twinhomebuyer.com/bay-area-real-estate-update-rates-drop-oakland-burlingame/
- https://www.twinhomebuyer.com/bay-area-selling-a-parents-home-aging-in-place/
