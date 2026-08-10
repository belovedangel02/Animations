// Renders the tribute to a video file.
//
// The animation is driven frame by frame rather than played and recorded: the
// page exposes `renderFrame(t, i)`, this asks for one exact timestamp at a
// time, and each finished frame is piped straight into ffmpeg. Nothing depends
// on how fast the machine happens to be, so the output is identical every run.
//
//   node tools/render.mjs --duration 60 --out out/nala-60s.mp4
//   node tools/render.mjs --audio my-way.m4a --out out/nala-tribute.mp4
//
// Passing --audio matches the render length to the track, so the picture ends
// with the music. See README.md on supplying the song.

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Find a Chromium to drive.
 *
 * Playwright expects the exact build its own version pins, and refuses to start
 * if the browser directory holds a different one. Environments that ship a
 * pre-installed Chromium are usually a build or two behind, so rather than
 * downloading a second copy, look for whatever is actually on disk and use it.
 * Returns undefined when nothing is found, letting Playwright fall back to its
 * own lookup and produce its own (clearer) error.
 */
function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!base || !existsSync(base)) return undefined;
  const candidates = [];
  for (const dir of readdirSync(base)) {
    if (!dir.startsWith('chromium')) continue;
    for (const rel of [
      'chrome-linux/chrome',
      'chrome-linux/headless_shell',
      'chrome-headless-shell-linux64/chrome-headless-shell',
    ]) {
      const file = join(base, dir, rel);
      if (existsSync(file)) candidates.push(file);
    }
  }
  // Prefer full Chromium over the headless shell: the shell has repeatedly
  // lagged on canvas features, and this render leans on ctx.filter.
  return candidates.sort((a, b) => Number(b.includes('/chrome')) - Number(a.includes('/chrome')))[0];
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else { out[key] = next; i++; }
  }
  return out;
}

/** ES modules will not load from file:// under Chromium's CORS rules. */
function serve(root) {
  return new Promise((ok) => {
    const server = createServer((req, res) => {
      const path = decodeURIComponent(req.url.split('?')[0]);
      const file = join(root, path === '/' ? '/index.html' : path);
      if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
        res.writeHead(404).end('not found');
        return;
      }
      res.writeHead(200, {
        'content-type': MIME[extname(file)] ?? 'application/octet-stream',
        'cache-control': 'no-store',
      });
      createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => ok({ server, port: server.address().port }));
  });
}

function run(cmd, args) {
  return new Promise((ok, fail) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    p.on('error', fail);
    p.on('close', (code) => (code === 0 ? ok(out.trim()) : fail(new Error(out.trim()))));
  });
}

/** Length of an audio file in seconds, via ffprobe. */
async function audioDuration(file) {
  const out = await run('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1', file,
  ]);
  const seconds = Number(out);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(`could not read a duration from ${file}`);
  }
  return seconds;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const width = Number(args.width ?? 1080);
  const height = Number(args.height ?? 1920);
  const fps = Number(args.fps ?? 30);
  const quality = Number(args.quality ?? 94);
  const out = resolve(ROOT, args.out ?? 'out/nala-tribute.mp4');

  const audio = args.audio ? resolve(ROOT, String(args.audio)) : null;
  if (audio && !existsSync(audio)) throw new Error(`no such audio file: ${audio}`);

  // The song sets the length when one is given, so the picture lands with it.
  let duration = Number(args.duration ?? 0);
  if (!duration && audio) duration = await audioDuration(audio);
  if (!duration) duration = 275;

  const totalFrames = Math.max(1, Math.round(duration * fps));
  mkdirSync(dirname(out), { recursive: true });

  console.log(
    `rendering ${totalFrames} frames — ${width}x${height}, ${fps}fps, ` +
    `${duration.toFixed(1)}s${audio ? ` (matched to ${args.audio})` : ''}`,
  );

  const { server, port } = await serve(ROOT);
  const browser = await chromium.launch({
    executablePath: findChromium(),
    args: ['--force-color-profile=srgb', '--disable-lcd-text'],
  });

  try {
    const page = await browser.newPage({
      viewport: { width, height },
      deviceScaleFactor: 1,
    });
    page.on('pageerror', (e) => { throw e; });

    const url = `http://127.0.0.1:${port}/index.html?render=1` +
                `&w=${width}&h=${height}&duration=${duration}`;
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction('window.tributeReady === true', null, { timeout: 60_000 });

    const ffmpegArgs = [
      '-y', '-v', 'error',
      // The input codec is stated rather than probed. Left to guess, ffmpeg
      // mis-splits the concatenated JPEGs on frame boundaries every so often
      // and encodes the garbage, which shows up later as corrupt NAL units in
      // an otherwise complete-looking file.
      '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(fps), '-i', '-',
    ];
    if (audio) ffmpegArgs.push('-i', audio);
    ffmpegArgs.push(
      '-map', '0:v:0',
      ...(audio ? ['-map', '1:a:0', '-c:a', 'aac', '-b:a', '256k', '-shortest'] : []),
      '-c:v', 'libx264',
      '-preset', 'slow',
      '-crf', '17',
      '-pix_fmt', 'yuv420p',
      // Wide, slow gradients band badly at 8 bit; a touch of dither hides it.
      '-vf', 'format=yuv420p',
      '-movflags', '+faststart',
      out,
    );

    const ff = spawn('ffmpeg', ffmpegArgs, { stdio: ['pipe', 'inherit', 'inherit'] });
    const ffDone = new Promise((ok, fail) => {
      ff.on('error', fail);
      ff.on('close', (code) => (code === 0 ? ok() : fail(new Error(`ffmpeg exited ${code}`))));
    });

    const started = Date.now();
    for (let i = 0; i < totalFrames; i++) {
      await page.evaluate(([t, n]) => window.renderFrame(t, n), [i / fps, i]);
      const shot = await page.screenshot({ type: 'jpeg', quality });

      if (!ff.stdin.write(shot)) {
        await new Promise((ok) => ff.stdin.once('drain', ok));
      }

      if (i % 60 === 0 || i === totalFrames - 1) {
        const done = i + 1;
        const rate = done / ((Date.now() - started) / 1000);
        const left = (totalFrames - done) / Math.max(rate, 0.001);
        process.stdout.write(
          `\r  ${done}/${totalFrames} frames  ${rate.toFixed(1)} fps  ` +
          `~${Math.ceil(left / 60)}m left   `,
        );
      }
    }
    process.stdout.write('\n');

    ff.stdin.end();
    await ffDone;
    console.log(`wrote ${out}`);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
