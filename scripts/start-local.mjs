import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
let child;
let stopping = false;
function stop() {
  stopping = true;
  child?.kill();
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

async function install() {
  const hash = createHash('sha256').update(fs.readFileSync('package-lock.json')).digest('hex');
  const stamp = path.join('node_modules', '.qwen-local-lock');
  if (fs.existsSync('node_modules/express') && fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8') === hash) return;
  console.log('Installing dependencies (Internet required on first launch)...');
  await new Promise((resolve, reject) => {
    const npm = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ci', '--ignore-scripts'], {
      cwd: root, stdio: 'inherit', shell: process.platform === 'win32',
    });
    child = npm;
    npm.once('error', reject);
    npm.once('exit', code => code === 0 ? resolve() : reject(new Error(`npm ci failed (${code})`)));
  });
  fs.writeFileSync(stamp, hash);
}

async function freePort(preferred) {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', error => {
      if (preferred && error.code === 'EADDRINUSE') freePort(0).then(resolve, reject);
      else reject(error);
    });
    probe.listen(preferred, '127.0.0.1', () => {
      const port = probe.address().port;
      probe.close(() => resolve(port));
    });
  });
}

try {
  await install();
  if (stopping) process.exit(0);
  if (!fs.existsSync('.env')) {
    fs.writeFileSync('.env', fs.readFileSync('src/.env.example', 'utf8').replace('QWEN_API_KEY=your_dashscope_api_key_here', 'QWEN_API_KEY='), { mode: 0o600 });
  }
  const { config } = await import('../server/config.js');
  const port = await freePort(config.port);
  const url = `http://127.0.0.1:${port}/app`;
  child = spawn(process.execPath, ['server/index.js'], {
    cwd: root, env: { ...process.env, PORT: String(port) }, stdio: 'inherit',
  });
  let exited = false;
  const done = new Promise(resolve => {
    child.once('error', error => { console.error(error.message); exited = true; resolve(1); });
    child.once('exit', code => { exited = true; resolve(code ?? 0); });
  });
  let ready = false;
  for (let attempt = 0; attempt < 60 && !exited && !stopping; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1000) });
      const health = await response.json();
      if (response.ok && health.service === 'qwen-agent-lab') { ready = true; break; }
    } catch { /* Server is still starting. */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error('Server did not become ready. See the error above.');
  console.log(`\nConsole: ${url}\nKeep this window open. Press Ctrl+C to stop.\n`);
  if (!config.qwenApiKey) console.log('Qwen API key is not configured. Add it to .env and restart to enable AI responses.');
  if (!process.argv.includes('--no-open')) {
    const command = process.platform === 'win32' ? 'powershell.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    const args = process.platform === 'win32' ? ['-NoProfile', '-Command', `Start-Process '${url}'`] : [url];
    const opener = spawn(command, args, { stdio: 'ignore', detached: true });
    opener.on('error', () => console.log(`Open this URL in your browser: ${url}`));
    opener.unref();
  }
  process.exitCode = await done;
} catch (error) {
  stop();
  console.error(`Launch failed: ${error.message}`);
  process.exitCode = 1;
}
