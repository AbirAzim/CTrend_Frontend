#!/usr/bin/env node
// Copies EAS file secrets to their required locations before the native build.
// Runs as a postinstall hook — EAS writes file secrets to disk before install.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function copySecret(envVar, dest) {
  const srcPath = process.env[envVar];
  if (!srcPath) return;
  const destPath = path.join(root, dest);
  if (!fs.existsSync(srcPath)) {
    console.warn(`[setup-secrets] ${envVar} path "${srcPath}" does not exist — skipping`);
    return;
  }
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.copyFileSync(srcPath, destPath);
  console.log(`[setup-secrets] ${envVar} → ${dest}`);
}

copySecret('GOOGLE_SERVICES_JSON', 'android/app/google-services.json');
