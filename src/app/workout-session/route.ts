// Direct same-origin alias for session mutations. The service worker only
// intercepts /api/* writes, so this is a network-first retry path when an old
// worker returns a stale synthetic session response.
export {
  POST,
  PATCH,
  DELETE,
} from "@/app/api/workout/sessions/route";
