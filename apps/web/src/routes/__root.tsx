import { ClerkProvider } from "@clerk/tanstack-react-start";
import { shadcn } from "@clerk/themes";
import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";
import React from "react";

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
        title: "DevCents — Self-hosted Money Management",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
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
      publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}
      appearance={{
        theme: shadcn,
      }}
    >
      <html lang="en" className="dark">
        <head>
          <HeadContent />
        </head>
        <body>
          <ConvexClientProvider>
            <CurrencyProvider>
              <EncryptionProvider>
                <Header />
                <CommandPalette />
                {children}
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
