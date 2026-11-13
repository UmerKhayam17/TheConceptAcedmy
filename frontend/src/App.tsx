import { Suspense, lazy, useEffect } from "react";
import AcademyLoader from "@/components/AcademyLoader";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getSession, USER_KEY } from "@/lib/auth";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

const Layout = lazy(() => import("./components/Layout"));
const PanelLayout = lazy(() => import("./components/PanelLayout"));
const Index = lazy(() => import("./pages/Index"));
const About = lazy(() => import("./pages/About"));
const InstitutionPage = lazy(() => import("./pages/InstitutionPage"));
const Admissions = lazy(() => import("./pages/Admissions"));
const Programs = lazy(() => import("./pages/Programs"));
const Faculty = lazy(() => import("./pages/Faculty"));
const Achievements = lazy(() => import("./pages/Achievements"));
const Contact = lazy(() => import("./pages/Contact"));
const Login = lazy(() => import("./pages/Login"));
const Panel = lazy(() => import("./pages/Panel"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: 1,
    },
  },
});

function RouteFallback() {
  return (
    <AcademyLoader
      web={
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
          Loading…
        </div>
      }
    />
  );
}

/**
 * Cached API data belongs to the user who fetched it. When that user signs out (here or in
 * another tab, or the session expires) or a different user signs in, drop the whole cache so
 * the next person on this device never sees the previous user's fees, children, messages, etc.
 */
function ClearCacheOnUserChange() {
  useEffect(() => {
    let lastUserId: string | null = getSession()?.id ?? null;
    const check = () => {
      const userId = getSession()?.id ?? null;
      if (userId === lastUserId) return;
      const hadUser = lastUserId !== null;
      lastUserId = userId;
      if (hadUser) queryClient.clear();
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === USER_KEY) check();
    };
    window.addEventListener("tces-auth-change", check);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("tces-auth-change", check);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return null;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ClearCacheOnUserChange />
    <TooltipProvider delayDuration={300}>
      <Toaster />
      <Sonner />
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Index />} />
              <Route path="/about" element={<About />} />
              <Route path="/institutions/:slug" element={<InstitutionPage />} />
              <Route path="/programs" element={<Programs />} />
              <Route path="/admissions" element={<Admissions />} />
              <Route path="/faculty" element={<Faculty />} />
              <Route path="/achievements" element={<Achievements />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="*" element={<NotFound />} />
            </Route>

            <Route path="/login" element={<Login />} />
            <Route element={<PanelLayout />}>
              <Route path="/panel/:role" element={<Panel />} />
              <Route path="/panel/:role/:slug/:section/:action/:subAction" element={<Panel />} />
              <Route path="/panel/:role/:slug/:section/:action" element={<Panel />} />
              <Route path="/panel/:role/:slug/:section" element={<Panel />} />
              <Route path="/panel/:role/:slug" element={<Panel />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
