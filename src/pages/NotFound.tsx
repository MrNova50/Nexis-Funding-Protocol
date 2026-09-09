import { Link } from "react-router";
import { motion } from "framer-motion";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="clay-card flex flex-col items-center px-10 py-12"
      >
        <span className="text-6xl">🧱</span>
        <h1 className="mt-6 text-3xl font-extrabold tracking-tight">
          Page not found
        </h1>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          This page does not exist — but every member's proof page is public.
          Try <code className="clay-well px-1 py-0.5">/p/some-handle</code>.
        </p>
        <Link
          to="/"
          className="clay-primary clay-press mt-8 rounded-full px-6 py-2.5 text-sm font-semibold"
        >
          Back to home
        </Link>
      </motion.div>
    </main>
  );
}
