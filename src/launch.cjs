const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const directory = path.join(process.env.LOCALAPPDATA, 'Programs', 'YandexMusic');
const executable = fs.readdirSync(directory).find(name =>
  name.endsWith('.exe') && !name.startsWith('Uninstall')
);
if (!executable) throw new Error('Yandex Music executable was not found.');

const motion = fs.readFileSync(path.join(__dirname, 'motion.webm')).toString('base64');
const source = fs.readFileSync(path.join(__dirname, 'theme.js'), 'utf8')
  .replace('__STORM_MOTION__', JSON.stringify('data:video/webm;base64,' + motion));
const background = fs.readFileSync(path.join(__dirname, 'background.jpg')).toString('base64');
const css = fs.readFileSync(path.join(__dirname, 'theme.css'), 'utf8')
  .replace('__STORM_BACKGROUND__', 'data:image/jpeg;base64,' + background);

function installTheme(script, style) {
  const electron = process.mainModule.require('electron');
  const inspector = process.getBuiltinModule('node:inspector');
  const attached = new WeakSet();
  const status = { loaded: false, error: null };
  globalThis.__stormWaveStartup = status;
  const failsafe = setTimeout(() => inspector.close(), 25000);
  failsafe.unref();
  status.disconnect = () => {
    clearTimeout(failsafe);
    setTimeout(() => inspector.close(), 300).unref();
  };

  function attach(window) {
    const contents = window.webContents;
    if (attached.has(contents)) return;
    attached.add(contents);

    async function apply() {
      if (!contents.getURL().startsWith('music-application://desktop/')) return;
      try {
        await contents.insertCSS(style, { cssOrigin: 'user' });
        await contents.executeJavaScript(script);
        status.loaded = true;
      } catch (error) {
        status.error = error.message;
      }
    }

    contents.on('did-finish-load', apply);
    if (!contents.isLoading() && contents.getURL()) void apply();
  }

  electron.app.on('browser-window-created', (_, window) => attach(window));
  for (const window of electron.BrowserWindow.getAllWindows()) attach(window);
  return true;
}

async function run() {
  const child = spawn(path.join(directory, executable), ['--inspect=127.0.0.1:0'], {
    detached: true,
    stdio: ['ignore', 'ignore', 'pipe'],
    windowsHide: true
  });
  let socket;
  let evaluate;
  try {
    const endpoint = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Yandex Music did not open its startup connection.')), 9000);
      let stderr = '';
      child.on('error', error => { clearTimeout(timer); reject(error); });
      child.on('exit', () => {
        clearTimeout(timer);
        reject(new Error('Close Yandex Music fully, including its tray icon, then try again.'));
      });
      child.stderr.on('data', chunk => {
        stderr += chunk;
        const match = stderr.match(/ws:\/\/127\.0\.0\.1:\d+\/[a-f\d-]+/i);
        if (match) {
          clearTimeout(timer);
          resolve(match[0]);
        }
        stderr = stderr.slice(-2048);
      });
    });
    socket = new WebSocket(endpoint);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', () => reject(new Error('The startup connection failed.')), { once: true });
    });
    let id = 0;
    evaluate = expression => new Promise((resolve, reject) => {
      const request = ++id;
      function receive({ data }) {
        const response = JSON.parse(data);
        if (response.id !== request) return;
        clearTimeout(timer);
        socket.removeEventListener('message', receive);
        if (response.error || response.result?.exceptionDetails) {
          reject(new Error(response.error?.message ?? response.result.result?.description));
        } else {
          resolve(response.result?.result?.value);
        }
      }
      const timer = setTimeout(() => {
        socket.removeEventListener('message', receive);
        reject(new Error('The startup connection timed out.'));
      }, 4000);
      socket.addEventListener('message', receive);
      socket.send(JSON.stringify({ id: request, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
    });

    const expression = '(' + installTheme + ')(' + JSON.stringify(source) + ',' + JSON.stringify(css) + ')';
    const bootDeadline = Date.now() + 8000;
    await new Promise(resolve => setTimeout(resolve, 1200));
    for (;;) {
      try {
        if (await evaluate('Boolean(process.mainModule)')) {
          await evaluate(expression);
          break;
        }
      } catch (error) {
        if (!/context|mainModule|undefined/.test(error.message)) throw error;
      }
      if (Date.now() >= bootDeadline) throw new Error('Yandex Music did not finish starting.');
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    const deadline = Date.now() + 18000;
    while (Date.now() < deadline && socket.readyState === WebSocket.OPEN) {
      const status = await evaluate('globalThis.__stormWaveStartup');
      if (status?.loaded) {
        console.log('YaMod loaded.');
        return;
      }
      if (status?.error) throw new Error(status.error);
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error('The player window was not found. Exit Yandex Music fully and retry.');
  } finally {
    if (evaluate && socket?.readyState === WebSocket.OPEN) {
      await evaluate('if (globalThis.__stormWaveStartup) globalThis.__stormWaveStartup.disconnect(); else setTimeout(() => process.getBuiltinModule("node:inspector").close(), 300).unref(); true').catch(() => {});
    }
    socket?.close();
    child.stderr.destroy();
    child.unref();
  }
}

run().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});




