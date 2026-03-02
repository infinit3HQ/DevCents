import { createFileRoute } from "@tanstack/react-router";
import {
  SignedIn,
  SignedOut,
  RedirectToSignIn,
} from "@clerk/tanstack-react-start";
import { Settings } from "@/components/Settings";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
      <SignedIn>
        <Settings />
      </SignedIn>
    </>
  );
}
