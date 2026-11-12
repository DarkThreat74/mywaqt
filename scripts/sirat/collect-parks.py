#!/usr/bin/env python3
"""Collect public park candidates for Sirat from official park-district pages.

This is a maintainer tool, not app runtime code. It writes reviewable JSON;
it does not edit public/myapps/sirat/index.html automatically.

Install:
    python -m pip install -r scripts/sirat/requirements.txt

Run:
    python scripts/sirat/collect-parks.py --output scripts/sirat/out/parks-candidates.json
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin

from scrapling.fetchers import Fetcher

SOURCES = {
    "wheaton": {
        "name": "Wheaton Park District",
        "url": "https://wheatonparkdistrict.com/parks-a-z/",
        "default_area": "Wheaton",
    },
    "glen_ellyn": {
        "name": "Glen Ellyn Park District",
        "url": "https://gepark.org/park-directory/",
        "default_area": "Glen Ellyn",
    },
    "carol_stream": {
        "name": "Carol Stream Park District",
        "url": "https://www.csparks.org/parks-facilities/parks/",
        "default_area": "Carol Stream",
        "fetch_details": True,
    },
}

KIDS_AMENITY = re.compile(r"playground|tot play|splash|skate|nature play|swing", re.I)
PARK_AMENITY = re.compile(r"park|playground|trail|path|lake|pond|wetland|picnic|sports|field|court|garden|nature", re.I)
EXCLUDE_NAME = re.compile(r"rec(tion)? center|pool|natatorium|tennis center|boathouse|clubhouse|gym|fitness center|mini golf|skate park building|scout cabin|girl scout|boy scout|warming shelter|conservatory|football field|baseball field|softball field", re.I)
CAROL_STOP_LINE = re.compile(r"^(park info|park hours|hours|address|directions|about|contact|stay connected|don't miss out|parks & facilities|learn more)$", re.I)
CAROL_META_LINE = re.compile(r"\b\d{1,6}\s+[^;]{2,60}\b(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|way|pkwy|parkway|trl|trail|blvd|boulevard)\b|\b(?:dawn|dusk|a\.m\.|p\.m\.|am|pm)\b|\d{1,2}:\d{2}|acres?$|dcim\\|oslad|grant program|department of natural resources|illinois department|named after|received an?|history|about the park", re.I)
ADDRESS_CITY = {
    "wheaton": "Wheaton",
    "carol stream": "Carol Stream",
    "glen ellyn": "Glen Ellyn",
    "glendale heights": "Glendale Heights",
    "lisle": "Lisle",
    "warrenville": "Warrenville",
    "bloomingdale": "Bloomingdale",
    "downers grove": "Downers Grove",
    "oak brook": "Oak Brook",
    "villa park": "Villa Park",
    "clarendon hills": "Clarendon Hills",
    "elmhurst": "Elmhurst",
    "darien": "Darien",
    "woodridge": "Woodridge",
    "westmont": "Westmont",
    "hinsdale": "Hinsdale",
    "willowbrook": "Willowbrook",
    "la grange": "La Grange",
    "berwyn": "Berwyn",
    "plainfield": "Plainfield",
    "montgomery": "Montgomery",
    "wheeling": "Wheeling",
    "hinsdale": "Hinsdale",
}


def clean_text(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "park"


def normalize_address(address: str) -> str:
    address = clean_text(address)
    if address and not re.search(r"\bIL\b|Illinois", address, re.I):
        address = f"{address}, IL"
    return address


def area_from_address(address: str, default_area: str) -> str:
    lower = address.lower()
    for city, canonical in ADDRESS_CITY.items():
        if city in lower:
            return canonical
    return default_area


def coords_from_url(url: str) -> tuple[float | None, float | None]:
    # Google Maps dir URLs commonly carry !3d<lat>!4d<lng>.
    m = re.search(r"!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)", url)
    if m:
        return float(m.group(1)), float(m.group(2))
    # Some embeds carry !1d<lng>!2d<lat>.
    m = re.search(r"!1d(-?\d+\.\d+)!2d(-?\d+\.\d+)", url)
    if m:
        return float(m.group(2)), float(m.group(1))
    return None, None


def paragraph_texts(column) -> list[str]:
    return [clean_text(p.get_all_text(separator=" ", strip=True)) for p in column.css(".content-container p")]


def first_link_href(column) -> str:
    links = column.css(".content-container a")
    if links:
        return clean_text(links[0].attrib.get("href"))
    return ""


def field_value(paragraphs: list[str], prefix: str) -> str:
    for paragraph in paragraphs:
        if paragraph.lower().startswith(prefix.lower()):
            return clean_text(paragraph.split(":", 1)[1])
    return ""


def kids_and_kind(amenities: str, name: str) -> tuple[str, str]:
    text = f"{name} {amenities}"
    if KIDS_AMENITY.search(text):
        return "kids", "outdoor"
    if PARK_AMENITY.search(text):
        return "park", "outdoor"
    return "park", "outdoor"


def make_candidate(
    *,
    name: str,
    address: str,
    source_name: str,
    source_url: str,
    default_area: str,
    amenities: str = "",
    notes: str = "",
    latitude: float | None = None,
    longitude: float | None = None,
) -> dict | None:
    name = clean_text(name).strip("# ")
    address = normalize_address(address)
    lower_address = address.lower()
    has_city = any(city in lower_address for city in ADDRESS_CITY) or default_area.lower() in lower_address
    if address.endswith(", IL") and not has_city:
        address = f"{address[:-4]}, {default_area}, IL"
    if not name or len(name) < 3 or not address:
        return None
    if EXCLUDE_NAME.search(name):
        return None
    area = area_from_address(address, default_area)
    ac, io = kids_and_kind(amenities, name)
    slug = slugify(name)
    return {
        "name": name,
        "address": address,
        "area": area,
        "amenities": clean_text(amenities),
        "notes": clean_text(notes),
        "latitude": latitude,
        "longitude": longitude,
        "kids": ac == "kids",
        "source_name": source_name,
        "source_url": source_url,
        "sirat": {
            "n": name,
            "a": address,
            "la": latitude,
            "ln": longitude,
            "r": 0,
            "k": "D",
            "ac": ac,
            "io": io,
            "i": f"park-{slug}",
            "ar": area,
            "no": clean_text(notes or amenities),
        },
        "needs_review": True,
        "verified": False,
    }


def collect_wheaton() -> list[dict]:
    source = SOURCES["wheaton"]
    page = Fetcher.get(source["url"], timeout=30)
    out: list[dict] = []
    for column in page.css(".fusion-column.content-box-column"):
        heading = column.css(".content-box-heading")
        name = clean_text(heading[0].get_all_text(separator=" ", strip=True)) if heading else ""
        paragraphs = paragraph_texts(column)
        address = field_value(paragraphs, "Address")
        size = field_value(paragraphs, "Size")
        amenities = field_value(paragraphs, "Amenities")
        href = first_link_href(column)
        lat, lng = coords_from_url(href)
        notes = " ".join(part for part in [size, amenities] if part)
        candidate = make_candidate(
            name=name,
            address=address,
            source_name=source["name"],
            source_url=source["url"],
            default_area=source["default_area"],
            amenities=amenities,
            notes=notes,
            latitude=lat,
            longitude=lng,
        )
        if candidate:
            out.append(candidate)
    return out


def collect_glen_ellyn() -> list[dict]:
    source = SOURCES["glen_ellyn"]
    page = Fetcher.get(source["url"], timeout=30)
    out: list[dict] = []
    headings = page.css("h2.wp-block-heading")
    for heading in headings:
        name = clean_text(heading.get_all_text(separator=" ", strip=True))
        siblings = heading.xpath("following-sibling::*[position()<=8]")
        address = ""
        amenities_items: list[str] = []
        notes_parts: list[str] = []
        for sibling in siblings:
            tag = getattr(sibling, "tag", "") or ""
            text = clean_text(sibling.get_all_text(separator=" ", strip=True))
            if tag == "h4" and not address:
                address = text
            elif tag == "ul":
                amenities_items.extend(
                    clean_text(item.get_all_text(separator=" ", strip=True))
                    for item in sibling.css("li")
                )
            elif tag == "p" and text and "park hours" not in text.lower():
                notes_parts.append(text)
        amenities = "; ".join(item for item in amenities_items if item)
        notes = "; ".join(notes_parts[:2])
        candidate = make_candidate(
            name=name,
            address=address,
            source_name=source["name"],
            source_url=source["url"],
            default_area=source["default_area"],
            amenities=amenities,
            notes=notes,
        )
        if candidate:
            out.append(candidate)
    return out


def carol_detail_features(url: str) -> tuple[str, str]:
    try:
        page = Fetcher.get(url, timeout=30)
    except Exception:
        return "", ""
    text = page.get_all_text(separator="\n", strip=True, valid_values=True) or ""
    lines = [clean_text(line) for line in str(text).splitlines() if clean_text(line)]
    try:
        start = next(i for i, line in enumerate(lines) if line.lower() == "park features")
    except StopIteration:
        return "", ""
    features: list[str] = []
    for line in lines[start + 1 :]:
        if CAROL_STOP_LINE.match(line) or CAROL_META_LINE.search(line):
            break
        if line.startswith("Sign up"):
            continue
        features.append(line)
        if len(features) >= 20:
            break
    return "; ".join(features), ""


def collect_carol_stream(with_details: bool = True, delay: float = 0.35) -> list[dict]:
    source = SOURCES["carol_stream"]
    page = Fetcher.get(source["url"], timeout=30)
    out: list[dict] = []
    cards = page.css("a.card[href*='/parks/']")
    for card in cards:
        name_nodes = card.css("h2.title")
        teaser_nodes = card.css(".teaser")
        name = clean_text(name_nodes[0].get_all_text(separator=" ", strip=True)) if name_nodes else ""
        teaser = clean_text(teaser_nodes[0].get_all_text(separator=" ", strip=True)) if teaser_nodes else ""
        href = clean_text(card.attrib.get("href"))
        detail_url = urljoin(source["url"], href)
        address = teaser
        amenities = ""
        notes = ""
        if with_details:
            amenities, notes = carol_detail_features(detail_url)
            time.sleep(delay)
        candidate = make_candidate(
            name=name,
            address=address,
            source_name=source["name"],
            source_url=detail_url if with_details else source["url"],
            default_area=source["default_area"],
            amenities=amenities,
            notes=notes or amenities,
        )
        if candidate:
            out.append(candidate)
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", default="scripts/sirat/out/parks-candidates.json")
    parser.add_argument("--source", choices=sorted(SOURCES), action="append", help="Limit to one or more sources")
    parser.add_argument("--no-carol-details", action="store_true", help="Skip Carol Stream detail pages")
    parser.add_argument("--delay", type=float, default=0.35, help="Delay between Carol Stream detail requests")
    args = parser.parse_args()

    selected = args.source or sorted(SOURCES)
    parks: list[dict] = []
    errors: list[dict] = []
    for key in selected:
        try:
            if key == "wheaton":
                parks.extend(collect_wheaton())
            elif key == "glen_ellyn":
                parks.extend(collect_glen_ellyn())
            elif key == "carol_stream":
                parks.extend(collect_carol_stream(with_details=not args.no_carol_details, delay=args.delay))
        except Exception as exc:
            errors.append({"source": key, "error": f"{type(exc).__name__}: {exc}"})

    # Deduplicate by normalized name+address; keep the first source record.
    seen: set[tuple[str, str]] = set()
    unique: list[dict] = []
    for park in parks:
        key = (park["name"].lower(), park["address"].lower())
        if key in seen:
            continue
        seen.add(key)
        unique.append(park)

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "count": len(unique),
        "errors": errors,
        "parks": unique,
    }
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {len(unique)} candidates to {output}")
    if errors:
        print("Source errors:", file=sys.stderr)
        for error in errors:
            print(f"  {error['source']}: {error['error']}", file=sys.stderr)
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
