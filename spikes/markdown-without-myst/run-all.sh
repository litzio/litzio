#!/usr/bin/env bash
# Re-run every measurement of this spike. Usage: ./run-all.sh <scratch dir for stage 4 files>
set -e
cd "$(dirname "$0")"
TSX=../../node_modules/.bin/tsx
for p in directive external external-renamed; do $TSX src/roundtrip.ts $p > /dev/null; done
for p in directive external-renamed external; do $TSX src/fuzz.ts 10000 $p > /dev/null; done
$TSX src/generic.ts > /dev/null
$TSX src/rust-parity.ts > /dev/null
$TSX src/bench.ts 2300,5000 9 > /dev/null
$TSX src/stage4/bench.ts 9 "$1" > /dev/null
echo done
