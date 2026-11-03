import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "content" / "news.json"
ENDPOINT = "https://gnews.io/api/v4/top-headlines"


def https_url(value):
    if not isinstance(value, str) or not value.startswith("https://"):
        return ""
    return value


def main():
    api_key = os.environ.get("GNEWS_API_KEY", "").strip()
    if not api_key:
        print("GNEWS_API_KEY is not configured; keeping the current news brief.")
        return 0

    params = urlencode({
        "category": "general",
        "lang": "en",
        "country": "in",
        "max": "10",
        "apikey": api_key,
    })
    request = Request(f"{ENDPOINT}?{params}", headers={"Accept": "application/json", "User-Agent": "MarginJournal/1.0"})
    try:
        with urlopen(request, timeout=20) as response:
            payload = json.load(response)
    except HTTPError as error:
        print(f"GNews returned HTTP {error.code}; the existing brief was left unchanged.")
        return 1
    except (URLError, TimeoutError, json.JSONDecodeError) as error:
        print(f"GNews could not be reached ({type(error).__name__}); the existing brief was left unchanged.")
        return 1

    articles = []
    for item in payload.get("articles", []):
        source = item.get("source") or {}
        title = str(item.get("title") or "").strip()
        url = https_url(item.get("url"))
        if not title or not url:
            continue
        articles.append({
            "title": title[:240],
            "description": str(item.get("description") or "").strip()[:420],
            "url": url,
            "image": https_url(item.get("image")),
            "publishedAt": str(item.get("publishedAt") or ""),
            "source": str(source.get("name") or "Original publisher")[:100],
        })

    result = {
        "provider": "GNews",
        "country": "in",
        "language": "en",
        "updatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "articles": articles[:10],
    }
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Saved {len(articles[:10])} India headlines to content/news.json.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
