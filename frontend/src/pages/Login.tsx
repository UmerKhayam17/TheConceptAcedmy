import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { z } from "zod";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarCheck,
  Eye,
  EyeOff,
  GraduationCap,
  Headset,
  Lock,
  Mail,
  MessageCircle,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { loginWithPassword, panelPathFor } from "@/lib/auth";
import { useAuth } from "@/hooks/useAuth";
import SEO from "@/components/SEO";
import PwaInstallPrompt from "@/components/PwaInstallPrompt";
import campus from "@/assets/login-campus.jpg";

const schema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(8, "Password must be at least 8 characters").max(100),
});

const highlights = [
  { icon: BookOpen, title: "Access Your Courses", text: "Study at your own pace with quality resources." },
  { icon: CalendarCheck, title: "Track Your Progress", text: "Stay updated on assignments and results." },
  { icon: MessageCircle, title: "Get Support", text: "Reach out to teachers and mentors anytime." },
  { icon: TrendingUp, title: "Build Your Future", text: "Learn today, lead tomorrow." },
];

const fieldClass =
  "h-[52px] rounded-[9px] border-[#D7DCE5] bg-white pl-11 text-[15px] shadow-none focus-visible:border-[#D9A441] focus-visible:ring-[3px] focus-visible:ring-[#D9A441]/20";

function AcademyMark() {
  return (
    <div className="flex items-center gap-4 text-white">
      <span className="grid h-16 w-16 place-items-center rounded-full border-2 border-[#D9A441] text-[#F4B72A]">
        <GraduationCap className="h-9 w-9" strokeWidth={1.75} />
      </span>
      <span>
        <span className="block text-xl font-semibold tracking-[0.16em] sm:text-2xl">THE CONCEPT ACADEMY</span>
        <span className="mt-1.5 block text-sm tracking-[0.32em] text-[#D9A441] sm:text-base">LEARN • GROW • SUCCEED</span>
      </span>
    </div>
  );
}

