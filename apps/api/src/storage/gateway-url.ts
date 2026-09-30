import { apiPublicUrl } from "./google.js";

// Where the streaming gateway answers (docs/structure.md §9.16).
//
// By default it runs inside the API process, under a hard monthly byte budget sized for
// a free host. Setting STREAM_GATEWAY_URL points tickets at a gateway running as its own
// service instead (apps/api/src/stream-server.ts), which is how real traffic should run.

export function gatewayIsExternal(): boolean {
  return !!process.env.STREAM_GATEWAY_URL?.trim();
}

export function gatewayBase(): string {
  return (process.env.STREAM_GATEWAY_URL?.trim() || apiPublicUrl()).replace(/\/+$/, "");
}

export function gatewayUrl(path: string): string {
  return `${gatewayBase()}${path}`;
}
