# Research & Architecture: Sandboxed Headless Browser Automation Tool (`browser_action`)

- **Date**: 2026-09-26
- **Ticket**: Resolves #77 (Part of Wayfinder Map #67: Persistent Project Memory Engine & Open-Source Tool Suite)
- **Status**: Complete / Authoritative Research & Architecture Specification
- **Target File**: `docs/research/2026-09-26-sandboxed-browser-automation.md`
- **Relevant Subsystems**: Agent Runtime (`NativeAgentRuntime`), Electron Window Management, Network Security (`ssrfGuard.ts`), Tool Suite (`src/main/managers/agent/native/tools`), Permission Core (`AgentManager.decideToolUse`)
- **Security Invariants**: SEC-01 (Renderer Node Isolation), SEC-02 (Zero Web Permissions), SEC-03 (Navigation Surface Denial), SEC-04 (Strict CSP), SEC-08 (No Shell Spawning), SEC-14 (Crown Jewels Isolation), SEC-18 (SSRF Guard & Anti-Rebinding), SEC-19 (Three-Layer Permission Authority), XP-01 (Input/Output Bounds)

---

## 1. Executive Summary & Comparative Architectural Matrix

Coding agents operating inside modern software engineering environments require visual inspection, DOM verification, and runtime diagnostics to validate web applications, inspect UI regressions, and explore live technical documentation. However, introducing a full headless browser runtime into an AI-driven desktop application is one of the most dangerous attack surfaces in computer security: a browser is a full computing environment capable of executing untrusted remote code, following redirects, resolving arbitrary hostnames, establishing WebSockets, and issuing requests to internal cloud metadata endpoints and local services.

This specification investigates how `browser_action` must be architected for ZEUS to deliver full browser inspection capabilities (`launch`, `click`, `type`, `scroll`, `screenshot`, `get_console_logs`, `close`) while maintaining **zero tolerance** for SSRF (SEC-18), strict process sandboxing, and compliance with ZEUS's deny-by-default security architecture (ADR-0004).

### Comparative Architectural Matrix

| Dimension | Option A: In-Process Electron Offscreen Rendering | Option B: External Playwright Subprocess | Option C: Puppeteer-Core / External Chrome CDP (Cline / Roo Code) |
| :--- | :--- | :--- | :--- |
| **Runtime Footprint** | **0 MB added**: Uses bundled Chromium already present in ZEUS Electron binary | **150–300 MB download**: Requires downloading headless Chromium into `%LOCALAPPDATA%/ms-playwright` | **Unreliable / Brittle**: Depends on user having Google Chrome pre-installed at a known system PATH |
| **Network Interception & SSRF Control** | **100% Interception via `session.webRequest`**: Catches main frame, subframes, scripts, images, XHR, fetch, WebSockets, media, and redirects before TCP socket connection | **DevTools Protocol Level (`page.route`)**: Intercepts requests, but socket-level IP binding and DNS rebinding cannot be strictly pinned without external forward proxy | **Partial / Brittle**: Intercepts CDP network events; cannot enforce low-level Node `makeGuardedLookup` socket pinning |
| **Process Sandboxing** | **Native Chromium OS Sandbox**: Runs in isolated renderer process (`sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`) | **Separate OS Process**: Requires child process supervision; risk of orphaned zombie processes on crash | **External Process or Ambient Browser**: Risk of attaching to user's active Chrome profile, leaking real browsing cookies and credentials |
| **Memory & Crown Jewel Isolation (SEC-14)** | **Strict Ephemeral Partition**: `session.fromPartition('browser_action:' + sessionId)` keeps all cookies/cache in RAM; destroys on close | **Filesystem Temp Dirs**: Browser profiles written to disk temp directories; risk of leaving traces on ungraceful exit | **Profile Contamination**: Often shares or borrows user Chrome profile data |
| **Process Spawning Invariants (SEC-08)** | **SEC-08 Compliant by construction**: In-process Electron API; zero `child_process.spawn`, zero argv parsing, zero shell strings | **Subprocess Hazard**: Requires spawning Node/Playwright CLI with argv parameters; requires audit against shell expansion | **Subprocess Hazard**: Spawns external Chrome process via CLI flags or probes system registry |
| **Platform Portability** | **Identical across Windows, macOS, Linux**: Handled natively by Electron's display compositor | **Platform Discrepancies**: Driver installation issues on Linux (missing shared libs) and Windows PATH quirks | **Platform Discrepancies**: Registry lookups on Windows, `.app` paths on macOS, `/usr/bin` on Linux |
| **Input & Vision Capture** | Native `webContents.capturePage()` (zero GPU flicker, headless memory paint) + `sendInputEvent()` | Built-in Playwright screenshot + rich locator actionability | Puppeteer `page.screenshot()` + CDP input dispatch |