const Login = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState<{ field: "email" | "password"; message: string } | null>(null);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white text-sm text-[#4B5563]">
        Checking session…
      </div>
    );
  }

  if (user) return <Navigate to={panelPathFor(user.role)} replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = issue.path[0] === "password" ? "password" : "email";
      setFieldError({ field, message: issue.message });
      toast({ title: "Invalid input", description: issue.message, variant: "destructive" });
      return;
    }
    setFieldError(null);
    setSubmitting(true);
    try {
      const session = await loginWithPassword(parsed.data.email, parsed.data.password);
      toast({ title: `Welcome, ${session.name}`, description: `Signed in as ${session.role}.` });
      navigate(panelPathFor(session.role), { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign-in failed.";
      toast({ title: "Login failed", description: message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <SEO
        title="Login | The Concept Academy"
        description="Sign in with your academy portal account — staff and families only."
      />
      <section className="flex min-h-screen flex-col bg-white md:grid md:h-screen md:grid-cols-[45fr_55fr] md:overflow-hidden min-[1100px]:grid-cols-[54fr_46fr]">
        <div className="relative order-2 min-h-[520px] overflow-hidden text-white md:order-1 md:min-h-0 md:h-full">
          <img src={campus} alt="" className="absolute inset-0 h-full w-full object-cover object-center" />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(90deg, rgba(3,13,27,0.88) 0%, rgba(3,13,27,0.72) 46%, rgba(7,20,38,0.55) 100%)",
            }}
          />
          <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 800 900" preserveAspectRatio="none" aria-hidden>
            <path d="M480 860 C 640 800, 760 690, 830 760" fill="none" stroke="#D9A441" strokeWidth="1.1" opacity="0.5" />
          </svg>

          <div className="relative z-10 flex h-full flex-col px-5 pb-8 pt-8 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-500 sm:px-8 md:px-10 md:pb-10 md:pt-12 min-[1100px]:px-16 min-[1100px]:pt-12">
            <AcademyMark />

            <div className="flex flex-1 flex-col justify-center py-8 md:py-6">
              <h1 className="max-w-[520px] text-left font-display text-[42px] font-bold leading-[1.02] text-white sm:text-5xl min-[1100px]:text-[64px] min-[1100px]:leading-[0.98]">
                Welcome
                <br />
                <span className="text-[#F4B72A]">Back!</span>
              </h1>
              <p className="mt-4 max-w-[500px] text-[15px] leading-[1.6] text-white/85 min-[1100px]:mt-5 min-[1100px]:text-[18px]">
                Your journey to knowledge, excellence and a brighter future continues here. Let&apos;s make this year your best one yet.
              </p>

              <div className="mt-8 grid max-w-[640px] grid-cols-2 gap-x-4 gap-y-5 min-[1100px]:mt-10 min-[1100px]:flex min-[1100px]:max-w-[720px]">
                {highlights.map((item, index) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.title}
                      className={`flex min-w-0 gap-2.5 min-[1100px]:flex-1 min-[1100px]:px-3 ${
                        index > 0 ? "min-[1100px]:border-l min-[1100px]:border-white/25" : "min-[1100px]:pl-0"
                      }`}
                    >
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[#D9A441] text-[#F4B72A]">
                        <Icon className="h-4 w-4" strokeWidth={1.75} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[13px] font-semibold leading-tight text-white">{item.title}</span>
                        <span className="mt-1 block text-[11px] leading-snug text-white/70">{item.text}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-[28px] leading-none text-[#F4B72A] min-[1100px]:text-[34px]" style={{ fontFamily: '"Great Vibes", cursive' }}>
                Together Towards Excellence
              </p>
              <span className="mt-2 block h-px w-28 bg-[#D9A441]/70" />
            </div>
          </div>
        </div>

        <div className="relative order-1 flex items-center justify-center overflow-hidden bg-white px-5 py-8 md:order-2 md:h-full md:overflow-y-auto md:px-6 min-[1100px]:px-8">
          <div className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full border border-[#F0DFC0] bg-[#FFFBF2]" />
          <div className="pointer-events-none absolute -bottom-28 -left-16 h-52 w-52 rounded-full border border-[#F0DFC0]/80 bg-[#FFFBF2]" />

          <div className="relative z-10 w-full max-w-[620px] rounded-[20px] border border-[rgba(15,23,42,0.06)] bg-white px-5 py-6 shadow-none motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-500 sm:px-8 sm:py-8 md:px-8 md:py-8 md:shadow-[0_20px_60px_rgba(15,23,42,0.08)] min-[1100px]:px-10">
            <PwaInstallPrompt />

            <h2 className="font-display text-[32px] font-bold leading-none text-[#071426] min-[1100px]:text-[38px]">Sign in</h2>
            <p className="mt-2 text-[15px] text-[#667085]">Use the email and password issued by your academy.</p>

            <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 space-y-4" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-sm font-medium text-[#111827]">Email</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#667085]" />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    aria-invalid={fieldError?.field === "email"}
                    aria-describedby={fieldError?.field === "email" ? "email-error" : undefined}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (fieldError?.field === "email") setFieldError(null);
                    }}
                    className={fieldClass}
                    placeholder="you@school.edu"
                  />
                </div>
                {fieldError?.field === "email" && (
                  <p id="email-error" className="text-sm text-destructive">{fieldError.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-sm font-medium text-[#111827]">Password</Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#667085]" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={password}
                    aria-invalid={fieldError?.field === "password"}
                    aria-describedby={fieldError?.field === "password" ? "password-error" : undefined}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (fieldError?.field === "password") setFieldError(null);
                    }}
                    className={`${fieldClass} pr-12`}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-md text-[#667085] transition-colors hover:text-[#071426] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D9A441]"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((value) => !value)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {fieldError?.field === "password" && (
                  <p id="password-error" className="text-sm text-destructive">{fieldError.message}</p>
                )}
              </div>

              <Button
                type="submit"
                className="h-[54px] w-full rounded-[9px] border-0 bg-[linear-gradient(135deg,#F2B632,#D99618)] text-base font-semibold text-white shadow-none transition-all duration-200 hover:brightness-105"
                disabled={submitting}
              >
                {submitting ? "Signing in..." : "Sign in"}
                {!submitting && <ArrowRight className="h-4 w-4" />}
              </Button>
            </form>

            <p className="mt-5 text-center text-sm text-[#4B5563]">
              <Link to="/" className="inline-flex items-center gap-1.5 transition-colors duration-200 hover:text-[#C99028]">
                <ArrowLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
                Back to homepage
              </Link>
            </p>

            <div className="mt-5 border-t border-[#D9DEE7] pt-4">
              <div className="flex flex-col items-center justify-center gap-2 text-[11px] text-[#667085] sm:flex-row sm:gap-3">
                <p className="flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-[#C99028]" />
                  Your data is secure and private
                </p>
                <span className="hidden text-[#D9DEE7] sm:inline" aria-hidden>|</span>
                <p className="flex items-center gap-1.5">
                  <Headset className="h-3.5 w-3.5 text-[#C99028]" />
                  <Link to="/contact" className="transition-colors duration-200 hover:text-[#C99028]">
                    Need help? Contact support
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
};

export default Login;
