import type { Location } from "react-router-dom";

/** Bottom nav: Home — feed index only */
export function isBottomNavHome({ pathname }: Location): boolean {
  return pathname === "/";
}

/** Bottom nav: Create post */
export function isBottomNavCreate({ pathname }: Location): boolean {
  return pathname === "/create";
}

/** Bottom nav: Kept saves — own profile with ?tab=kept */
export function isBottomNavKeeps({ pathname, search }: Location): boolean {
  return pathname === "/profile" && new URLSearchParams(search).get("tab") === "kept";
}

/** Bottom nav: Profile — own profile (not Kept tab) and profile sub-pages */
export function isBottomNavProfile({ pathname, search }: Location): boolean {
  if (pathname === "/profile") {
    return new URLSearchParams(search).get("tab") !== "kept";
  }
  return pathname === "/profile/scheduled" || pathname === "/profile/sounds";
}

/** Bottom nav: Admin dashboard */
export function isBottomNavAdmin({ pathname }: Location): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

/** Bottom nav: Messages — messenger list or chat is open */
export function isBottomNavMessages(messengerOpen: boolean): boolean {
  return messengerOpen;
}