### Architectural Verdict

**Option A (In-Process Electron Offscreen Rendering via `session.fromPartition`) is overwhelmingly the correct, high-trust architecture for ZEUS.** It completely eliminates external multi-hundred-megabyte binary downloads, guarantees zero child process vulnerabilities (SEC-08), runs within Chromium's hardened OS sandbox, and provides deep, synchronous packet-level control over 100% of network requests via Electron's `webRequest` API.

---

## 2. Detailed Threat Model & SSRF Attack Vectors

A web browser is an active, autonomous runtime that evaluates untrusted code and fetches remote resources. While simple HTTP tools (`fetch_web_content` / `guardedGet`) only download a single static payload, a browser introduces several severe attack vectors:

### 2.1 Subresource Embedding Attacks
When Chromium loads an HTML page, its speculative parser immediately initiates parallel network requests for all subresources:
- `<img>`, `<picture>`, `<svg>`
- `<script>`, `<link rel="stylesheet">`, `<link rel="preload">`
- `<iframe>`, `<frame>`, `<object>`, `<embed>`
- `@import` rules inside CSS stylesheets
- `fetch()`, `XMLHttpRequest`, `navigator.sendBeacon()`
- `new WebSocket()`, `new EventSource()`

**Attack Scenario**: An attacker hosts an apparently benign website: `https://public-code-docs.io/index.html`. When ZEUS's agent navigates to this URL to inspect documentation, the page contains hidden subresources:
```html
<img src="http://169.254.169.254/latest/meta-data/iam/security-credentials/admin-role" />
<iframe src="http://127.0.0.1:8080/api/drop-database"></iframe>
<link rel="stylesheet" href="http://192.168.1.1/admin/config.css" />
```
If security screening only inspects the initial navigation URL, all subresources bypass the check, allowing remote attackers to extract AWS/GCP cloud metadata credentials, pivot into the developer's local network (LAN), or manipulate unauthenticated local development services.

### 2.2 HTTP 30x Redirect Hijacking
A public, allowlisted URL can respond with an HTTP redirect (`301`, `302`, `303`, `307`, `308`) pointing directly to an internal target:
```http
HTTP/1.1 302 Found
Location: http://169.254.169.254/latest/meta-data/
```
Redirects can occur on the main document frame, within sub-frames (`<iframe>`), or inside subresource fetches (`fetch()`, `<img>`). The browser's network stack automatically follows redirects unless each individual redirect hop is intercepted and evaluated against the SSRF guard before the subsequent connection is formed.

### 2.3 DNS Rebinding Attacks
DNS Rebinding exploits the time gap between DNS resolution and TCP socket establishment:
1. Attacker controls domain `rebind.attacker.io` with a custom authoritative DNS server configured with a Time-To-Live (TTL) of 0 seconds.
2. When the tool validates the URL, the initial DNS lookup returns a benign public IP (e.g., `203.0.113.10`). The URL passes the pre-validation check.
3. Milliseconds later, when Chromium's network service connects the TCP socket or issues an asynchronous subresource request, the DNS server responds with `127.0.0.1` or `169.254.169.254`.
4. Because the browser perceives the origin as `http://rebind.attacker.io`, the Same-Origin Policy (SOP) permits client-side JavaScript to read the response payload, exposing internal service responses to the attacker.

### 2.4 WebSocket & WebRTC Pivot
- **WebSockets (`ws://`, `wss://`)**: WebSockets do not adhere to SOP. An untrusted webpage running in the browser can initiate a connection to `ws://127.0.0.1:<port>` or `ws://localhost:<port>`. Many local dev tools (Vite HMR, webpack dev server, debuggers) do not validate the `Origin` header, allowing remote scripts to send arbitrary commands to local processes.
- **WebRTC (`RTCPeerConnection`)**: WebRTC ICE candidates can discover and leak the local host's private LAN IP address and probe UDP ports behind NAT.

