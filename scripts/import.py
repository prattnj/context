#!/usr/bin/env python3
"""Import SMS Backup & Restore XML exports into the `context` MySQL database.

Streams the (potentially multi-GB) XML files, so memory use stays flat.
Idempotent: every message/call carries a dedupe hash with a UNIQUE index,
so re-running only inserts new entries. MMS attachments are decoded from
base64 and written to MEDIA_DIR as <sha1>.<ext> (content-addressed, so
duplicates collapse and files are never rewritten).

Source XML files are opened strictly read-only and never modified.

Usage:
    python scripts/import.py [--sms PATH] [--calls PATH]

Defaults: ./data/smsdata.xml and ./data/calldata.xml
Connection settings come from environment variables (or a .env file in the
project root): DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME.
"""

import argparse
import base64
import hashlib
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from xml.etree.ElementTree import iterparse
from zoneinfo import ZoneInfo

import pymysql

PROJECT_ROOT = Path(__file__).resolve().parent.parent
LOCAL_TZ = ZoneInfo("America/Denver")

# Your own numbers, used to exclude "me" from group participant lists.
OWN_NUMBERS = {"4807653078", "6238009276"}

EXT_BY_TYPE = {
    "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png",
    "image/gif": "gif", "image/bmp": "bmp", "image/webp": "webp",
    "image/heic": "heic", "video/mp4": "mp4", "video/3gpp": "3gp",
    "audio/amr": "amr", "audio/mpeg": "mp3", "audio/mp4": "m4a",
    "audio/ogg": "ogg", "text/x-vcard": "vcf", "text/vcard": "vcf",
    "application/pdf": "pdf",
}
SKIP_PART_TYPES = {"application/smil", "text/plain"}


def load_dotenv(path: Path) -> None:
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def connect():
    return pymysql.connect(
        host=os.environ.get("DB_HOST", "127.0.0.1"),
        port=int(os.environ.get("DB_PORT", "3306")),
        user=os.environ.get("DB_USER", "context"),
        password=os.environ.get("DB_PASSWORD", ""),
        database=os.environ.get("DB_NAME", "context"),
        charset="utf8mb4",
        autocommit=False,
    )


def normalize_number(raw: str) -> str:
    """Reduce a phone number to a canonical comparable form."""
    if not raw:
        return ""
    raw = raw.strip()
    if "@" in raw:  # email-style MMS address
        return raw.lower()
    digits = re.sub(r"[^\d]", "", raw)
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    return digits or raw


