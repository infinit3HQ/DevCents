import { SignedOut, SignedIn } from '@clerk/tanstack-react-start';
import { createFileRoute } from '@tanstack/react-router';
import { LandingPage } from '@/components/LandingPage';
import { Dashboard } from '@/components/Dashboard';

export const Route = createFileRoute('/')({
  component: Home,
});

function Home() {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <SignedOut>
        <LandingPage />
      </SignedOut>
      <SignedIn>
        <Dashboard />
      </SignedIn>
    </div>
  );
}
