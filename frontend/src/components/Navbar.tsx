import { useState, useEffect } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Menu, X, ChevronDown, LogIn, LogOut, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import logo from "@/assets/logo.png";
import AnnouncementBar from "./AnnouncementBar";
import { useAuth } from "@/hooks/useAuth";
import { logout, panelPathFor } from "@/lib/auth";

const navLinks = [
  { to: "/", label: "Home" },
  { to: "/about", label: "About" },
  {
    label: "Institutions",
    children: [
      { to: "/institutions/school", label: "School" },
      { to: "/institutions/college", label: "College" },
      { to: "/institutions/academy", label: "Academy" },
    ],
  },
  { to: "/programs", label: "Programs" },
  { to: "/faculty", label: "Faculty" },
  { to: "/achievements", label: "Achievers" },
  { to: "/contact", label: "Contact" },
];

const Navbar = () => {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [instOpen, setInstOpen] = useState(false);
  const location = useLocation();
  // `user` starts as the profile remembered in this browser and is corrected once the
  // background session check finishes, so the buttons render immediately. This only
  // affects what the menu shows — protected pages still wait for the server check.
  const { user } = useAuth();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setOpen(false);
    setInstOpen(false);
  }, [location.pathname]);

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-spring ${
        scrolled ? "bg-background/95 backdrop-blur-md shadow-card" : "bg-background/85 backdrop-blur-sm"
      }`}
    >
      {/* Top sliding announcement ticker — hidden once user scrolls */}
      <div
        className={`overflow-hidden transition-[max-height,opacity] duration-500 ${
          scrolled ? "max-h-0 opacity-0" : "max-h-12 opacity-100"
        }`}
      >
        <AnnouncementBar />
      </div>
      <div className="container flex items-center justify-between h-20">
        <Link to="/" className="flex items-center gap-3 group">
          <img src={logo} alt="The Concept Academy logo" className="h-12 w-auto" width={120} height={48} />
          <div className="hidden sm:block leading-tight">
            <div className="font-display text-lg font-bold text-primary">The Concept Academy</div>
            <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Read · Rise · Radiate</div>
          </div>
        </Link>

        <nav className="hidden lg:flex items-center gap-1">
          {navLinks.map((link) =>
            link.children ? (
              <div key={link.label} className="relative group">
                <button className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-foreground hover:text-primary transition-smooth">
                  {link.label}
                  <ChevronDown className="h-4 w-4 transition-transform group-hover:rotate-180" />
                </button>
                <div className="absolute top-full left-0 pt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-smooth">
                  <div className="bg-card shadow-elegant rounded-lg border border-border py-2 min-w-[180px]">
                    {link.children.map((c) => (
                      <NavLink
                        key={c.to}
                        to={c.to}
                        className={({ isActive }) =>
                          `block px-4 py-2 text-sm transition-smooth ${
                            isActive ? "text-accent font-semibold" : "text-foreground hover:bg-secondary hover:text-primary"
                          }`
                        }
                      >
                        {c.label}
                      </NavLink>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <NavLink
                key={link.to}
                to={link.to!}
                className={({ isActive }) =>
                  `relative px-4 py-2 text-sm font-medium transition-smooth ${
                    isActive ? "text-primary" : "text-foreground hover:text-primary"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {link.label}
                    {isActive && (
                      <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 h-0.5 w-6 bg-accent rounded-full" />
                    )}
                  </>
                )}
              </NavLink>
            )
          )}
        </nav>

        <div className="hidden lg:flex items-center gap-2">
          {user ? (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link to={panelPathFor(user.role)}>
                  <LayoutDashboard className="h-4 w-4" /> {user.name.split(" ")[0]}
                </Link>
              </Button>
              <Button variant="outline" size="sm" onClick={() => void logout()}>
                <LogOut className="h-4 w-4" /> Logout
              </Button>
            </>
          ) : (
            <Button asChild variant="outline" size="sm">
              <Link to="/login">
                <LogIn className="h-4 w-4" /> Login
              </Link>
            </Button>
          )}
          <Button asChild variant="hero" size="lg">
            <Link to="/admissions">Apply Now</Link>
          </Button>
        </div>

        <button
          className="lg:hidden p-2 text-primary"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Mobile menu */}
      <div
        className={`lg:hidden overflow-hidden transition-[max-height] duration-500 ${
          open ? "max-h-[600px]" : "max-h-0"
        }`}
      >
        <nav className="container py-4 flex flex-col gap-1 border-t border-border bg-background">
          {navLinks.map((link) =>
            link.children ? (
              <div key={link.label}>
                <button
                  onClick={() => setInstOpen((v) => !v)}
                  className="w-full flex items-center justify-between px-3 py-3 text-foreground font-medium"
                >
                  {link.label}
                  <ChevronDown className={`h-4 w-4 transition-transform ${instOpen ? "rotate-180" : ""}`} />
                </button>
                {instOpen && (
                  <div className="pl-6 flex flex-col">
                    {link.children.map((c) => (
                      <NavLink
                        key={c.to}
                        to={c.to}
                        className="px-3 py-2 text-sm text-muted-foreground hover:text-primary"
                      >
                        {c.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <NavLink
                key={link.to}
                to={link.to!}
                className={({ isActive }) =>
                  `px-3 py-3 font-medium ${isActive ? "text-accent" : "text-foreground"}`
                }
              >
                {link.label}
              </NavLink>
            )
          )}
          {user ? (
            <>
              <NavLink to={panelPathFor(user.role)} className="px-3 py-3 font-medium text-primary">
                My Panel ({user.role})
              </NavLink>
              <Button variant="outline" className="mt-2" onClick={() => void logout()}>
                <LogOut className="h-4 w-4" /> Logout
              </Button>
            </>
          ) : (
            <Button asChild variant="outline" className="mt-2">
              <Link to="/login">
                <LogIn className="h-4 w-4" /> Login
              </Link>
            </Button>
          )}
          <Button asChild variant="hero" className="mt-3">
            <Link to="/admissions">Apply Now</Link>
          </Button>
        </nav>
      </div>
    </header>
  );
};

export default Navbar;
