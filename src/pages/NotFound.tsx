import { motion } from "framer-motion";
import { Link } from "react-router";
import { ArrowLeft, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import logo from "@/assets/logo.svg";

export default function NotFound() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="bg-spot relative flex min-h-screen flex-col overflow-hidden bg-background"
    >
      <div className="bg-market-grid pointer-events-none absolute inset-0" />

      <div className="relative flex flex-1 flex-col items-center justify-center px-4 text-center">
        <img src={logo} alt="Trading Wolf AI" className="mb-6 size-14 opacity-90 rounded-md" referrerPolicy="no-referrer" />
        <p className="terminal-font mb-2 text-[11px] uppercase tracking-[0.25em] text-emerald-400">
          system · 404
        </p>
        <h1 className="text-6xl font-bold tracking-tight">Signal lost</h1>
        <p className="mt-3 max-w-md text-muted-foreground">
          The route you followed leads outside the pack&apos;s territory. Nothing
          was traded, no positions were harmed.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button asChild>
            <Link to="/">
              <ArrowLeft className="me-2 size-4" />
              Return to the den
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/auth">
              <Terminal className="me-2 size-4" />
              Open command center
            </Link>
          </Button>
        </div>
      </div>
    </motion.div>
  );
}