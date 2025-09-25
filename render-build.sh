#!/usr/bin/env bash
set -e

# ติดตั้ง library ที่จำเป็นสำหรับ node-canvas
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y \
  libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev

# ติดตั้ง dependencies ของโปรเจกต์
npm install

