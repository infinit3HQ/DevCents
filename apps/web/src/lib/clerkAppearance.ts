import { shadcn } from "@clerk/ui/themes";

/**
 * Clerk follows the app's own design tokens: the shadcn base theme reads
 * --background, --card, --primary, --border, --muted-foreground etc. from
 * app.css, so a token change there restyles sign-in and the user menu too.
 * The overrides below add the terminal look the base theme doesn't cover:
 * mono type, square corners, uppercase tracked labels and buttons.
 */
const label = {
  fontFamily: "var(--font-mono)",
  fontSize: "10px",
  textTransform: "uppercase",
  letterSpacing: "0.2em",
  color: "var(--muted-foreground)",
} as const;

const button = {
  fontFamily: "var(--font-mono)",
  fontSize: "11px",
  textTransform: "uppercase",
  letterSpacing: "0.18em",
  borderRadius: 0,
  height: "2.75rem",
} as const;

export const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  variables: {
    fontFamily: "var(--font-mono)",
    fontFamilyButtons: "var(--font-mono)",
    borderRadius: "0rem",
    colorModalBackdrop: "rgb(0 0 0 / 0.6)",
  },
  elements: {
    modalBackdrop: { backdropFilter: "blur(4px)" },
    cardBox: { borderRadius: 0, boxShadow: "0 30px 80px -20px rgb(0 0 0 / 0.6)" },
    card: { borderRadius: 0 },
    headerTitle: {
      fontFamily: "var(--font-mono)",
      fontSize: "1rem",
      textTransform: "uppercase",
      letterSpacing: "0.2em",
    },
    headerSubtitle: { fontFamily: "var(--font-sans)", color: "var(--muted-foreground)" },
    formFieldLabel: label,
    dividerText: label,
    formButtonPrimary: button,
    socialButtonsBlockButton: { ...button, textTransform: "none", letterSpacing: "0.02em" },
    formFieldInput: { borderRadius: 0, height: "2.75rem", fontFamily: "var(--font-mono)" },
    otpCodeFieldInput: { borderRadius: 0 },
    footerActionLink: { color: "var(--primary)" },
    userButtonPopoverCard: { borderRadius: 0 },
    userButtonPopoverActionButton: { fontFamily: "var(--font-mono)", fontSize: "12px" },
    avatarBox: { borderRadius: 0 },
    badge: { borderRadius: 0, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.15em" },
  },
};
