import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export const TOKEN_EXPIRY_OPTIONS = [
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "1 year" },
] as const;

export function TokenExpiryLabel({ expiresAt }: { expiresAt: number | null }) {
  if (expiresAt === null) return <span className="text-amber-500">never expires</span>;
  if (expiresAt < Date.now()) return <span className="text-destructive">expired</span>;
  return <span>expires {new Date(expiresAt).toLocaleDateString()}</span>;
}

/** Apps the user connected through OAuth, with a way to disconnect each one. */
export function OAuthGrantsList() {
  const grants = useQuery(api.oauth.listGrants) ?? [];
  const revoke = useMutation(api.oauth.revokeGrant);

  if (grants.length === 0) return null;

  return (
    <div className="mt-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-2">
        connected apps (oauth)
      </p>
      <div className="border border-border">
        {grants.map((g, idx) => (
          <div
            key={g._id}
            className={cn(
              "flex items-center justify-between gap-3 p-3 bg-card",
              idx < grants.length - 1 && "border-b border-border",
            )}
          >
            <div className="min-w-0">
              <p className="font-mono text-[11px] text-foreground truncate">{g.clientName}</p>
              <p className="font-mono text-[10px] text-muted-foreground mt-0.5 break-all">
                {g.redirectHost ?? "unknown redirect"} · connected{" "}
                {new Date(g.grantedAt).toLocaleDateString()} · access ends{" "}
                {new Date(g.expiresAt).toLocaleDateString()}
                {g.hasKey ? " · can decrypt" : ""}
              </p>
            </div>
            <Button variant="link" size="inline"
              onClick={() => revoke({ id: g._id })}
              className="text-destructive shrink-0">
              disconnect
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
