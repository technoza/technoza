# Margin Journal

A static editorial blog with a GitHub-backed writing dashboard. The site runs without a build step and can be hosted on GitHub Pages.

## Publish the website

1. Use the public repository `technoza/technoza` and upload the files in this folder, keeping the folder structure intact.
2. In that repository, open **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**. The included workflow publishes updates from `main`.
3. Open the published site at `https://technoza.github.io/technoza/`.
4. Open `https://technoza.github.io/technoza/admin.html` directly to reach the writing dashboard. The public journal does not link to it.

## Create the GitHub token

Create a [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new) for `technoza/technoza` with **Contents: Read and write** permission. The dashboard checks the token’s GitHub account and only unlocks for `technoza`; it then uses the same token to read and publish journal content. The token is saved in this browser’s local storage. Keep the browser profile private; anyone with access to it can retrieve the saved token. The token is never written to the site files or committed to the repository.

## Write and publish

- In the dashboard, add a title, short intro, category, byline, date, story text, and a JPG, PNG, or WebP cover image (up to 8 MB).
- Create or remove categories in **Categories**. Categories are saved to `content/categories.json`; categories used by a story cannot be removed until that story is reassigned or removed.
- Preview the story, save an optional draft in this browser, then publish. The dashboard commits image files under `assets/blog/` and updates `content/posts.json`.
- New stories appear on the public site after GitHub Pages finishes updating. The dashboard lists, edits, and removes published stories.

## Daily news brief

- Add a repository Actions secret named `GNEWS_API_KEY` with your GNews API key. Keep it in **Settings → Secrets and variables → Actions**; do not paste it into site code.
- The `Refresh daily news brief` workflow fetches up to 10 English-language India headlines each day at 09:30 India time and publishes them with the site.
- Use **Actions → Refresh daily news brief → Run workflow** to fetch it immediately after setting the secret. GNews availability and article limits depend on your subscription.
- The public brief links readers to each original publisher and credits GNews. It does not copy full articles.

## Notes

- The 24 starter stories in `content/posts.json` are sample editorial content. Replace or remove them from the dashboard whenever you’re ready.
- Story text and image descriptions are stored in `content/posts.json`; uploaded cover files live in `assets/blog/`.
- The dashboard checks that its fine-grained GitHub token belongs to `technoza`; the public journal does not expose a dashboard link.
- Browser drafts and connection settings are device-specific. A saved GitHub token is not shared between browsers or devices.
- The dashboard page is reachable by URL, but its writing interface is gated by an authenticated GitHub account check. The blog homepage does not expose a dashboard link.
- GitHub Pages requires its source to be set to **GitHub Actions** once in repository settings. This setting cannot be changed by a repository commit alone.
- Change the display name, colours, and copy in `index.html`, `styles.css`, and `site-extra.css` to make the journal your own.
