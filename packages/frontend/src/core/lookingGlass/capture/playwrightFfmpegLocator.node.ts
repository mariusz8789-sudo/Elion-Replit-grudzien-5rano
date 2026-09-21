import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

/** Node-only locator for Playwright's already-installed stripped ffmpeg fallback. */
export function locatePlaywrightBundledFfmpeg(): string | null {
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers'].filter((v): v is string => Boolean(v));
  for (const root of roots) {
    if (!existsSync(root)) continue;
    let entries: string[];
    try { entries = readdirSync(root); } catch { continue; }
    const ffmpegDir = entries.find((entry) => /^ffmpeg-\d+$/.test(entry));
    if (!ffmpegDir) continue;
    const dir = path.join(root, ffmpegDir);
    for (const name of ['ffmpeg-linux', 'ffmpeg-mac', 'ffmpeg-mac-arm64', 'ffmpeg-win64.exe', 'ffmpeg-win32.exe']) {
      const candidate = path.join(dir, name);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}
