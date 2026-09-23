import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Layout from "./components/Layout";
import PanelLayout from "./components/PanelLayout";
import Index from "./pages/Index.tsx";
import About from "./pages/About.tsx";
import InstitutionPage from "./pages/InstitutionPage.tsx";
import Admissions from "./pages/Admissions.tsx";
import Programs from "./pages/Programs.tsx";
import Faculty from "./pages/Faculty.tsx";
import Achievements from "./pages/Achievements.tsx";
import Contact from "./pages/Contact.tsx";
import Login from "./pages/Login.tsx";
import Panel from "./pages/Panel.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: 1,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
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
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Route>

          {/* Auth & portal routes — no public navbar/footer */}
          <Route path="/login" element={<Login />} />
          <Route element={<PanelLayout />}>
            <Route path="/panel/:role" element={<Panel />} />
            <Route path="/panel/:role/:slug/:section/:action/:subAction" element={<Panel />} />
            <Route path="/panel/:role/:slug/:section/:action" element={<Panel />} />
            <Route path="/panel/:role/:slug/:section" element={<Panel />} />
            <Route path="/panel/:role/:slug" element={<Panel />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
