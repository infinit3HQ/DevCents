import { MotionConfig } from "framer-motion";
import { Hero } from "./landing/Hero";
import { Features } from "./landing/Features";
import { EncryptionDemo } from "./landing/EncryptionDemo";
import { McpDemo } from "./landing/McpDemo";
import { Comparison } from "./landing/Comparison";
import { FinalCta, LandingFooter } from "./landing/Closing";

export function LandingPage() {
  return (
    <MotionConfig reducedMotion="user">
      <div className="relative isolate flex-1 overflow-y-auto overflow-x-hidden">
        <Hero />
        <Features />
        <EncryptionDemo />
        <McpDemo />
        <Comparison />
        <FinalCta />
        <LandingFooter />
      </div>
    </MotionConfig>
  );
}
