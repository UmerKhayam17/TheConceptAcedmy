import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { z } from "zod";
import { Lock, Mail, ShieldCheck, Calculator, GraduationCap, Users, School, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { loginWithPassword, panelPathFor, Role } from "@/lib/auth";
import { useAuth } from "@/hooks/useAuth";
import SEO from "@/components/SEO";

const schema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(8, "Password must be at least 8 characters").max(100),
});

const roleMeta: Record<Role, { icon: React.ComponentType<{ className?: string }>; label: string }> = {
  admin: { icon: ShieldCheck, label: "Administrator" },
  accountant: { icon: Calculator, label: "Accountant" },
  teacher: { icon: GraduationCap, label: "Teacher" },
  parent: { icon: Users, label: "Parent" },
  student: { icon: School, label: "Student" },
};

const Login = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center text-muted-foreground text-sm">
        Checking session…
      </div>
    );
  }

  if (user) return <Navigate to={panelPathFor(user.role)} replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      toast({ title: "Invalid input", description: parsed.error.issues[0].message, variant: "destructive" });
      return;
    }
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
      <section className="cms-root min-h-[calc(100vh-7.25rem)] grid lg:grid-cols-2">
        <div className="hidden lg:flex relative overflow-hidden bg-[image:var(--gradient-hero)] text-primary-foreground p-12 flex-col justify-between">
          <div>
            <div className="text-xs tracking-[0.3em] uppercase text-accent">The Concept Academy</div>
            <h1 className="font-display text-5xl font-bold mt-3 leading-tight">
              Welcome
              <br />
              back.
            </h1>
            <p className="mt-6 max-w-md text-primary-foreground/80">
              Access your dedicated portal — manage classes, fees, results, and student progress in one place.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {(Object.keys(roleMeta) as Role[]).map((r) => {
              const Icon = roleMeta[r].icon;
              return (
                <div
                  key={r}
                  className="flex items-center gap-2 rounded-lg border border-accent/30 bg-white/5 px-3 py-2 backdrop-blur"
                >
                  <Icon className="h-4 w-4 text-accent" />
                  <span className="text-sm">{roleMeta[r].label}</span>
                </div>
              );
            })}
          </div>
          <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-accent/20 blur-3xl" />
        </div>

        <div className="flex items-center justify-center p-6 sm:p-12 bg-background">
          <div className="w-full max-w-md">
            <h2 className="font-display text-3xl font-bold text-primary">Sign in</h2>
            <p className="text-muted-foreground mt-2">Use the email and password issued by your academy.</p>

            <form onSubmit={(e) => void handleSubmit(e)} className="mt-8 space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    placeholder="you@school.edu"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button type="submit" variant="hero" size="lg" className="w-full" disabled={submitting}>
                {submitting ? "Signing in..." : "Sign in"}
              </Button>
            </form>

            <p className="text-sm text-muted-foreground text-center mt-8">
              <Link to="/" className="hover:text-primary">
                ← Back to homepage
              </Link>
            </p>
          </div>
        </div>
      </section>
    </>
  );
};

export default Login;
