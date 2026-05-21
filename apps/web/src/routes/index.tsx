import { Show } from '@clerk/tanstack-react-start';
import { createFileRoute } from '@tanstack/react-router';
import { LandingPage } from '@/components/LandingPage';
import { Dashboard } from '@/components/Dashboard';

export const Route = createFileRoute('/')({
  component: Home,
});

function Home() {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <Show when="signed-out">
        <LandingPage />
      </Show>
      <Show when="signed-in">
        <Dashboard />
      </Show>
    </div>
  );
}
