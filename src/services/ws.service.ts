import crypto from "crypto";
import http from "http";
import { logger } from "../utils/logger";

export interface MigrationWsMessage {
  event?:
    | "job.queued"
    | "job.started"
    | "job.progress"
    | "job.stage_changed"
    | "job.paused"
    | "job.resumed"
    | "job.retrying"
    | "job.completed"
    | "job.failed"
    | "job.cancelled";
  type?: string;
  jobId: string;
  status?: string;
  stage?: string;
  progress?: number;
  processedFiles?: number;
  totalFiles?: number;
  message?: string;
  file?: string;
  speed?: string;
  log?: string;
  data?: any;
}

interface ClientConnection {
  id: string;
  socket: any;
  jobId?: string;
  workspaceId?: string;
  userId?: string;
}

export class WebSocketService {
  private clients: Map<string, ClientConnection> = new Map();

  /**
   * Attach WebSocket server to an existing Node.js HTTP server
   */
  public attach(server: http.Server) {
    server.on("upgrade", (req, socket, head) => {
      const url = req.url || "";
      if (!url.startsWith("/ws/migration")) {
        socket.destroy();
        return;
      }

      const key = req.headers["sec-websocket-key"];
      if (!key) {
        socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
        socket.destroy();
        return;
      }

      // Extract query params e.g. /ws/migration?jobId=xxx&workspaceId=yyy
      const queryStr = url.includes("?") ? url.split("?")[1] : "";
      const searchParams = new URLSearchParams(queryStr);
      const jobId = searchParams.get("jobId") || undefined;
      const workspaceId = searchParams.get("workspaceId") || undefined;
      const userId = searchParams.get("userId") || undefined;

      // RFC6455 Handshake
      const acceptKey = crypto
        .createHash("sha1")
        .update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
        .digest("base64");

      const responseHeaders = [
        "HTTP/1.1 101 Switching Protocols",
        "Upgrade: websocket",
        "Connection: Upgrade",
        `Sec-WebSocket-Accept: ${acceptKey}`,
        "\r\n"
      ].join("\r\n");

      socket.write(responseHeaders);

      const clientId = `client_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const client: ClientConnection = { id: clientId, socket, jobId, workspaceId, userId };
      this.clients.set(clientId, client);

      logger.info(`WebSocket client connected (${clientId}) [jobId: ${jobId || "all"}, workspaceId: ${workspaceId || "all"}]`);

      // Handle socket incoming data (Ping/Pong/Close)
      socket.on("data", (buffer: Buffer) => {
        this.handleFrame(client, buffer);
      });

      socket.on("close", () => {
        this.clients.delete(clientId);
        logger.info(`WebSocket client disconnected (${clientId})`);
      });

      socket.on("error", (err: any) => {
        logger.warn(`WebSocket client socket error (${clientId}): ${err.message}`);
        this.clients.delete(clientId);
      });
    });

    logger.info("Native WebSocket service attached to HTTP server at /ws/migration");
  }

  /**
   * Broadcast message to authorized WebSocket clients matching jobId or workspaceId
   */
  public broadcast(payload: MigrationWsMessage) {
    const formattedPayload = {
      event: payload.event || (payload.type ? `job.${payload.type}` : "job.progress"),
      jobId: payload.jobId,
      status: payload.status || "MIGRATING",
      stage: payload.stage || "processing",
      progress: payload.progress ?? 0,
      processedFiles: payload.processedFiles ?? 0,
      totalFiles: payload.totalFiles ?? 0,
      message: payload.message || payload.log || "",
      file: payload.file,
      speed: payload.speed,
      data: payload.data,
    };

    const jsonMessage = JSON.stringify(formattedPayload);
    const frame = this.createFrame(jsonMessage);

    for (const [clientId, client] of this.clients.entries()) {
      try {
        // Enforce workspace & job tenancy isolation
        const matchesJob = !client.jobId || client.jobId === payload.jobId;
        const matchesWorkspace = !client.workspaceId || !payload.data?.workspaceId || client.workspaceId === payload.data?.workspaceId;

        if (matchesJob && matchesWorkspace) {
          client.socket.write(frame);
        }
      } catch (err) {
        this.clients.delete(clientId);
      }
    }
  }

  /**
   * Encode text string into RFC6455 unmasked text frame (0x81)
   */
  private createFrame(text: string): Buffer {
    const payload = Buffer.from(text, "utf8");
    const len = payload.length;

    let header: Buffer;
    if (len <= 125) {
      header = Buffer.alloc(2);
      header[0] = 0x81; // FIN + text frame
      header[1] = len;  // No mask bit
    } else if (len <= 65535) {
      header = Buffer.alloc(4);
      header[0] = 0x81;
      header[1] = 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x81;
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(len), 2);
    }

    return Buffer.concat([header, payload]);
  }

  /**
   * Decode incoming client frame and handle ping / message
   */
  private handleFrame(client: ClientConnection, buffer: Buffer) {
    if (buffer.length < 2) return;

    const opacity = buffer[0] & 0x0f;
    // Opcode 0x8: Connection Close
    if (opacity === 0x8) {
      client.socket.end();
      this.clients.delete(client.id);
      return;
    }
    // Opcode 0x9: Ping -> Respond with Pong (0xa)
    if (opacity === 0x9) {
      const pongFrame = Buffer.from([0x8a, 0x00]);
      client.socket.write(pongFrame);
    }
  }
}

export const wsService = new WebSocketService();
