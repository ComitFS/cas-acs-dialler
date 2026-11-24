# ACS PSTN Call Automation — Static Browser POC

A zero-backend, client-side Proof of Concept (POC) hosted on GitHub Pages that places outbound PSTN calls, plays Azure AI Text-to-Speech (TTS) or WAV audio into live calls, and terminates connections directly from browser JavaScript using the **Azure Communication Services (ACS) Call Automation REST API**.

## Why This Architecture?
* **Zero Server Infrastructure:** Runs entirely as static ES modules (`HTML` / `CSS` / `JS`) on GitHub Pages without Node.js, Java, or serverless functions.
* **Firewall & Network Friendly:** Because ACS handles all PSTN voice/media traffic in the Azure cloud, no WebRTC, RTP, or UDP media ports are required on the client machine—only standard outbound HTTPS (`443`) REST requests.
* **Client-Side Security:** No connection strings, keys, or phone numbers are committed to the repository. All sensitive configuration is entered in the browser UI and persisted locally in `localStorage`.

---

## Project Structure

```text
├── index.html      # Clean day-theme UI for call parameters and manual controls
├── style.css       # Light-mode responsive styling and activity log layout
├── crypto.js       # Web Crypto API HMAC-SHA256 signing & connection string parser
├── app.js          # ACS Call Automation REST client (CreateCall, Play, Terminate)
└── README.md       # Project documentation
```

---

## Prerequisites

1. **Azure Communication Services (ACS) Resource** with an outbound-capable PSTN phone number (E.164 format).
2. **Azure AI / Cognitive Services Resource** linked to your ACS resource in the Azure Portal (**Settings → Cognitive Services**) for Text-to-Speech playback.
3. **CORS / Browser Origin Access:** Ensure your browser environment permits outbound HTTPS requests from your GitHub Pages origin (`https://<username>.github.io`) to `https://<resource>.communication.azure.com`.

---

## Usage

1. Open the deployed GitHub Pages URL (or serve locally over HTTP/HTTPS).
2. Enter your configuration details (automatically saved to `localStorage`):
   * **ACS Connection String:** `endpoint=https://<resource>://<key>`
   * **Azure AI / Cognitive Services Endpoint:** `https://<ai-resource>://`
   * **ACS Source PSTN Number:** Your ACS phone number in E.164 format (e.g., `+442079460000`)
   * **Target PSTN Number:** Destination phone number in E.164 format (e.g., `+447700900000`)
   * **Play Mode & Payload:** Choose **Text-to-Speech (TTS)** (with a Neural voice such as `en-GB-SoniaNeural`) or a public **WAV Audio File URL**.
3. Click **1. Place PSTN Call** and answer the incoming call on the target phone.
4. Click **2. Play TTS / Audio** to inject the spoken message or audio file into the active call.
5. Click **3. End Call** to terminate the call connection.
6. Use **Clear Storage** at any time to wipe all saved credentials from `localStorage`.

---

## Security Notes
* **Never commit secrets:** Keep connection strings and endpoints out of source control.
* **Shared devices:** Always click **Clear Storage** after testing on a shared workstation.

---

## Roadmap
* [x] Validate browser-native HMAC-SHA256 signing against ACS Call Automation REST API (`2024-09-15`)
* [x] Outbound PSTN call setup, Azure AI TTS playback, and call termination from static hosting
* [ ] Build full **Automated Dialler Dashboard** with CSV contact import, configurable safe timeout pacing (`Ring` → `Play` → `Terminate` → `Cooldown`), live progress tracking, and exportable call logs
