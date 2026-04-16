import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Moon, Sun } from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useTheme } from "next-themes";

const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

export default function Index() {
  const { isAuthenticated } = useAuth();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const isDark = mounted && theme === "dark";

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 50;
      const y = (e.clientY / window.innerHeight - 0.5) * 50;
      setMousePosition({ x, y });
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <div className={`relative h-screen w-full overflow-hidden ${isDark ? "bg-white" : "bg-zinc-950"}`}>
      <motion.div
        initial="hidden"
        animate="visible"
        transition={{ duration: 0.8, ease: "easeOut" }}
        variants={fadeIn}
        className="absolute inset-0 flex items-center justify-center"
        style={{
          transform: `translate(${mousePosition.x * 0.3}px, ${mousePosition.y * 0.3}px)`,
        }}
      >
        <img
          src="/login.png"
          alt="Sahayak"
          className="h-full w-full object-cover transition-transform duration-300"
          style={{
            objectPosition: "center",
            transform: `translate(${mousePosition.x}px, ${mousePosition.y}px)`,
          }}
        />
      </motion.div>

      <motion.div
        className={`absolute inset-0 ${isDark ? "bg-white/30" : "bg-black/20"}`}
        style={{
          transform: `translate(${-mousePosition.x * 0.2}px, ${-mousePosition.y * 0.2}px)`,
        }}
      />

      <header className="relative z-20 flex items-center justify-between px-4 py-4 sm:px-6 lg:px-10" style={{
        transform: `translate(${-mousePosition.x * 0.15}px, ${-mousePosition.y * 0.15}px)`,
      }}>
        <Link
          to="/"
          className={`text-2xl font-extrabold tracking-tight drop-shadow-lg ${
            isDark ? "text-black" : "text-white"
          }`}
        >
          Sahayak
        </Link>

        <div className="flex items-center gap-2 sm:gap-4">
          {mounted && (
            <Button
              onClick={toggleTheme}
              variant="ghost"
              size="icon"
              className={`h-10 w-10 rounded-full border backdrop-blur-sm transition-colors ${
                isDark
                  ? "border-black/25 bg-black/10 text-black hover:bg-black/20"
                  : "border-white/30 bg-white/10 text-white hover:bg-white/20"
              }`}
              aria-label="Toggle theme"
            >
              {theme === "dark" ? (
                <Sun className="h-5 w-5" />
              ) : (
                <Moon className="h-5 w-5" />
              )}
            </Button>
          )}
          <Button
            asChild
            className={`h-11 rounded-full border px-6 text-sm font-semibold backdrop-blur-md transition-all duration-200 ${
              isDark
                ? "border-black/40 bg-black/15 text-black hover:bg-black/25"
                : "border-white/40 bg-white/15 text-white hover:bg-white/25"
            }`}
          >
            <Link to="/login">
              Get Started
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </header>
    </div>
  );
}