### 2.5 Local Dev Server Preview vs Remote Targets
ZEUS developers specifically require the agent to visually inspect their locally hosted web applications (`http://localhost:3000`, `http://127.0.0.1:5173`) to verify CSS layout fixes and check console errors.
However, blanket-allowing loopback creates a catastrophic security hole: an external website could then instruct the browser to interact with local services.

**Strict Dual-Mode Resolution**:
- `target_mode: 'remote_web'` (Default): Loopback (`127.0.0.1`, `localhost`, `::1`), private LAN ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `100.64.0.0/10`), link-local (`169.254.0.0/16`), and cloud metadata (`169.254.169.254`) are **strictly blocked**.
- `target_mode: 'local_dev'`: ONLY loopback (`127.0.0.1`, `localhost`, `::1`) on the explicitly approved port (e.g., `3000`) is permitted. Remote hosts, private LAN ranges, and **Cloud Metadata (169.254.169.254) remain unconditionally banned**.

---

## 3. SEC-18 Enforcement Architecture for Full Browser Sessions

To guarantee SEC-18 across a full browser session, ZEUS enforces a multi-stage request interceptor at the Electron session level.

```mermaid
flowchart TD
    A["Agent Tool Request (browser_action)"] --> B["Pre-Navigation Gate (URL & Target Mode Check)"]
    B -->|Passed| C["Electron Offscreen BrowserWindow (loadURL)"]
    
    subgraph Electron Chromium Network Service
        C --> D["session.webRequest.onBeforeRequest"]
        D --> E{"Protocol Valid? (http/https only)"}
        E -->|No| R1["CANCEL (Blocked Protocol: file/gopher/etc.)"]
        E -->|Yes| F{"Target Mode: local_dev vs remote_web"}
        
        F -->|remote_web| G["DNS Pre-Resolution (makeGuardedLookup)"]
        G --> H{"Resolved IP Check (isCloudMetadataIp || isPrivateIp)"}
        H -->|Disallowed| R2["CANCEL (SSRF Blocked: Private/Metadata IP)"]
        H -->|Allowed Public IP| P["Proceed to Network"]
        
        F -->|local_dev| I{"Is Target Approved Loopback Port?"}
        I -->|No| R3["CANCEL (Unapproved Local Port / External Host)"]
        I -->|Yes| J{"Is Cloud Metadata IP?"}
        J -->|Yes (169.254.169.254)| R4["CANCEL (Unconditional Metadata Ban)"]
        J -->|No| P
        
        P --> K["session.webRequest.onHeadersReceived"]
        K --> L["Inject Hardening CSP (block object/base)"]
        L --> M["Render Frame / Execute Page"]
    end
```

### 3.1 Deep Packet & Subresource Interception via `webRequest`
Electron provides the `session.webRequest` API, which hooks into Chromium's network service before sockets are allocated:

1. **`webRequest.onBeforeRequest`**:
   - Intercepts all requests matching `<all_urls>`.
   - Inspects `details.resourceType`: `mainFrame`, `subFrame`, `stylesheet`, `script`, `image`, `font`, `object`, `xhr`, `ping`, `cspReport`, `media`, `webSocket`, `other`.
   - Performs protocol validation: blocks `file:`, `javascript:`, `data:` (except safe data-URIs for image subresources), `gopher:`, `ftp:`.
   - Resolves hostnames synchronously/asynchronously via Node's `dns.lookup({ all: true })` and evaluates all returned addresses using `isPrivateIp()` and `isCloudMetadataIp()`.
   - If disallowed: invokes `callback({ cancel: true })` and records a security diagnostic event.

2. **`webRequest.onBeforeRedirect`**:
   - Triggers on every HTTP redirect hop.
   - Re-evaluates `details.redirectURL` against the SSRF guard before Chromium initiates the redirect connection.

3. **`webRequest.onHeadersReceived`**:
   - Injects a defensive Content-Security-Policy (CSP) into untrusted pages to restrict object embedding, disable frame hijacking, and enforce strict execution boundaries:
     ```http
     Content-Security-Policy: object-src 'none'; base-uri 'none';
     ```

### 3.2 DNS Resolution & Anti-Rebinding Strategy
To prevent DNS rebinding in Chromium:
- When a hostname is intercepted in `onBeforeRequest`, the interceptor performs an explicit pre-resolution via `dns.lookup(hostname, { all: true })`.
- If any address in the returned set matches `isCloudMetadataIp` or (in `remote_web` mode) `isPrivateIp`, the request is cancelled immediately.
- For local dev mode, the interceptor ensures that the hostname resolves exclusively to `127.0.0.1` or `::1`, and validates that the destination port matches the authorized dev server port.

