import { SignUpButton } from "@clerk/tanstack-react-start";
import { ArrowRight, Github, Twitter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { REPO_URL, Reveal, SELF_HOST_URL } from "./primitives";

const TWITTER_URL = "https://twitter.com/Niraj_Dilshan";

export function FinalCta() {
  return (
    <section className="relative border-t border-border overflow-hidden">
      <div className="absolute inset-0 -z-10 dot-grid opacity-30 [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]" />
      <Reveal className="mx-auto max-w-3xl px-4 md:px-8 py-24 md:py-32 text-center">
        <p className="font-mono text-xs text-muted-foreground">
          <span className="text-primary">$</span> devcents init
        </p>
        <h2 className="mt-5 text-3xl md:text-5xl font-semibold tracking-tight text-balance">
          Start tracking in under a minute.
        </h2>
        <p className="mt-4 font-sans text-muted-foreground">
          Free and open source. Use it here, or run your own copy.
        </p>
        <div className="mt-9 flex flex-col sm:flex-row justify-center gap-3">
          <SignUpButton mode="modal">
            <Button size="lg" className="group">
              Create account
              <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
            </Button>
          </SignUpButton>
          <Button
            asChild
            size="lg" variant="outline"
          >
            <a href={SELF_HOST_URL} target="_blank" rel="noopener noreferrer">
              Self-hosting guide
            </a>
          </Button>
        </div>
      </Reveal>
    </section>
  );
}

export function LandingFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto max-w-6xl px-4 md:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-[11px] text-muted-foreground">
        <p>
          <span className="text-primary">&gt;_</span> dev<span className="text-primary">cents</span>
          <span className="mx-2 text-border">·</span>© {new Date().getFullYear()} infinit3HQ · AGPL-3.0
        </p>
        <nav className="flex items-center gap-5">
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-primary transition-colors">
            <Github className="h-3.5 w-3.5" /> source
          </a>
          <a href={TWITTER_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-primary transition-colors">
            <Twitter className="h-3.5 w-3.5" /> updates
          </a>
        </nav>
      </div>
    </footer>
  );
}
