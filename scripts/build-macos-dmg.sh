#!/usr/bin/env bash
# Build Lume-mac.dmg from flutter macos release output.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$ROOT/desktop-app"
PRODUCT_NAME="${PRODUCT_NAME:-Lume}"
BUILD_DIR="$APP_DIR/build/macos/Build/Products/Release"
APP_PATH="$BUILD_DIR/${PRODUCT_NAME}.app"
OUT_DIR="$APP_DIR/build/dist"
DMG_NAME="${DMG_NAME:-Lume-mac.dmg}"
DMG_PATH="$OUT_DIR/$DMG_NAME"

if [[ ! -d "$APP_PATH" ]]; then
  echo "Missing app bundle: $APP_PATH"
  echo "Run: cd desktop-app && flutter build macos --release"
  exit 1
fi

mkdir -p "$OUT_DIR"
STAGE="$OUT_DIR/dmg-stage"
rm -rf "$STAGE"
mkdir -p "$STAGE"
ditto "$APP_PATH" "$STAGE/${PRODUCT_NAME}.app"

rm -f "$DMG_PATH"
hdiutil create \
  -volname "Lume" \
  -srcfolder "$STAGE" \
  -ov \
  -format UDZO \
  "$DMG_PATH"

rm -rf "$STAGE"
echo "Created $DMG_PATH"
ls -lh "$DMG_PATH"
