#!/usr/bin/env bash
# Check every service is up. Run this before a demo.
for p in 8000 8001 8002 8003 8004 8005; do
  printf "port %s: " "$p"
  curl -fsS --max-time 3 "http://localhost:$p/health" || echo "DOWN"
  echo
done
