#!/usr/bin/env bash
# Generate, build, and (optionally) test Dealy against a dynamically-chosen
# installed iPhone simulator. Requires full Xcode + XcodeGen.
set -euo pipefail
cd "$(dirname "$0")/.."

command -v xcodegen >/dev/null || { echo "Installing XcodeGen…"; brew install xcodegen; }

echo "▶︎ Generating project…"
xcodegen generate

# Pick the first available iPhone simulator.
SIM=$(xcrun simctl list devices available | grep -Eo 'iPhone [0-9][^(]*' | head -1 | sed 's/ *$//')
if [[ -z "${SIM}" ]]; then
  echo "No available iPhone simulator found. Install one via Xcode > Settings > Components."
  exit 1
fi
echo "▶︎ Using simulator: ${SIM}"

ACTION="${1:-build}"   # pass "test" to also run unit tests

xcodebuild \
  -project Dealy.xcodeproj \
  -scheme Dealy \
  -destination "platform=iOS Simulator,name=${SIM}" \
  -derivedDataPath .derivedData \
  "${ACTION}"