### 3.3 Permanent Ban on Cloud Metadata (169.254.169.254 & fd00:ec2::254)
Under no configuration, toggle, or mode can `169.254.169.254` or `fd00:ec2::254` be accessed:
- Hardcoded check in `isCloudMetadataIp(ip)`.
- Applied unconditionally in both `remote_web` and `local_dev` target modes.
- Blocked at the URL string level, pre-navigation level, and `webRequest` DNS resolution level.

---

## 4. Process Sandboxing & Invariant Compliance

The integration of `browser_action` strictly complies with the canonical ZEUS security invariants documented in `docs/security/invariants.md`:

| Invariant | Standard Requirement | `browser_action` Implementation & Compliance |
| :--- | :--- | :--- |
| **SEC-01** | Renderer has no Node access; context isolated; sandboxed. | Browser automation uses a dedicated, headless `BrowserWindow` with: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`, `allowRunningInsecureContent: false`. The page has zero access to Node.js APIs or ZEUS internal state. |
| **SEC-02** | No web-platform permissions granted. | Ephemeral partition hooks `setPermissionRequestHandler`, `setPermissionCheckHandler`, and `setDevicePermissionHandler`, returning `false` / `callback(false)` for all permissions (geolocation, camera, microphone, notifications, USB, HID, Bluetooth). |
| **SEC-03** | Window cannot be navigated away or turned into open WebContents. | `setWindowOpenHandler` returns `{ action: 'deny' }` (blocks popups). `<webview>` attachment is blocked. `will-navigate` and `will-redirect` are screened by the SSRF interceptor. |
| **SEC-04** | Strict CSP applied. | CSP headers injected in `onHeadersReceived` blocking dangerous sub-objects (`object-src 'none'`). |
| **SEC-08** | No user- or agent-controlled execution through shell strings. | Entire browser automation engine is in-process Electron. Zero shell invocations (`shell: false`), zero command-line string interpolation, zero external binaries. |
| **SEC-14** | Crown jewels isolation (`secrets/`, `zeus.db`, `settings.json`). | Browser operates in an **ephemeral in-memory partition** (`session.fromPartition('browser_action:' + sessionId)`). No data is written to `userData`. Untrusted pages cannot access the local filesystem or ZEUS databases. |
| **SEC-18** | Outbound fetches can never reach private/loopback/cloud metadata space. | Enforced across 100% of browser requests, subresources, iframes, WebSockets, and redirects via `SsrfBrowserInterceptor`. |
| **SEC-19** | Three-layer permission authority. | **Layer 1**: Persona mode gating (`activeMode.groups.includes('browser')`).<br>**Layer 2**: Interactive user consent via `AgentManager.decideToolUse` on navigation.<br>**Layer 3**: Ephemeral partition isolation and `webRequest` packet filter. |
| **XP-01** | Input/output caps bound untrusted streams. | Viewport clamped to 1280x800 (max 1920x1080). Screenshot images clamped to max 2 MiB JPEG. Console log buffer clamped to 500 lines circular ring. Navigation timeout capped at 30 seconds. |

---

## 5. `browser_action` Tool Specification & JSON Schemas

The `browser_action` tool is registered in the native tool suite with capability group `'browser'`.

### 5.1 Canonical Tool Definition

```typescript
export interface BrowserActionInput {
  action: 'launch' | 'click' | 'type' | 'scroll' | 'screenshot' | 'get_console_logs' | 'close';
  url?: string;
  target_mode?: 'remote_web' | 'local_dev';
  coordinate?: { x: number; y: number };
  selector?: string;
  text?: string;
  submit?: boolean;
  clear?: boolean;
  delta_x?: number;
  delta_y?: number;
  viewport?: { width: number; height: number };
  quality?: number;
  log_level?: 'all' | 'error' | 'warn' | 'info';
}
```

### 5.2 JSON Schema (Provider-Agnostic)

```json
{
  "name": "browser_action",
  "description": "Performs sandboxed browser automation actions including navigating to web pages, capturing visual screenshots, clicking elements, entering text, scrolling, and reading console logs with strict SSRF protection.",
  "parameters": {
    "type": "object",
    "properties": {
      "action": {
        "type": "string",
        "enum": ["launch", "click", "type", "scroll", "screenshot", "get_console_logs", "close"],
        "description": "The browser action to execute."
      },
      "url": {
        "type": "string",
        "description": "The URL to navigate to (required for 'launch' when navigating, or when navigating an existing session)."
      },
      "target_mode": {
        "type": "string",
        "enum": ["remote_web", "local_dev"],
        "default": "remote_web",
        "description": "Target network mode. 'remote_web' blocks all private and loopback IPs. 'local_dev' permits loopback connections exclusively for local dev server testing."
      },
      "coordinate": {
        "type": "object",
        "properties": {
          "x": { "type": "integer", "description": "X coordinate in viewport pixels." },
          "y": { "type": "integer", "description": "Y coordinate in viewport pixels." }
        },
        "required": ["x", "y"],
        "description": "Viewport coordinates for 'click'."
      },
      "selector": {
        "type": "string",
        "description": "CSS selector or element text target for 'click', 'type', or 'scroll'."
      },
      "text": {
        "type": "string",
        "description": "The text string to type when action is 'type'."
      },
      "submit": {
        "type": "boolean",
        "default": false,
        "description": "Whether to press Enter after typing text."
      },
      "clear": {
        "type": "boolean",
        "default": false,
        "description": "Whether to clear existing field content before typing."
      },
      "delta_x": {
        "type": "integer",
        "default": 0,
        "description": "Horizontal scroll offset in pixels for 'scroll'."
      },
      "delta_y": {
        "type": "integer",
        "default": 0,
        "description": "Vertical scroll offset in pixels for 'scroll'."
      },
      "viewport": {
        "type": "object",
        "properties": {
          "width": { "type": "integer", "default": 1280 },
          "height": { "type": "integer", "default": 800 }
        },
        "description": "Viewport dimensions for browser window."
      },
      "quality": {
        "type": "integer",
        "minimum": 10,
        "maximum": 100,
        "default": 80,
        "description": "JPEG compression quality for 'screenshot'."
      },
      "log_level": {
        "type": "string",
        "enum": ["all", "error", "warn", "info"],
        "default": "all",
        "description": "Filter level for 'get_console_logs'."
      }
    },
    "required": ["action"]
  }
}
```

---

## 6. User Experience & Layer 2 Permission Gating

### 6.1 Interactive Approval Workflow
When the agent executes `browser_action` with `action: 'launch'` or navigates to a new domain:
1. `AgentManager.decideToolUse` intercepts the tool call at Layer 2.
2. The risk level is determined:
   - `screenshot`, `get_console_logs`: Classified as `read` risk (auto-approved in ask/plan mode if domain was previously acked).
   - `launch`, `click`, `type`, `scroll`: Classified as `command` risk (requires explicit approval).
3. The UI renders a dedicated `PermissionRequest` card displaying:
   - **Action**: Target action and URL.
   - **Target Mode Badge**: `[Remote Web]` (green) vs `[Local Dev Server: Port 3000]` (amber).
   - **SSRF Safety Stamp**: Verified by `ssrfBrowserInterceptor`.
   - **Options**: "Allow Once", "Allow for Session", "Deny".

### 6.2 Live Viewport Thumbnail
Electron offscreen rendering generates native frame buffers without an open OS window.
- The `BrowserSession` listens to `webContents.on('paint')` or captures a 320x200 downsampled thumbnail every 500ms when active.
- Emits `IpcEvents.browserThumbnailUpdated` to the main window renderer.
- The UI displays a miniature live viewport card in the conversation or activity drawer, giving the developer real-time confidence in what the agent is viewing without invasive popup windows.

### 6.3 Arabic & RTL Layout Support (ADR-0011)
When inspecting localized interfaces or Arabic content:
- The DOM inspection helper checks `document.documentElement.dir === 'rtl'` and computed styles.
- Coordinate translation: When calculating click bounding boxes for mirrored layouts, coordinates accurately map to the offscreen buffer.
- Text input: Arabic Unicode characters are dispatched using Electron's `sendInputEvent({ type: 'char', keyCode: char })`, ensuring correct character shaping and bidirectional text flow.

---

## 7. Concrete Phased Implementation Blueprint & Class Designs

### 7.1 Class Architecture

```
src/main/managers/browser/
├── BrowserActionManager.ts       # Singleton manager owning sessions by sessionId
├── BrowserSession.ts             # Wraps offscreen BrowserWindow, lifecycle, viewport & logs
└── ssrfBrowserInterceptor.ts     # Electron webRequest deep interceptor with SSRF guard
src/main/managers/agent/native/tools/
└── browserAction.ts              # NativeTool execution handler for browser_action
```

#### `SsrfBrowserInterceptor` Design (`src/main/managers/browser/ssrfBrowserInterceptor.ts`)
```typescript
import { session as electronSession } from 'electron';
import * as dns from 'node:dns';
import { isPrivateIp, isCloudMetadataIp } from '../../net/ssrfGuard';
import { logger } from '../../logger';

