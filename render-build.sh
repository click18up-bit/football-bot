#!/usr/bin/env bash
set -o errexit

# ติดตั้ง dependencies ที่ canvas ต้องใช้
if [ -f Aptfile ]; then
  apt-get update
  apt-get install -y --no-install-recommends $(cat Aptfile)
fi

# ติดตั้ง Node modules
npm install
#!/usr/bin/env bash
set -e

# ติดตั้ง library ที่จำเป็นสำหรับ node-canvas
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y \
  libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev

# ติดตั้ง dependencies ของโปรเจกต์
npm install

