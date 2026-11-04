// Direct network alias for workout set mutations. The service worker's
// /api/* write interception remains available as the offline fallback.
export {
  POST,
  DELETE,
} from "@/app/api/workout/sets/route";
