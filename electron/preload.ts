// Preload bridge. contextIsolation is on, so the renderer gets only this small,
// explicit API — never raw Node or ipcRenderer.

import { contextBridge, ipcRenderer } from "electron";

// The backend port is passed by main as a ?port= query param on the loaded URL.
const backendPort = new URLSearchParams(globalThis.location.search).get("port") ?? "";

contextBridge.exposeInMainWorld("pos", {
  backendPort,
  backendBaseUrl: backendPort ? `http://127.0.0.1:${backendPort}` : "",
  printReceipt: (html: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke("receipt:print", html),
  saveReceiptPdf: (
    html: string,
    suggestedName: string,
  ): Promise<{ ok: boolean; canceled?: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke("receipt:savePdf", html, suggestedName),
});
