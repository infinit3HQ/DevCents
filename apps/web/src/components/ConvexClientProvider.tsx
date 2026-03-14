import { useAuth } from "@clerk/tanstack-react-start";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ReactNode } from "react";
import { getEnv } from "@/lib/env";

const convexUrl = getEnv("VITE_CONVEX_URL");
if (!convexUrl) {
  console.warn("Convex URL is not set.");
}
const convex = new ConvexReactClient(convexUrl || "https://placeholder-if-missing.convex.cloud");

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  console.log("ConvexClientProvider rendering...");
  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      {children}
    </ConvexProviderWithClerk>
  );
}
