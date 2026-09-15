# Google Search setup

The public website is https://hongxiang2023.github.io/refhaven/.

## Verify ownership and request indexing

1. Open [Google Search Console](https://search.google.com/search-console/).
2. Add a **URL-prefix** property with the exact URL `https://hongxiang2023.github.io/refhaven/`. A Domain property requires DNS control of the domain and is not appropriate for this GitHub Pages project address.
3. Choose **HTML tag** verification. Copy the provided `google-site-verification` meta tag into the homepage's `<head>` in `docs/index.html`, publish it, then click **Verify** in Search Console. Keep the tag after verification. The token is public verification material, not a password.
4. In **Sitemaps**, submit `https://hongxiang2023.github.io/refhaven/sitemap.xml`.
5. In **URL Inspection**, inspect the homepage, run **Test live URL**, and choose **Request indexing** if the page is eligible. Repeat for the demo if useful.
6. Check URL Inspection and the Page indexing report for the actual status and any reported exclusion reason. An empty public search result is not conclusive evidence of Google's indexing status.

The homepage and demo have descriptive titles, visible product information, and self-referencing canonical URLs. The sitemap lists only the public HTML pages; reference fixtures and private app routes are excluded. There is no need to create a project-level robots.txt: crawler rules are read from the hostname's root `/robots.txt`, not `/refhaven/robots.txt`. A missing root robots.txt does not itself prevent indexing.

The renamed project URL needs to be discovered and crawled. Google says crawling can take days to weeks; requesting indexing does not guarantee inclusion or ranking, and repeating requests does not speed it up. Keep the URL stable. Link to it from the repository homepage and any relevant profiles or posts you choose to share. Do not buy links or promise rankings.

No Search Console property has been verified or indexing request submitted by this update. Ownership verification requires the account owner's tag and Search Console access. No analytics or tracking scripts were added.

Sources: [Request recrawling](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl), [verify ownership](https://support.google.com/webmasters/answer/9008080), [submit a sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap), [canonical URLs](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls).
