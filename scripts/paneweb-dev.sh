#!/usr/bin/env bash
# paneweb starts the demo with this. The board opens it at this machine's tailnet name through an https proxy
# to 127.0.0.1, so that one name is passed to the server; the demo's own code never runs a process.
DEMO_HOST="$(tailscale status --json 2>/dev/null | jq -r '.Self.DNSName // empty' | sed 's/\.$//')" exec bun run dev
