import { useAuth } from "@clerk/tanstack-react-start";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ReactNode } from "react";

const convexUrl = import.meta.env.VITE_CONVEX_URL as string;
if (!convexUrl || convexUrl.includes("__VITE_")) {
  console.warn("Convex URL is not properly set or is still a placeholder:", convexUrl);
}
const convex = new ConvexReactClient(convexUrl || "https://placeholder-if-missing.convex.cloud");

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      {children}
    </ConvexProviderWithClerk>
  );
}