export interface InterceptorOptions {
  targetMode: 'remote_web' | 'local_dev';
  allowedLoopbackPort?: number;
}

export function installSsrfInterceptor(
  sess: Electron.Session,
  getOptions: () => InterceptorOptions,
): void {
  // 1. Intercept all outgoing requests before network transmission
  sess.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
    const rawUrl = details.url;
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return callback({ cancel: true });
    }

    // Protocol guard
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      logger.warn(`[SSRF Interceptor] Blocked protocol: ${parsed.protocol}`);
      return callback({ cancel: true });
    }

    // Embedded credentials guard
    if (parsed.username || parsed.password) {
      logger.warn(`[SSRF Interceptor] Blocked URL with credentials`);
      return callback({ cancel: true });
    }

    const { targetMode, allowedLoopbackPort } = getOptions();
    const hostname = parsed.hostname.toLowerCase();

    // Check Cloud Metadata unconditionally
    if (hostname === '169.254.169.254' || hostname === 'fd00:ec2::254') {
      logger.error(`[SSRF Interceptor] Hard-blocked cloud metadata host`);
      return callback({ cancel: true });
    }

    const isLoopbackHost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';

    if (targetMode === 'remote_web') {
      if (isLoopbackHost) {
        logger.warn(`[SSRF Interceptor] Blocked loopback host in remote_web mode: ${hostname}`);
        return callback({ cancel: true });
      }

      // DNS Pre-resolution & validation against SSRF
      dns.lookup(hostname, { all: true }, (err, addresses) => {
        if (err || !addresses || addresses.length === 0) {
          return callback({ cancel: true });
        }
        const hasBadIp = addresses.some(
          (a) => isCloudMetadataIp(a.address) || isPrivateIp(a.address),
        );
        if (hasBadIp) {
          logger.warn(`[SSRF Interceptor] Blocked resolved private/metadata address for host ${hostname}`);
          return callback({ cancel: true });
        }
        callback({ cancel: false });
      });
      return;
    }

    if (targetMode === 'local_dev') {
      if (!isLoopbackHost) {
        logger.warn(`[SSRF Interceptor] Blocked non-loopback host in local_dev mode: ${hostname}`);
        return callback({ cancel: true });
      }

      const port = parsed.port ? parseInt(parsed.port, 10) : (parsed.protocol === 'https:' ? 443 : 80);
      if (allowedLoopbackPort && port !== allowedLoopbackPort) {
        logger.warn(`[SSRF Interceptor] Blocked unapproved loopback port: ${port}`);
        return callback({ cancel: true });
      }

      return callback({ cancel: false });
    }

    return callback({ cancel: true });
  });

  // 2. Harden CSP on all received headers
  sess.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders };
    headers['Content-Security-Policy'] = ["object-src 'none'; base-uri 'none';"];
    callback({ responseHeaders: headers });
  });
}
```

#### `BrowserSession` Design (`src/main/managers/browser/BrowserSession.ts`)
```typescript
import { BrowserWindow, session as electronSession, NativeImage } from 'electron';
import { installSsrfInterceptor, InterceptorOptions } from './ssrfBrowserInterceptor';
import { logger } from '../../logger';

