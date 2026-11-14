import { Suspense, lazy, useEffect } from "react";
import AcademyLoader from "@/components/AcademyLoader";
import AppApkUpdateNotice from "@/components/AppApkUpdateNotice";
import PushNotificationSetup from "@/components/PushNotificationSetup";
import { QueryClient, type Query } from "@tanstack/react-query";
import { PersistQueryClientProvider, removeOldestQuery } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
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

/**
 * Instant screens: the data each screen loaded last time is saved on the device
 * (localStorage, one copy per signed-in user) and shown immediately on the next open, while
 * the screen refreshes it from the server in the background (anything older than 30 s is
 * refetched). The copy is deleted on logout / user change (ClearCacheOnUserChange below).
 * Chat messages and searches are not saved (they change constantly and can be large).
 */
const DATA_CACHE_KEY = "tca-data-cache";
const DATA_CACHE_MAX_AGE = 24 * 60 * 60_000;
const dataCacheKeyFor = (userId: string | null | undefined) => `${DATA_CACHE_KEY}:${userId ?? "signed-out"}`;

const dataCachePersister = createSyncStoragePersister({
  key: DATA_CACHE_KEY,
  throttleTime: 1000,
  retry: removeOldestQuery, // storage full: drop the oldest screens' data and try again
  storage:
    typeof window === "undefined"
      ? undefined
      : {
          // Always read/write the copy of whoever is signed in right now.
          getItem: () => {
            try {
              return window.localStorage.getItem(dataCacheKeyFor(getSession()?.id));
            } catch {
              return null;
            }
          },
          setItem: (_key: string, value: string) => window.localStorage.setItem(dataCacheKeyFor(getSession()?.id), value),
          removeItem: () => {
            try {
              window.localStorage.removeItem(dataCacheKeyFor(getSession()?.id));
            } catch {
              /* storage unavailable */
            }
          },
        },
});

function shouldSaveQuery(query: Query) {
  if (query.state.status !== "success") return false;
  const key = query.queryKey.map((part) => (typeof part === "string" ? part.toLowerCase() : ""));
  if (key[0] === "chat" && key[1] !== "conversations") return false; // messages, media, search
  return !key.some((part) => part.includes("search"));
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Must outlive the saved copy, or screens not opened recently drop out of it.
      gcTime: DATA_CACHE_MAX_AGE,
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
      const previousUserId = lastUserId;
      lastUserId = userId;
      if (hadUser) {
        queryClient.clear();
        // Also delete the previous user's saved copy on this device.
        try {
          window.localStorage.removeItem(dataCacheKeyFor(previousUserId));
        } catch {
          /* storage unavailable */
        }
      }
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
  <PersistQueryClientProvider
    client={queryClient}
    persistOptions={{
      persister: dataCachePersister,
      maxAge: DATA_CACHE_MAX_AGE,
      buster: "v1",
      dehydrateOptions: { shouldDehydrateQuery: shouldSaveQuery },
    }}
  >
    <ClearCacheOnUserChange />
    <TooltipProvider delayDuration={300}>
      <Toaster />
      <Sonner />
      <AppApkUpdateNotice />
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <PushNotificationSetup />
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
  </PersistQueryClientProvider>
);

export default App;
