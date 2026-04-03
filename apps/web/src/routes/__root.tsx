import { ClerkProvider } from "@clerk/tanstack-react-start";
import { shadcn } from "@clerk/themes";
import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";
import React from "react";
import { getEnv } from "@/lib/env";

const Devtools = import.meta.env.PROD 
  ? () => null 
  : React.lazy(() => 
      Promise.all([
        import('@tanstack/react-devtools'),
        import('@tanstack/react-router-devtools')
      ]).then(([reactDevtools, routerDevtools]) => {
        return {
          default: () => (
            <reactDevtools.TanStackDevtools
              config={{ position: "bottom-right" }}
              plugins={[
                {
                  name: "Tanstack Router",
                  render: <routerDevtools.TanStackRouterDevtoolsPanel />,
                },
              ]}
            />
          )
        };
      })
    );

import Header from "../components/Header";
import { ConvexClientProvider } from "../components/ConvexClientProvider";
import { CommandPalette } from "../components/CommandPalette";
import { EncryptionProvider } from "../components/EncryptionProvider";
import { CurrencyProvider } from "../contexts/CurrencyContext";
import appCss from "../app.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "DevCents — Self-hosted, Privacy-first Personal Finance",
      },
      {
        name: "description",
        content:
          "Self-hosted personal finance app with client-side encryption. Track expenses, manage budgets, and keep your money data private on your own server.",
      },
      {
        name: "theme-color",
        content: "#09090b",
      },

      // Open Graph
      {
        property: "og:type",
        content: "website",
      },
      {
        property: "og:title",
        content: "DevCents — Self-hosted, Privacy-first Personal Finance",
      },
      {
        property: "og:description",
        content:
          "Track expenses with AES-256 client-side encryption. Your money data stays on your server, visible only to you.",
      },
      {
        property: "og:image",
        content: "/logo512.png",
      },
      {
        property: "og:site_name",
        content: "DevCents",
      },

      // Twitter
      {
        name: "twitter:card",
        content: "summary",
      },
      {
        name: "twitter:title",
        content: "DevCents — Self-hosted Personal Finance",
      },
      {
        name: "twitter:description",
        content:
          "Privacy-first expense tracking with client-side encryption. Self-host with one Docker command.",
      },
      {
        name: "twitter:image",
        content: "/logo512.png",
      },

      // Additional SEO
      {
        name: "robots",
        content: "index, follow",
      },
      {
        name: "author",
        content: "infinit3HQ",
      },
      {
        name: "keywords",
        content:
          "personal finance, self-hosted, expense tracker, budget, privacy, encryption, open source, docker",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "icon",
        href: "/favicon.ico",
        type: "image/x-icon",
      },
      {
        rel: "apple-touch-icon",
        href: "/logo192.png",
      },
      {
        rel: "manifest",
        href: "/manifest.json",
      },
    ],
  }),

  shellComponent: RootDocument,
  notFoundComponent: NotFound,
});

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] p-8 gap-4 text-center">
      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-2">
        <span className="font-mono text-2xl">404</span>
      </div>
      <h2 className="text-xl font-mono text-foreground uppercase tracking-widest">
        Page Not Found
      </h2>
      <p className="text-sm font-mono text-muted-foreground mt-2">
        The location you are trying to visit was not found.
      </p>
      <a
        href="/"
        className="mt-6 px-4 py-2 font-mono text-[11px] uppercase tracking-widest transition-colors hover:bg-primary/20 border border-primary/30 text-primary bg-primary/10"
      >
        return home
      </a>
    </div>
  );
}

console.log("Root module executing...");

function RootDocument({ children }: { children: React.ReactNode }) {
  console.log("RootDocument rendering...");
  
  React.useEffect(() => {
    console.log("RootDocument mounted (hydration complete)");
    // Failsafe: if animations are stuck, force visibility after 2 seconds
    const timer = setTimeout(() => {
      document.body.style.opacity = "1";
      const hero = document.querySelector('h1');
      if (hero) hero.style.opacity = "1";
      console.log("Failsafe visibility triggered");
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <ClerkProvider
      publishableKey={getEnv("VITE_CLERK_PUBLISHABLE_KEY")}
      appearance={{
        baseTheme: shadcn,
        variables: {
          colorPrimary: "oklch(0.75 0.15 142)",
          colorBackground: "oklch(0.2 0 0)",
          colorText: "oklch(0.9 0.02 120)",
          colorTextSecondary: "oklch(0.5 0 0)",
          colorInputBackground: "oklch(0.18 0 0)",
          colorInputText: "oklch(0.9 0.02 120)",
          colorNeutral: "oklch(0.9 0.02 120)",
          colorDanger: "oklch(0.6 0.2 25)",
          borderRadius: "0.375rem",
          fontFamily: "Inter, system-ui, sans-serif",
        },
        elements: {
          rootBox: {
            fontFamily: "Inter, system-ui, sans-serif",
          },
          card: {
            backgroundColor: "oklch(0.2 0 0)",
            border: "1px solid oklch(0.26 0 0)",
            boxShadow: "0 4px 24px rgb(0 0 0 / 0.4)",
            borderRadius: "0.75rem",
          },
          modalBackdrop: {
            background: "rgb(0 0 0 / 0.6)",
            backdropFilter: "blur(4px)",
          },
          headerTitle: {
            color: "oklch(0.9 0.02 120)",
          },
          headerSubtitle: {
            color: "oklch(0.5 0 0)",
          },
          socialButtonsBlockButton: {
            backgroundColor: "transparent",
            border: "1px solid oklch(0.26 0 0)",
            color: "oklch(0.9 0.02 120)",
            borderRadius: "0.375rem",
          },
          dividerLine: {
            backgroundColor: "oklch(0.26 0 0)",
          },
          dividerText: {
            color: "oklch(0.5 0 0)",
          },
          formFieldLabel: {
            color: "oklch(0.5 0 0)",
          },
          formFieldInput: {
            backgroundColor: "oklch(0.18 0 0)",
            border: "1px solid oklch(0.26 0 0)",
            color: "oklch(0.9 0.02 120)",
            borderRadius: "0.375rem",
          },
          formButtonPrimary: {
            backgroundColor: "oklch(0.75 0.15 142)",
            color: "oklch(0.18 0 0)",
            borderRadius: "0.375rem",
            fontWeight: "500",
          },
          footerActionLink: {
            color: "oklch(0.75 0.15 142)",
          },
          footerActionText: {
            color: "oklch(0.5 0 0)",
          },
          footer: {
            background: "transparent",
          },
          userButtonPopoverCard: {
            backgroundColor: "oklch(0.2 0 0)",
            border: "1px solid oklch(0.26 0 0)",
            borderRadius: "0.75rem",
          },
          userButtonPopoverActionButton: {
            borderRadius: "0",
          },
          userPreview: {
            padding: "0.75rem 1rem",
          },
          userProfile: {
            fontFamily: "Inter, system-ui, sans-serif",
          },
        },
      }}
    >
      <html lang="en" className="dark h-full">
        <head>
          <HeadContent />
        </head>
        <body className="h-full">
          <ConvexClientProvider>
            <CurrencyProvider>
              <EncryptionProvider>
                <div className="flex flex-col h-full overflow-hidden">
                  <Header />
                  <CommandPalette />
                  <main className="flex-1 overflow-hidden flex flex-col">
                    {children}
                  </main>
                </div>
              </EncryptionProvider>
            </CurrencyProvider>
          </ConvexClientProvider>
          <React.Suspense fallback={null}>
            <Devtools />
          </React.Suspense>
          <Scripts />
        </body>
      </html>
    </ClerkProvider>
  );
}