export interface ConsoleMessageEntry {
  timestamp: number;
  level: 'info' | 'warn' | 'error';
  text: string;
  sourceUrl?: string;
  lineNumber?: number;
}

export class BrowserSession {
  private window: BrowserWindow | null = null;
  private consoleLogs: ConsoleMessageEntry[] = [];
  private readonly MAX_LOGS = 500;
  private currentTargetMode: 'remote_web' | 'local_dev' = 'remote_web';
  private allowedLoopbackPort?: number;

  constructor(
    public readonly sessionId: string,
    private readonly partitionId: string = `browser_action_${sessionId}`,
  ) {}

  async launch(opts: {
    url?: string;
    viewport?: { width: number; height: number };
    targetMode?: 'remote_web' | 'local_dev';
    allowedLoopbackPort?: number;
  }): Promise<void> {
    if (this.window && !this.window.isDestroyed()) {
      if (opts.url) await this.navigate(opts.url, opts.targetMode, opts.allowedLoopbackPort);
      return;
    }

    this.currentTargetMode = opts.targetMode ?? 'remote_web';
    this.allowedLoopbackPort = opts.allowedLoopbackPort;

    const width = Math.min(1920, Math.max(800, opts.viewport?.width ?? 1280));
    const height = Math.min(1080, Math.max(600, opts.viewport?.height ?? 800));

    // Ephemeral in-memory partition (zero disk footprint, SEC-14)
    const customSession = electronSession.fromPartition(this.partitionId, { cache: false });

    // Hardened permission handlers (SEC-02)
    customSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
    customSession.setPermissionCheckHandler(() => false);
    customSession.setDevicePermissionHandler(() => false);

    // Install deep SSRF interceptor (SEC-18)
    installSsrfInterceptor(customSession, () => ({
      targetMode: this.currentTargetMode,
      allowedLoopbackPort: this.allowedLoopbackPort,
    }));

    this.window = new BrowserWindow({
      width,
      height,
      show: false,
      frame: false,
      webPreferences: {
        offscreen: true, // Offscreen headless rendering
        contextIsolation: true, // SEC-01
        nodeIntegration: false, // SEC-01
        sandbox: true, // Chromium OS sandbox
        webSecurity: true,
        allowRunningInsecureContent: false,
        session: customSession,
        backgroundThrottling: false,
      },
    });

    // Block popups and window creation (SEC-03)
    this.window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

    // Capture console messages
    this.window.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      const levelMap: Record<number, 'info' | 'warn' | 'error'> = {
        0: 'info',
        1: 'info',
        2: 'warn',
        3: 'error',
      };
      this.consoleLogs.push({
        timestamp: Date.now(),
        level: levelMap[level] ?? 'info',
        text: message,
        sourceUrl: sourceId,
        lineNumber: line,
      });
      if (this.consoleLogs.length > this.MAX_LOGS) {
        this.consoleLogs.shift();
      }
    });

    if (opts.url) {
      await this.navigate(opts.url, this.currentTargetMode, this.allowedLoopbackPort);
    }
  }

  async navigate(url: string, targetMode?: 'remote_web' | 'local_dev', port?: number): Promise<void> {
    if (!this.window || this.window.isDestroyed()) {
      await this.launch({ url, targetMode, allowedLoopbackPort: port });
      return;
    }
    this.currentTargetMode = targetMode ?? this.currentTargetMode;
    this.allowedLoopbackPort = port ?? this.allowedLoopbackPort;
    await this.window.loadURL(url);
  }

  async captureScreenshot(quality = 80): Promise<{
    dataUrl: string;
    url: string;
    title: string;
    viewport: { width: number; height: number };
  }> {
    if (!this.window || this.window.isDestroyed()) {
      throw new Error('Browser is not launched');
    }
    const nativeImg: NativeImage = await this.window.webContents.capturePage();
    const jpegBuffer = nativeImg.toJPEG(quality);
    const bounds = this.window.getBounds();
    return {
      dataUrl: `data:image/jpeg;base64,${jpegBuffer.toString('base64')}`,
      url: this.window.webContents.getURL(),
      title: this.window.webContents.getTitle(),
      viewport: { width: bounds.width, height: bounds.height },
    };
  }

  async click(coordinate?: { x: number; y: number }, selector?: string): Promise<void> {
    if (!this.window || this.window.isDestroyed()) throw new Error('Browser is not launched');

    let x = coordinate?.x;
    let y = coordinate?.y;

    if (selector && (x === undefined || y === undefined)) {
      const rect = await this.window.webContents.executeJavaScript(`
        (() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
        })()
      `);
      if (!rect) throw new Error(`Element matching selector "${selector}" not found`);
      x = rect.x;
      y = rect.y;
    }

    if (x === undefined || y === undefined) throw new Error('No coordinate or matching element to click');

    this.window.webContents.sendInputEvent({ type: 'mouseMove', x, y });
    this.window.webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
    this.window.webContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
  }

  async type(text: string, selector?: string, submit = false, clear = false): Promise<void> {
    if (!this.window || this.window.isDestroyed()) throw new Error('Browser is not launched');

    if (selector) {
      await this.click(undefined, selector);
      if (clear) {
        await this.window.webContents.executeJavaScript(`
          (() => {
            const el = document.querySelector(${JSON.stringify(selector)});
            if (el && 'value' in el) el.value = '';
          })()
        `);
      }
    }

    for (const char of text) {
      this.window.webContents.sendInputEvent({ type: 'char', keyCode: char });
    }

    if (submit) {
      this.window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
      this.window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });
    }
  }

  async scroll(deltaX = 0, deltaY = 0): Promise<void> {
    if (!this.window || this.window.isDestroyed()) throw new Error('Browser is not launched');
    this.window.webContents.sendInputEvent({ type: 'mouseWheel', x: 100, y: 100, deltaX, deltaY });
  }

  getConsoleLogs(level?: 'all' | 'error' | 'warn' | 'info', clear = false): ConsoleMessageEntry[] {
    const filtered = level && level !== 'all'
      ? this.consoleLogs.filter((l) => l.level === level)
      : [...this.consoleLogs];
    if (clear) this.consoleLogs = [];
    return filtered;
  }

  async close(): Promise<void> {
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy();
      this.window = null;
    }
    const customSession = electronSession.fromPartition(this.partitionId);
    await customSession.clearStorageData();
    this.consoleLogs = [];
  }
}
```

### 7.2 Phased Rollout Plan

1. **Phase 1: Interceptor & Ephemeral Session Engine**
   - Implement `src/main/managers/browser/ssrfBrowserInterceptor.ts`.
   - Implement `src/main/managers/browser/BrowserSession.ts` with offscreen `BrowserWindow` creation, `webRequest` filter, and `ConsoleLogBuffer`.
   - Add unit tests validating `SsrfBrowserInterceptor` against private IPs, IPv6-mapped IPv4, cloud metadata IPs, and loopback in both `remote_web` and `local_dev` modes.

2. **Phase 2: Native Tool Registration & Executor Integration**
   - Author `src/main/managers/agent/native/tools/browserAction.ts`.
   - Register `browser_action` in `NATIVE_TOOLS` and `NATIVE_TOOL_GROUPS` (`browser_action: 'browser'`).
   - Wire `BrowserActionManager` into `NativeToolExecutionContext`.

3. **Phase 3: Layer 2 Permission & AgentManager Integration**
   - Add `browser_action` risk mapping in `classifyTool()` and `decideToolUseCore()`.
   - Render interactive permission card with target URL, domain badge, and security validation details.

4. **Phase 4: Live Viewport Thumbnail & UI Integration**
   - Wire `IpcEvents.browserThumbnailUpdated` to UI activity drawer.
   - Comprehensive L0–L3 verification suite.

---

## 8. Verification & Test Plan (Ladder L0–L3)

Following the canonical ZEUS verification ladder (`docs/development/verification.md`):

- **L0: Static Analysis & Security Gate**
  - Run `npm run typecheck` to verify strict TypeScript types.
  - Verify `ci/scripts/check-electron-security.mjs` passes (asserting `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`).
- **L1: Unit Verification of SSRF Interceptor**
  - Verify `169.254.169.254`, `::ffff:169.254.169.254`, and `fd00:ec2::254` are cancelled immediately in both `remote_web` and `local_dev`.
  - Verify subresource requests (`image`, `script`, `iframe`) to `10.0.0.1` and `192.168.1.1` are rejected in `remote_web`.
  - Verify HTTP 302 redirects to internal IP addresses are blocked before the subsequent connection.
  - Verify loopback requests on unapproved ports are rejected in `local_dev`.
- **L2: Headless Browser Action Simulation**
  - Verify `launch` creates an offscreen BrowserWindow without opening an OS window frame.
  - Verify `screenshot` generates bounded JPEG data URLs.
  - Verify `click`, `type`, `scroll` dispatch accurate synthetic input events.
  - Verify `get_console_logs` returns formatted console log entries and enforces the 500-message ceiling.
  - Verify `close` cleans up all partition memory and destroys the window.
- **L3: End-to-End Native Agent Test**
  - Execute a native agent turn calling `browser_action` with `launch` against a mock local HTTP server.
  - Confirm Layer 1 mode gating restricts `browser_action` when active mode omits `'browser'`.
