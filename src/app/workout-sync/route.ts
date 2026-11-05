// Direct network alias for workout sync. Keeps the idempotent replay path off
// the service worker's /api/* mutation interception so a stale worker can
// never fake a "synced" response.
export { POST } from "@/app/api/workout/sync/route";
