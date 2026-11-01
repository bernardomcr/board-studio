import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
const windowsChrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const bundledBrowser=process.env.PLAYWRIGHT_BUNDLED_BROWSER==='true';
export default defineConfig({
  testDir:'./tests', fullyParallel:false, workers:1, timeout:30000,
  use:{baseURL:'http://127.0.0.1:5174',viewport:{width:1600,height:1000},headless:true,
    launchOptions:{...(bundledBrowser?{}:process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:existsSync(windowsChrome)?{executablePath:windowsChrome}:{}),args:['--enable-unsafe-swiftshader']},
    screenshot:'only-on-failure',trace:'retain-on-failure'},
  webServer:{command:'npm run dev -- --host 127.0.0.1 --port 5174 --strictPort',url:'http://127.0.0.1:5174',reuseExistingServer:!process.env.CI},
});
