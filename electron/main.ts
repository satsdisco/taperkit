import { app, BrowserWindow, dialog } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import { fileURLToPath } from 'url'
import path from 'path'
import http from 'http'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PORT = 7337
let serverProcess: ChildProcess | null = null
let mainWindow: BrowserWindow | null = null

function spawnServer(): ChildProcess {
  const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' }

  if (app.isPackaged) {
    // Packaged: run compiled ESM server — asar:false means real files on disk
    const serverPath = path.join(app.getAppPath(), 'dist', 'server', 'index.js')
    return spawn(process.execPath, [serverPath], { env, stdio: 'pipe' })
  } else {
    // Dev: run TypeScript server via tsx
    const serverPath = path.join(__dirname, '..', 'server', 'index.ts')
    return spawn('npx', ['tsx', serverPath], { env, stdio: 'pipe', shell: true })
  }
}

function waitForServer(retries = 40, delayMs = 500): Promise<void> {
  return new Promise((resolve, reject) => {
    let attempts = 0

    const check = () => {
      const req = http.get(`http://localhost:${PORT}/api/tools`, (res) => {
        res.resume()
        if (res.statusCode !== undefined && res.statusCode < 500) {
          resolve()
        } else {
          retry()
        }
      })
      req.on('error', retry)
      req.setTimeout(1000, () => {
        req.destroy()
        retry()
      })
    }

    const retry = () => {
      attempts++
      if (attempts >= retries) {
        reject(new Error(`Server did not respond after ${retries} attempts`))
      } else {
        setTimeout(check, delayMs)
      }
    }

    check()
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  mainWindow.loadURL(`http://localhost:${PORT}`)
  mainWindow.on('closed', () => { mainWindow = null })
}

app.whenReady().then(async () => {
  serverProcess = spawnServer()

  serverProcess.stdout?.on('data', (data: Buffer) => process.stdout.write(data))
  serverProcess.stderr?.on('data', (data: Buffer) => process.stderr.write(data))

  serverProcess.on('error', (err: Error) => {
    dialog.showErrorBox('Server Error', `Failed to start TaperKit server:\n${err.message}`)
    app.quit()
  })

  try {
    await waitForServer()
    createWindow()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    dialog.showErrorBox('Startup Error', `Could not connect to TaperKit server:\n${message}`)
    app.quit()
  }

  app.on('activate', () => {
    if (mainWindow === null) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  if (serverProcess) {
    serverProcess.kill()
    serverProcess = null
  }
})