def sha1(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8", "replace")).hexdigest()


def local_buckets(date_ms: int):
    dt = datetime.fromtimestamp(date_ms / 1000, tz=timezone.utc).astimezone(LOCAL_TZ)
    return dt.date().isoformat(), dt.strftime("%Y-%m"), dt.hour


def nz(value):
    """Treat the literal string 'null' (as written by SMS B&R) as None."""
    return None if value is None or value == "null" else value


def clamp(text: str, limit: int) -> str:
    """Keep values inside column size limits."""
    return text if len(text) <= limit else text[:limit]


class Importer:
    def __init__(self, conn, media_dir: Path):
        self.conn = conn
        self.media_dir = media_dir
        self.conv_cache: dict[str, int] = {}
        self.stats = {"sms_new": 0, "mms_new": 0, "skipped": 0,
                      "calls_new": 0, "calls_skipped": 0, "media_files": 0}

    # -- conversations ------------------------------------------------------

    def conversation_id(self, address_key: str, display_name: str, is_group: bool) -> int:
        display_name = clamp(display_name, 1024)
        # Very large groups can exceed the address_key column; fall back to a hash.
        if len(address_key) > 512:
            address_key = "group:" + sha1(address_key)
        cached = self.conv_cache.get(address_key)
        with self.conn.cursor() as cur:
            if cached is None:
                cur.execute(
                    "INSERT INTO conversations (address_key, display_name, is_group) "
                    "VALUES (%s, %s, %s) "
                    "ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)",
                    (address_key, display_name, int(is_group)),
                )
                cached = cur.lastrowid
                self.conv_cache[address_key] = cached
            if display_name and display_name != "(Unknown)":
                cur.execute(
                    "UPDATE conversations SET display_name = %s "
                    "WHERE id = %s AND display_name <> %s",
                    (display_name, cached, display_name),
                )
        return cached

    # -- messages -----------------------------------------------------------

    def insert_message(self, conv_id, kind, direction, sender_address,
                       contact_name, body, date_ms, has_media, dedupe):
        """Insert a message; return new row id, or None if it already existed."""
        local_date, local_month, local_hour = local_buckets(date_ms)
        with self.conn.cursor() as cur:
            cur.execute(
                "INSERT IGNORE INTO messages "
                "(conversation_id, kind, direction, sender_address, contact_name, "
                " body, char_count, date_ms, local_date, local_month, local_hour, "
                " has_media, dedupe_hash) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                (conv_id, kind, direction, sender_address, clamp(contact_name or "", 1024),
                 body, len(body or ""), date_ms, local_date, local_month,
                 local_hour, int(has_media), dedupe),
            )
            return cur.lastrowid if cur.rowcount == 1 else None

    def handle_sms(self, el):
        addr = normalize_number(el.get("address") or "")
        date_ms = int(el.get("date") or 0)
        msg_type = el.get("type")  # 1 received, 2 sent
        if msg_type not in ("1", "2") or not date_ms:
            return
        body = nz(el.get("body")) or ""
        contact = nz(el.get("contact_name")) or ""
        dedupe = sha1(f"sms|{date_ms}|{addr}|{msg_type}|{body}")
        conv_id = self.conversation_id(addr, contact, False)
        row_id = self.insert_message(
            conv_id, "sms", "received" if msg_type == "1" else "sent",
            None, contact, body, date_ms, False, dedupe)
        if row_id:
            self.stats["sms_new"] += 1
        else:
            self.stats["skipped"] += 1

    def handle_mms(self, el):
        date_ms = int(el.get("date") or 0)
        msg_box = el.get("msg_box")  # 1 received, 2 sent
        if msg_box not in ("1", "2") or not date_ms:
            return
        contact = nz(el.get("contact_name")) or ""

        participants, sender = [], None
        addrs = el.find("addrs")
        if addrs is not None:
            for a in addrs.findall("addr"):
                num = normalize_number(a.get("address") or "")
                if not num:
                    continue
                if a.get("type") == "137":  # FROM
                    sender = num
                if num not in OWN_NUMBERS and num not in participants:
                    participants.append(num)
        if not participants:
            participants = [normalize_number(el.get("address") or "")]
        is_group = len(participants) > 1
        address_key = ",".join(sorted(participants))

        texts, media_parts = [], []
        parts = el.find("parts")
        if parts is not None:
            for p in parts.findall("part"):
                ct = (p.get("ct") or "").lower()
                if ct == "text/plain":
                    t = nz(p.get("text"))
                    if t:
                        texts.append(t)
                elif ct not in SKIP_PART_TYPES and nz(p.get("data")):
                    media_parts.append(p)

        body = "\n".join(texts)
        media_sig = ",".join(
            sha1((p.get("data") or "")[:512]) for p in media_parts)
        dedupe = sha1(f"mms|{date_ms}|{address_key}|{msg_box}|{body}|{media_sig}")

        conv_id = self.conversation_id(address_key, contact, is_group)
        sender_address = sender if is_group and msg_box == "1" else None
        row_id = self.insert_message(
            conv_id, "mms", "received" if msg_box == "1" else "sent",
            sender_address, contact, body, date_ms, bool(media_parts), dedupe)
        if row_id is None:
            self.stats["skipped"] += 1
            return
        self.stats["mms_new"] += 1

        for seq, p in enumerate(media_parts):
            self.save_media(row_id, seq, p)

    def save_media(self, message_id: int, seq: int, part):
        ct = (part.get("ct") or "application/octet-stream").lower()
        try:
            blob = base64.b64decode(part.get("data"), validate=False)
        except Exception:
            return
        digest = hashlib.sha1(blob).hexdigest()
        ext = EXT_BY_TYPE.get(ct) or (ct.split("/")[-1][:8] or "bin")
        rel_path = f"{digest[:2]}/{digest}.{ext}"
        out = self.media_dir / rel_path
        if not out.exists():
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_bytes(blob)
            self.stats["media_files"] += 1
        name = nz(part.get("name")) or nz(part.get("cl"))
        with self.conn.cursor() as cur:
            cur.execute(
                "INSERT INTO media (message_id, seq, content_type, original_name, "
                "file_path, byte_size, sha1) VALUES (%s,%s,%s,%s,%s,%s,%s)",
                (message_id, seq, ct, name, rel_path, len(blob), digest),
            )

    # -- calls --------------------------------------------------------------

    def handle_call(self, el):
        number = normalize_number(el.get("number") or "")
        date_ms = int(el.get("date") or 0)
        if not date_ms:
            return
        call_type = int(el.get("type") or 0)
        duration = int(el.get("duration") or 0)
        contact = nz(el.get("contact_name")) or ""
        dedupe = sha1(f"call|{date_ms}|{number}|{call_type}|{duration}")
        local_date, local_month, local_hour = local_buckets(date_ms)
        with self.conn.cursor() as cur:
            cur.execute(
                "INSERT IGNORE INTO calls (number, contact_name, call_type, "
                "duration_s, date_ms, local_date, local_month, local_hour, "
                "dedupe_hash) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                (number, contact, call_type, duration, date_ms,
                 local_date, local_month, local_hour, dedupe),
            )
            if cur.rowcount == 1:
                self.stats["calls_new"] += 1
            else:
                self.stats["calls_skipped"] += 1


