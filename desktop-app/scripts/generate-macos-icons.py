import os
import subprocess
import sys

try:
    from PIL import Image
except ImportError:
    print("Install Pillow: pip install pillow")
    sys.exit(1)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICON_SET = os.path.join(ROOT, "macos", "Runner", "Assets.xcassets", "AppIcon.appiconset")
TEMPLATE = os.path.join(os.path.dirname(__file__), "icon-template.html")
TMP_1024 = "/tmp/lume-app-icon-1024.png"

# Puppeteer screenshot (reuse cloud env setup)
subprocess.run(
    [
        "node",
        "-e",
        """
const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1024, height: 1024, deviceScaleFactor: 1 });
  await page.goto('file://' + process.argv[1]);
  await page.screenshot({ path: process.argv[2] });
  await browser.close();
})();
        """,
        TEMPLATE,
        TMP_1024,
    ],
    cwd="/tmp/pptr",
    check=True,
)

img = Image.open(TMP_1024).convert("RGBA")

sizes = {
    "app_icon_16.png": 16,
    "app_icon_32.png": 32,
    "app_icon_64.png": 64,
    "app_icon_128.png": 128,
    "app_icon_256.png": 256,
    "app_icon_512.png": 512,
    "app_icon_1024.png": 1024,
}

os.makedirs(ICON_SET, exist_ok=True)
for name, size in sizes.items():
    out = os.path.join(ICON_SET, name)
    resized = img.resize((size, size), Image.Resampling.LANCZOS)
    resized.save(out, "PNG")
    print(f"Wrote {out} ({size}x{size})")

print("Done.")
