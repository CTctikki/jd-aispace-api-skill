import base64
import hashlib
import json
import sqlite3
import sys
from pathlib import Path

import win32crypt
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def decrypt_master_key(user_data_dir: Path) -> bytes:
    local_state = json.loads((user_data_dir / "Local State").read_text(encoding="utf-8"))
    encrypted_key = base64.b64decode(local_state["os_crypt"]["encrypted_key"])
    if not encrypted_key.startswith(b"DPAPI"):
        raise RuntimeError("Unsupported Chrome encryption key format")
    return win32crypt.CryptUnprotectData(encrypted_key[5:], None, None, None, 0)[1]


def decrypt_cookie(host: str, encrypted_value: bytes, key: bytes) -> str:
    if encrypted_value.startswith((b"v10", b"v11")):
        plaintext = AESGCM(key).decrypt(encrypted_value[3:15], encrypted_value[15:], None)
        host_digest = hashlib.sha256(host.encode("utf-8")).digest()
        if plaintext.startswith(host_digest):
            plaintext = plaintext[len(host_digest):]
    else:
        plaintext = win32crypt.CryptUnprotectData(encrypted_value, None, None, None, 0)[1]
    return plaintext.decode("utf-8")


def domain_matches(host: str, cookie_domain: str) -> bool:
    normalized = cookie_domain.lstrip(".").lower()
    return host == normalized or host.endswith(f".{normalized}")


def load_cookie_header(user_data_dir: Path, profile_name: str, host: str) -> str:
    key = decrypt_master_key(user_data_dir)
    cookie_db = user_data_dir / profile_name / "Network" / "Cookies"
    uri = f"file:{cookie_db.as_posix()}?mode=ro"
    connection = sqlite3.connect(uri, uri=True)
    rows = connection.execute(
        "select host_key,path,name,encrypted_value,is_secure from cookies order by length(path) desc"
    ).fetchall()
    cookies = []
    for cookie_host, path, name, encrypted_value, is_secure in rows:
        if not domain_matches(host, cookie_host):
            continue
        if not "/api".startswith(path or "/"):
            continue
        if is_secure not in (0, 1):
            continue
        try:
            value = decrypt_cookie(cookie_host, encrypted_value, key)
        except Exception:
            continue
        cookies.append(f"{name}={value}")
    if not cookies:
        raise RuntimeError("No matching JD cookies found")
    return "; ".join(cookies)


def main() -> None:
    if len(sys.argv) not in (2, 3, 4):
        raise SystemExit("Usage: chrome_cookie_header.py <user-data-dir> [profile-name] [host]")
    user_data_dir = Path(sys.argv[1]).resolve()
    profile_name = sys.argv[2] if len(sys.argv) >= 3 else "Default"
    host = sys.argv[3] if len(sys.argv) == 4 else "sff.jd.com"
    sys.stdout.write(load_cookie_header(user_data_dir, profile_name, host))


if __name__ == "__main__":
    main()