def stream(path: Path, importer: Importer, tags: dict, label: str):
    if not path.is_file():
        print(f"  {label}: {path} not found, skipping")
        return
    print(f"  {label}: {path}")
    count = 0
    # Open read-only; iterparse streams so the full file never loads at once.
    with open(path, "rb") as fh:
        for event, el in iterparse(fh, events=("end",)):
            handler = tags.get(el.tag)
            if handler is not None:
                handler(el)
                count += 1
                if count % 2000 == 0:
                    importer.conn.commit()
                    print(f"    ...{count} records processed", flush=True)
                el.clear()  # release memory (base64 payloads are large)
    importer.conn.commit()
    print(f"    {count} records processed")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sms", default=str(PROJECT_ROOT / "data" / "smsdata.xml"))
    parser.add_argument("--calls", default=str(PROJECT_ROOT / "data" / "calldata.xml"))
    parser.add_argument("--media-dir", default=str(PROJECT_ROOT / "data" / "media"))
    args = parser.parse_args()

    load_dotenv(PROJECT_ROOT / ".env")
    media_dir = Path(args.media_dir)
    media_dir.mkdir(parents=True, exist_ok=True)

    conn = connect()
    importer = Importer(conn, media_dir)
    try:
        print("Importing...")
        stream(Path(args.sms), importer,
               {"sms": importer.handle_sms, "mms": importer.handle_mms}, "messages")
        stream(Path(args.calls), importer,
               {"call": importer.handle_call}, "calls")
    finally:
        conn.commit()
        conn.close()

    s = importer.stats
    print(f"\nDone. SMS added: {s['sms_new']}, MMS added: {s['mms_new']}, "
          f"messages already present: {s['skipped']}")
    print(f"Calls added: {s['calls_new']}, already present: {s['calls_skipped']}")
    print(f"Media files written: {s['media_files']}")


if __name__ == "__main__":
    main()
