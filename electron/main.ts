// Electron main process for the Bee Healthy Cafe POS.
//
// Responsibilities:
//   1. Spawn the Deno backend as a localhost sidecar (a `deno compile`d exe in
//      production, or `deno run` in development).
//   2. Pick a free 127.0.0.1 port and the per-machine DB path, hand them to the
//      backend, and wait for /health before showing the UI.
//   3. Provide print / save-PDF for receipts (no receipt-printer hardware needed).
//   4. Tear the sidecar down on quit.

import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { writeFile } from "node:fs/promises";
import path from "node:path";

// Compiled as CommonJS (see electron/tsconfig.json), so __dirname is a global —
// no import.meta. CommonJS output is required because the sandboxed preload script
// cannot be an ES module.
const isDev = !app.isPackaged;
const DEV_SERVER_URL = "http://localhost:5173";

let backend: ChildProcess | null = null;
let mainWindow: BrowserWindow | null = null;

// Ask the OS for a free ephemeral port so we never collide with other software.
function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (addr && typeof addr === "object") {
        const { port } = addr;
        srv.close(() => resolve(port));
      } else {
        reject(new Error("Could not determine a free port."));
      }
    });
  });
}

function backendCommand(): { cmd: string; args: string[] } {
  if (isDev) {
    // Dev: run the TypeScript backend directly with the Deno on PATH.
    const entry = path.join(__dirname, "..", "backend", "server.ts");
    return {
      cmd: "deno",
      args: [
        "run",
        "--allow-net",
        "--allow-read",
        "--allow-write",
        "--allow-env",
        entry,
      ],
    };
  }
  // Production: the compiled backend exe bundled via electron-builder extraResources.
  const exe = process.platform === "win32"
    ? "bee-backend.exe"
    : "bee-backend";
  return { cmd: path.join(process.resourcesPath, "backend", exe), args: [] };
}

async function startBackend(port: number): Promise<void> {
  const dbPath = path.join(app.getPath("userData"), "bee-pos.db");
  const { cmd, args } = backendCommand();

  backend = spawn(cmd, args, {
    env: { ...process.env, POS_PORT: String(port), POS_DB_PATH: dbPath },
    stdio: ["ignore", "pipe", "pipe"],
  });

  backend.stdout?.on("data", (d) => console.log(`[backend] ${d}`.trimEnd()));
  backend.stderr?.on("data", (d) => console.error(`[backend] ${d}`.trimEnd()));
  backend.on("exit", (code) => {
    console.log(`[backend] exited with code ${code}`);
    backend = null;
  });

  await waitForHealth(port);
}

async function waitForHealth(port: number, timeoutMs = 15000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("Backend did not become healthy in time.");
}

async function createWindow(port: number): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#052e16",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // The renderer reads the backend port from this query param via the preload.
  mainWindow.once("ready-to-show", () => mainWindow?.show());

  if (isDev) {
    await mainWindow.loadURL(`${DEV_SERVER_URL}?port=${port}`);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    await mainWindow.loadFile(
      path.join(__dirname, "..", "dist-renderer", "index.html"),
      { query: { port: String(port) } },
    );
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ---- Printing -------------------------------------------------------------
// The renderer sends receipt HTML; we render it in an offscreen window and either
// open the OS print dialog or write a PDF.

// Render receipt HTML in an offscreen window. `loadURL` resolves only once the page
// has finished loading, so awaiting it avoids the did-finish-load race that could
// leave the renderer's IPC call hanging forever.
async function renderHtmlInHiddenWindow(html: string): Promise<BrowserWindow> {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
  return win;
}

ipcMain.handle("receipt:print", async (_e, html: string) => {
  let win: BrowserWindow | null = null;
  try {
    win = await renderHtmlInHiddenWindow(html);
    await new Promise<void>((resolve, reject) => {
      win!.webContents.print({ silent: false, printBackground: true }, (ok, reason) => {
        // ok === false with reason "cancelled" is a normal user cancel, not an error.
        if (ok || reason === "cancelled" || reason === "canceled") resolve();
        else reject(new Error(reason || "Printing failed."));
      });
    });
    return { ok: true };
  } catch (err) {
    console.error("[print] failed:", err);
    return { ok: false, error: (err as Error).message };
  } finally {
    win?.close();
  }
});

ipcMain.handle("receipt:savePdf", async (_e, html: string, suggestedName: string) => {
  let win: BrowserWindow | null = null;
  try {
    const defaultPath = path.join(app.getPath("documents"), suggestedName || "receipt.pdf");
    const opts = {
      defaultPath,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    };
    // Tolerate a missing/closed main window by falling back to a parentless dialog.
    const result = mainWindow
      ? await dialog.showSaveDialog(mainWindow, opts)
      : await dialog.showSaveDialog(opts);
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };

    win = await renderHtmlInHiddenWindow(html);
    const pdf = await win.webContents.printToPDF({ printBackground: true });
    await writeFile(result.filePath, pdf);
    return { ok: true, path: result.filePath };
  } catch (err) {
    console.error("[savePdf] failed:", err);
    dialog.showErrorBox("Could not save PDF", (err as Error).message);
    return { ok: false, error: (err as Error).message };
  } finally {
    win?.close();
  }
});

// ---- Lifecycle ------------------------------------------------------------

app.whenReady().then(async () => {
  try {
    const port = await getFreePort();
    await startBackend(port);
    await createWindow(port);
  } catch (err) {
    dialog.showErrorBox(
      "Bee Healthy Cafe POS failed to start",
      (err as Error).message,
    );
    app.quit();
  }

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const port = await getFreePort();
      await startBackend(port);
      await createWindow(port);
    }
  });
});

function stopBackend(): void {
  if (backend && !backend.killed) {
    backend.kill();
    backend = null;
  }
}

app.on("window-all-closed", () => {
  stopBackend();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", stopBackend);
app.on("will-quit", stopBackend);
