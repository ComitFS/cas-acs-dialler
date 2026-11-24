import { createRelaySasToken } from "./crypto.js";

export class RelayListener {
  constructor({ ns, entity, keyName, key, onEvents, onStatus, onLog }) {
    this.ns = ns;
    this.entity = entity;
    this.keyName = keyName;
    this.key = key;
    this.onEvents = onEvents;
    this.onStatus = onStatus;
    this.onLog = onLog;
    this.controlWs = null;
    this.pingTimer = null;
  }

  async connect() {
    const resourceUri = `http://${this.ns}/${this.entity}`;
    const token = encodeURIComponent(await createRelaySasToken(resourceUri, this.keyName, this.key));
    const listenUrl = `wss://${this.ns}/$hc/${this.entity}?sb-hc-action=listen&sb-hc-token=${token}`;

    if (this.controlWs) this.controlWs.close();
    this.controlWs = new WebSocket(listenUrl);

    this.controlWs.onopen = () => {
      this.onLog(`Connected to Azure Relay listener: https://${this.ns}/${this.entity}`);
      this.onStatus(true);
      clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => {
        if (this.controlWs.readyState === WebSocket.OPEN) {
          this.controlWs.send(JSON.stringify({ ping: {} }));
        }
      }, 25000);
    };

    this.controlWs.onmessage = async (evt) => {
      const raw = evt.data instanceof Blob ? await evt.data.text() : evt.data;
      const msg = JSON.parse(raw);
      if (msg.accept) this.handleRendezvous(msg.accept);
    };


    this.controlWs.onerror = (err) => this.onLog(`Relay WebSocket error: ${JSON.stringify(err)}`);
    this.controlWs.onclose = (e) => {
      this.onLog(`Relay listener closed (code ${e.code})`);
      this.onStatus(false);
    };
  }

  handleRendezvous(acceptMeta) {
    this.onLog(`Rendezvous opened: ${acceptMeta.id}`);
    const rdvWs = new WebSocket(acceptMeta.address);
    rdvWs.binaryType = "arraybuffer";
    let requestMeta = null;

    rdvWs.onmessage = async (evt) => {
      // Frame 1: Text/JSON control envelope describing the HTTP request
      if (!requestMeta) {
        const metaText = typeof evt.data === "string" ? evt.data : new TextDecoder().decode(evt.data);
        const parsed = JSON.parse(metaText);
        if (parsed.request) {
          requestMeta = parsed.request;
          this.onLog(`Relay HTTP ${requestMeta.method} ${requestMeta.requestTarget}`);
          if (!requestMeta.body) {
            this.sendRelayHttpResponse(rdvWs, requestMeta.id, 200);
          }
          return;
        }
      }

      // Frame 2: Binary body containing the ACS CloudEvents JSON array
      const bodyText = typeof evt.data === "string" ? evt.data : new TextDecoder().decode(evt.data);
      this.sendRelayHttpResponse(rdvWs, requestMeta.id, 200);

      try {
        const events = JSON.parse(bodyText);
        await this.onEvents(Array.isArray(events) ? events : [events]);
      } catch (err) {
        this.onLog(`Failed to parse ACS body: ${err.message} | Raw: ${bodyText}`);
      }
    };
  }

  sendRelayHttpResponse(rdvWs, requestId, statusCode) {
    const envelope = JSON.stringify({
      response: {
        id: requestId,
        statusCode,
        statusDescription: "OK",
        headers: { "Content-Type": "application/json" },
        body: false
      }
    });
    rdvWs.send(envelope);
    rdvWs.close();
  }

}
