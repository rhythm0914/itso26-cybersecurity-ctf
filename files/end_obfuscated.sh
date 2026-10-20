#!/bin/bash
# health_check.sh - started by cron every 5 minutes
# Segments are Base64 encoded and stored reversed. Reverse each segment
# and join segment A with segment B.

SEG_A='Y3N1ZmJvZWR7RlRD'
SEG_B='fTczMzFfZW1fZXRh'

A=$(printf '%s' "$SEG_A" | base64 -d)
B=$(printf '%s' "$SEG_B" | base64 -d)
echo "segment A: $A"
echo "segment B: $B"
