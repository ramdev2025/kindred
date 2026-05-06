"use client";

import Link from "next/link";
import { useUser, UserButton } from "@clerk/nextjs";
import { motion } from "framer-motion";

const SECTIONS = [
  {
    id: "terms",
    title: "Terms and Agreement",
    content: `By using Kindred AI Studio, you agree to our terms of service. We provide AI-powered development tools intended to accelerate your workflow. You maintain ownership of the code generated, while we maintain the infrastructure to run it.`,
  },
  {
    id: "privacy",
    title: "Privacy Policy",
    content: `Your privacy is paramount. We do not sell your data. We use industry-standard encryption to protect your prompts, code, and personal information. Your data is used only to improve your experience and provide the services you request.`,
  },
  {
    id: "security",
    title: "Security Policy",
    content: `We employ multiple layers of security. All code execution happens in isolated E2B cloud sandboxes, ensuring your main environment is never compromised. We use Clerk for secure authentication and follow OWASP best practices for web security.`,
  },
  {
    id: "account-deletion",
    title: "Account Deletion",
    content: `You have full control over your data. You can request account deletion at any time through your dashboard settings. Once requested, all your data, including projects and personal information, will be permanently removed from our servers within 30 days.`,
  },
  {
    id: "hipaa",
    title: "HIPAA Compliance",
    content: `Kindred AI Studio is designed with data privacy in mind. While we are currently working towards full HIPAA certification, we already implement many of the required technical safeguards, including data encryption at rest and in transit.`,
  },
  {
    id: "iso",
    title: "ISO Certification",
    content: `We are currently in the process of obtaining ISO/IEC 27001 certification. This reflects our commitment to establishing, implementing, maintaining, and continually improving our information security management system.`,
  },
  {
    id: "refund",
    title: "Refund Policy",
    content: `We offer a 14-day money-back guarantee for all paid plans. If you are not satisfied with Kindred AI Studio, you can request a full refund within the first 14 days of your subscription. No questions asked.`,
  },
];

export default function SecurityPage() {
  const { isLoaded, isSignedIn } = useUser();

  return (
    <div className="min-h-screen bg-[#09090b] text-white selection:bg-blue-500/30 selection:text-white">
      {/* Background Orbs */}
      <div className="glow-top" />
      <div className="glow-center" />
      <div className="glow-bottom" />

      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50 glass-panel border-b border-white/5 px-6 h-[72px] flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="text-xl font-bold tracking-tight">Kindred <span className="text-white/60 font-medium">AI Studio</span></span>
          </Link>
        </div>

        <div className="flex items-center gap-4">
          {!isLoaded ? (
            <div className="w-20 h-8 bg-white/5 rounded-lg animate-pulse" />
          ) : !isSignedIn ? (
            <>
              <Link href="/sign-in" className="text-[15px] font-medium text-white/80 hover:text-white transition-colors">
                Login
              </Link>
              <Link href="/sign-up" className="btn-primary px-6 py-2.5 text-[15px]">
                Get started
              </Link>
            </>
          ) : (
            <>
              <Link href="/dashboard" className="text-[15px] font-medium text-white/80 hover:text-white transition-colors">
                Dashboard
              </Link>
              <UserButton afterSignOutUrl="/" />
            </>
          )}
        </div>
      </nav>

      <main className="relative z-10 pt-32 pb-24 px-6 max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-20"
        >
          <h1 className="text-5xl font-bold mb-6 tracking-tight">Security & Compliance</h1>
          <p className="text-xl text-white/50">Our commitment to protecting your data and privacy.</p>
        </motion.div>

        <div className="space-y-12">
          {SECTIONS.map((section, i) => (
            <motion.section
              key={section.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="glass-card p-10 rounded-3xl"
            >
              <h2 className="text-2xl font-bold mb-4">{section.title}</h2>
              <p className="text-white/60 leading-relaxed text-lg">
                {section.content}
              </p>
            </motion.section>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-black border-t border-white/5 pt-24 pb-12 px-6 relative z-10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6 text-[13px] text-white/20">
          <p>© 2026 Kindred AI Studio Inc. All rights reserved.</p>
          <div className="flex gap-8">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <Link href="/sign-up" className="hover:text-white transition-colors">Get Started</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
