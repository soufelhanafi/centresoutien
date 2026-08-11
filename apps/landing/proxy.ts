import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Run on every path except API routes, Next internals, root-level file
  // routes, and files with an extension (extensionless `/icon` would otherwise
  // be locale-prefixed to a 404; `/logo.png` is already excluded by `.*\..*`).
  matcher: "/((?!api|_next|_vercel|icon|.*\\..*).*)",
};
