import { useState } from "react";
import { Download, Share, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { promptPwaInstall } from "@/pwa";

const PwaInstallPrompt = () => {
  const { canInstall, installed, ios } = usePwaInstall();
  const { toast } = useToast();
  const [showIosSteps, setShowIosSteps] = useState(false);

  if (installed) {
    return (
      <p className="mb-6 text-center text-xs text-muted-foreground">
        You are using the installed app. It uses this same login and updates itself when the academy publishes a new version.
      </p>
    );
  }

  const onInstall = async () => {
    if (canInstall) {
      const outcome = await promptPwaInstall();
      if (outcome === "accepted") {
        toast({ title: "App installed", description: "Open The Concept Academy from your home screen." });
      }
      return;
    }
    if (ios) {
      setShowIosSteps(true);
      return;
    }
    toast({
      title: "Install from the browser",
      description: "Open the browser menu and choose Install app or Add to Home screen.",
    });
  };

  return (
    <div className="mb-5 rounded-xl border border-[#F0DFC0] bg-[#FFFBF2] p-[18px]">
      <div className="flex gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#D9A441]/15 text-[#C99028]">
          <Smartphone className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-semibold text-[#071426]">Get the academy app</p>
          <p className="mt-1 text-xs leading-relaxed text-[#4B5563]">
            Install this same portal on your phone. Sign-in, roles, and permissions stay exactly as they are here. Records come from the server, and a new version replaces itself on the phone.
          </p>
        </div>
      </div>
      <Button
        type="button"
        className="mt-3 h-12 w-full rounded-[9px] border-0 bg-[#D9A441] text-sm font-semibold text-white shadow-none transition-all duration-200 hover:bg-[#C99028]"
        onClick={() => void onInstall()}
      >
        <Download className="h-4 w-4" />
        Download and install
      </Button>
      {showIosSteps && (
        <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
          <Share className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          On iPhone or iPad, tap Share, then Add to Home Screen.
        </p>
      )}
    </div>
  );
};

export default PwaInstallPrompt;
