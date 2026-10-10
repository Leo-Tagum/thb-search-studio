// Fixed `<style>` block copied verbatim from the live thb-article pattern (stored post /selling-an-older-home-in-san-francisco-repairs-options/, 2026-10-10).
// Never agent-written. A test asserts its hash, so any change is deliberate.
export const STYLE_BLOCK = String.raw`<style>
.thb-article{
 --thb-navy:#081b35;--thb-orange:#f47b32;--thb-orange-text:#c2410c;
 --thb-cream:#f7f3ee;--thb-gray:#5b6474;--thb-light:#f4f6f8;--thb-text:#182230;--thb-border:#e5e7eb;
 box-sizing:border-box;width:100%;margin:0 auto;padding:0 20px;
 font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
 font-size:18px;line-height:1.7;color:var(--thb-text);
}
.thb-article *,.thb-article *::before,.thb-article *::after{box-sizing:border-box}
.thb-article p{margin:0 0 18px}
.thb-article h2{font-family:inherit;font-size:30px;line-height:1.25;font-weight:700;letter-spacing:-.3px;color:var(--thb-navy);margin:52px 0 16px}
.thb-article h3{font-family:inherit;font-size:21px;line-height:1.35;font-weight:700;color:var(--thb-navy);margin:30px 0 8px}
.thb-article h3 + p{margin-top:0}
.thb-article strong{font-weight:700;color:var(--thb-navy)}
.thb-article a{color:var(--thb-orange-text);text-decoration:underline;text-underline-offset:3px;font-weight:600}
.thb-article a:hover{color:var(--thb-navy)}
.thb-article ul{margin:0 0 22px;padding-left:24px;list-style:disc}
.thb-article li{margin:0 0 10px;padding-left:4px}
.thb-article li::marker{color:var(--thb-orange)}
.thb-article .thb-callout{background:var(--thb-cream);border-left:5px solid var(--thb-orange);border-radius:0 14px 14px 0;padding:22px 26px;margin:20px 0 24px}
.thb-article .thb-callout p{margin:0}
.thb-article .thb-note{font-size:16px;color:var(--thb-gray);background:var(--thb-light);border-radius:10px;padding:14px 18px}
.thb-article .thb-table-wrap{overflow-x:auto;margin:24px 0 30px;border:1px solid var(--thb-border);border-radius:14px}
.thb-article table{width:100%;border-collapse:collapse;min-width:640px;margin:0;font-size:16px}
.thb-article th,.thb-article td{border-bottom:1px solid var(--thb-border);border-right:1px solid var(--thb-border);padding:14px 16px;text-align:left;vertical-align:top;line-height:1.55}
.thb-article th:last-child,.thb-article td:last-child{border-right:0}
.thb-article tbody tr:last-child td{border-bottom:0}
.thb-article th{background:var(--thb-navy);color:#fff;font-weight:700}
.thb-article tbody tr:nth-child(even) td{background:#fafafa}
.thb-article .thb-cta{text-align:center;margin:36px 0 20px}
.thb-article a.thb-button{display:inline-block;background:var(--thb-orange);color:var(--thb-navy);padding:16px 34px;border-radius:30px;font-weight:700;font-size:17px;text-decoration:none}
.thb-article a.thb-button:hover{background:var(--thb-navy);color:#fff}
.thb-article a:focus-visible{outline:3px solid var(--thb-navy);outline-offset:3px;border-radius:4px}
@media(max-width:767px){
 .thb-article{font-size:17px;padding:0 16px}
 .thb-article h2{font-size:25px;margin-top:40px}
 .thb-article h3{font-size:19px}
 .thb-article .thb-callout{padding:18px 20px}
}

.thb-article .thb-questions{counter-reset:q;list-style:none;padding-left:0}
.thb-article .thb-questions li{counter-increment:q;position:relative;padding-left:44px;margin-bottom:16px}
.thb-article .thb-questions li::before{content:counter(q);position:absolute;left:0;top:2px;width:30px;height:30px;border-radius:50%;background:var(--thb-navy);color:#fff;font-weight:700;font-size:15px;display:flex;align-items:center;justify-content:center}
.thb-article .thb-author{border:1px solid var(--thb-border);border-radius:14px;padding:24px 26px;margin:40px 0}
.thb-article .thb-author h2{margin-top:0;font-size:24px}
.thb-article .thb-sources{font-size:16px}
.thb-article .thb-sources li{margin-bottom:8px}
.thb-article .thb-cta-box{background:var(--thb-cream);border-radius:16px;padding:30px 28px;margin:44px 0 20px}
.thb-article .thb-cta-box h2{margin-top:0}
.thb-article .thb-secondary{display:block;margin-top:16px;font-size:16px}
.thb-article .thb-meta{font-size:15px;color:var(--thb-gray);margin:0 0 22px}
.thb-article .thb-meta strong{color:var(--thb-text)}
.thb-article .thb-callout ul{margin:12px 0 14px}
.thb-article .thb-callout p + p{margin-top:12px}
.thb-article .thb-hood p{margin:0 0 8px}
.thb-article .thb-hood{margin-bottom:22px}
.thb-article .thb-image-slot{border:2px dashed #c2410c;background:#fff7ef;border-radius:14px;padding:28px 24px;margin:26px 0 30px;text-align:center}
.thb-article .thb-image-slot p{margin:0 0 6px;font-size:15px;color:var(--thb-gray)}
.thb-article .thb-image-slot p.thb-slot-title{font-size:18px;font-weight:700;color:var(--thb-orange-text);letter-spacing:.5px}
.thb-article figure.thb-figure{margin:26px 0 30px}
.thb-article figure.thb-figure img{width:100%;height:auto;display:block;border-radius:14px}
</style>`;
export const STYLE_BLOCK_SHA256 = "e5b4a44fcf5277eb1420efbd188efa5fd8e05bb4837cf66b524b25bec669b33e";
