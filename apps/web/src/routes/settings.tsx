import { createFileRoute } from "@tanstack/react-router";
import {
  Show,
  RedirectToSignIn,
} from "@clerk/tanstack-react-start";
import { Settings } from "@/components/Settings";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <>
      <Show when="signed-out">
        <RedirectToSignIn />
      </Show>
      <Show when="signed-in">
        <Settings />
      </Show>
    </>
  );
}
