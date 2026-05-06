"use client";

import { useUser, UserButton } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { useState } from "react";

const NAV_LINKS = [
  { name: "Platform", href: "/dashboard", hasDropdown: false },
  { name: "Community", href: "", hasDropdown: false },
  { name: "Pricing", href: "#", hasDropdown: false },
  { name: "Security", href: "/security", hasDropdown: false },
];

const LOGOS = [
  { name: "ADK", src: "agent-development-kit.png" },
  { name: "Hermes", src: "hermesagent.webp" },
  { name: "GCP", src: "googlecloud-color.svg" },
  { name: "PostgreSQL", src: "elephant.png" },
  { name: "ElevenLabs", src: "elevenlabs-logo-black.svg" },
  { name: "Gemini", src: "gemini.webp"},
  { name: "OpenAI", src: "openai.webp"},
  { name: "E2B", src: "e2b.png" }
];

const TEMPLATES = [
  { name: "Personal Portfolio", type: "Portfolio", image: "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&q=80&w=400&h=250" },
  { name: "Creative Agency", type: "Portfolio", image: "https://images.unsplash.com/photo-1497215728101-856f4ea42174?auto=format&fit=crop&q=80&w=400&h=250" },
  { name: "Minimal Architecture", type: "Portfolio", image: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&q=80&w=400&h=250" },
  { name: "Fashion Blog", type: "Blog", image: "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&q=80&w=400&h=250" },
  { name: "E-commerce Dashboard", type: "Dashboard", image: "https://images.unsplash.com/photo-1551288049-bbda6465f74a?auto=format&fit=crop&q=80&w=400&h=250" },
  { name: "AI Chat Interface", type: "Application", image: "https://images.unsplash.com/photo-1531746790731-6c087fecd65a?auto=format&fit=crop&q=80&w=400&h=250" },
  { name: "Event Manager", type: "Management", image: "https://images.unsplash.com/photo-1505373633560-fa0a5170ef33?auto=format&fit=crop&q=80&w=400&h=250" },
  { name: "Blog Engine", type: "Blog", image: "https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&q=80&w=400&h=250" },
];

export default function LandingPage() {
  const { isLoaded, userId, isSignedIn } = useUser();
  const router = useRouter();
  const [prompt, setPrompt] = useState("");

  function handleStart(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!prompt.trim()) return;
    router.push(`/dashboard?prompt=${encodeURIComponent(prompt.trim())}`);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      handleStart();
    }
  }

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
          
          <div className="hidden lg:flex items-center gap-6">
            | &nbsp;
            {NAV_LINKS.map((link) => (
              <Link 
                key={link.name} 
                href={link.href}
                className="text-[15px] text-white/70 hover:text-white transition-colors flex items-center gap-1"
              >
                {link.name}
                {link.hasDropdown && (
                  <svg viewBox="0 0 24 24" className="w-4 h-4 opacity-40 fill-none stroke-current stroke-2">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                )}
              </Link>
            ))}
          </div>
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

      <main className="relative z-10 pt-[72px]">
        {/* Hero Section */}
        <section className="pt-24 pb-32 px-6 text-center max-w-5xl mx-auto relative z-10">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-[13px] font-medium text-blue-400 mb-10"
          >
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
            New — Try the cloud-based App Builder
          </motion.div>

          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-[64px] lg:text-[88px] font-bold leading-[1.1] tracking-tight mb-8"
          >
            Build with
            <span className="kindred-text-gradient"> Kindred</span>
          </motion.h1>

          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-xl text-white/50 max-w-2xl mx-auto mb-12"
          >
            Create apps and websites by chatting with AI
          </motion.p>

          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="prompt-bar max-w-2xl mx-auto p-4 flex items-center gap-3"
          >
            <input 
              type="text" 
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="What would you like to build?" 
              className="bg-transparent border-none outline-none flex-1 text-lg placeholder:text-white/20"
            />
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs font-medium text-white/40">
              Kinde 1.0 
              <svg viewBox="0 0 24 24" className="w-3 h-3 fill-none stroke-current stroke-2">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </div>
            <button 
              onClick={() => handleStart()}
              className="w-10 h-10 kindred-gradient rounded-full flex items-center justify-center shadow-lg shadow-blue-500/20 hover:scale-105 transition-transform"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5 text-white fill-none stroke-current stroke-2">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </motion.div>
        </section>

        {/* Logo Cloud */}
        <section className="pb-32 px-6">
          <p className="text-center text-sm font-medium text-white/30 mb-12">
            We are using
          </p>
          <div className="flex flex-wrap justify-center items-center gap-x-16 gap-y-8 grayscale opacity-40 hover:opacity-100 transition-opacity">
            {LOGOS.map((logo) => (
              <img key={logo.name} src={logo.src} alt={logo.name} className="h-8 object-contain" />
            ))}
          </div>
        </section>

        {/* Meet Kindred */}
        <section className="py-32 px-6 max-w-7xl mx-auto grid lg:grid-cols-2 gap-24 items-center">
          <div className="relative aspect-square max-w-[500px] mx-auto w-full glass-panel rounded-3xl overflow-hidden flex items-center justify-center bg-[#0d0d0e]">
            {/* The Orb */}
            <div className="relative w-64 h-64 flex items-center justify-center">
              {/* Semi-circle halo */}
              <div className="absolute top-0 w-48 h-24 bg-gradient-to-b from-pink-500/40 to-transparent rounded-t-full blur-xl" />
              <div className="absolute top-4 w-40 h-20 border-t-2 border-white/20 rounded-t-full" />
              
              {/* Main glowing sphere */}
              <div className="w-40 h-40 rounded-full kindred-gradient relative z-10 shadow-[0_0_80px_rgba(59,130,246,0.5)] animate-pulse" />
              
              {/* Inner glow */}
              <div className="absolute w-32 h-32 rounded-full bg-white/20 blur-2xl z-20" />
            </div>
            
            {/* Background elements */}
            <div className="absolute inset-0 kindred-gradient opacity-5 blur-[100px]" />
          </div>

          <div className="space-y-12">
            <div>
              <h2 className="text-4xl font-bold mb-8">Meet Kindred</h2>
              <div className="space-y-10">
                <div className="flex gap-6">
                  <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
                    <svg viewBox="0 0 24 24" className="w-6 h-6 text-blue-400 fill-current">
                      <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold mb-2">Start with an idea</h3>
                    <p className="text-white/50 leading-relaxed">
                      Describe the app or website you want to create or drop in screenshots and docs.
                    </p>
                  </div>
                </div>

                <div className="flex gap-6">
                  <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center flex-shrink-0">
                    <svg viewBox="0 0 24 24" className="w-6 h-6 text-purple-400 fill-current">
                      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold mb-2">Watch it come to life</h3>
                    <p className="text-white/50 leading-relaxed">
                      See your vision transform into a working prototype in real-time as AI builds it for you.
                    </p>
                  </div>
                </div>

                <div className="flex gap-6">
                  <div className="w-12 h-12 rounded-xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center flex-shrink-0">
                    <svg viewBox="0 0 24 24" className="w-6 h-6 text-pink-400 fill-none stroke-current stroke-2">
                      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold mb-2">Refine and ship</h3>
                    <p className="text-white/50 leading-relaxed">
                      Iterate on your creation with simple feedback and deploy it to the world with one click.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Templates */}
        <section className="py-32 px-6 max-w-7xl mx-auto">
          <div className="flex items-end justify-between mb-12">
            <div>
              <h2 className="text-4xl font-bold mb-4">Discover templates</h2>
              <p className="text-white/50">Start your next project with a template</p>
            </div>
            <Link href="#" className="text-sm font-medium hover:text-blue-400 transition-colors flex items-center gap-1">
              View all 
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current stroke-2">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {TEMPLATES.map((item, i) => (
              <motion.div 
                key={i}
                whileHover={{ y: -5 }}
                className="glass-card rounded-2xl overflow-hidden group"
              >
                <div className="aspect-[4/3] relative overflow-hidden bg-white/5">
                  <img 
                    src={item.image} 
                    alt={item.name} 
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" 
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="btn-primary px-4 py-2 text-sm rounded-full">Preview</div>
                  </div>
                </div>
                <div className="p-4">
                  <p className="text-[10px] uppercase tracking-widest text-white/30 font-bold mb-1">{item.type}</p>
                  <h4 className="font-bold text-[15px]">{item.name}</h4>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Numbers */}
        <section className="py-32 px-6 max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Kindred in numbers</h2>
            <p className="text-white/50">Millions of builders are already turning ideas into reality</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="glass-card p-10 rounded-3xl text-center">
              <h3 className="text-5xl font-bold mb-4">36M+</h3>
              <p className="text-white/40 text-sm">projects built on Kindred</p>
            </div>
            <div className="glass-card p-10 rounded-3xl text-center">
              <h3 className="text-5xl font-bold mb-4">200K+</h3>
              <p className="text-white/40 text-sm">projects built per day on Kindred</p>
            </div>
            <div className="glass-card p-10 rounded-3xl text-center">
              <h3 className="text-5xl font-bold mb-4">300M+</h3>
              <p className="text-white/40 text-sm">visits per day to Kindred-built apps</p>
            </div>
          </div>
        </section>

        {/* Ready to build */}
        <section className="py-32 px-6 text-center relative overflow-hidden">
          <div className="absolute inset-0 kindred-gradient opacity-10 blur-[120px] -z-10" />
          <p className="text-sm font-bold tracking-widest text-blue-400 uppercase mb-4">AI App Builder</p>
          <h2 className="text-[56px] font-bold mb-12">Ready to build?</h2>
          
          <div className="prompt-bar max-w-2xl mx-auto p-4 flex items-center gap-3">
            <input 
              type="text" 
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="What would you like to build?" 
              className="bg-transparent border-none outline-none flex-1 text-lg placeholder:text-white/20"
            />
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs font-medium text-white/40">
              Kinde 1.0
              <svg viewBox="0 0 24 24" className="w-3 h-3 fill-none stroke-current stroke-2">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </div>
            <button 
              onClick={() => handleStart()}
              className="w-10 h-10 kindred-gradient rounded-full flex items-center justify-center shadow-lg shadow-blue-500/20 hover:scale-105 transition-transform"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5 text-white fill-none stroke-current stroke-2">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-black border-t border-white/5 pt-24 pb-12 px-6">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-12 mb-24">
          <div className="col-span-2 lg:col-span-1">
            <Link href="/" className="flex items-center gap-2.5 mb-6">
              <span className="font-bold">Kindred AI Studio</span>
            </Link>
            <p className="text-gray-400 text-sm">Created by<br/> <a className="text-blue-500" href="https://www.linkedin.com/in/ramdevcalope"  target="_blank" rel="noopener noreferrer">Ramdev G. Calope</a></p>
            <br />
            <div className="flex gap-4">
              {/* Twitter SVG */}
              <a href="https://x.com/ramdvofficial" target="_blank" rel="noopener noreferrer">
                <svg viewBox="0 0 24 24" className="w-5 h-5 text-white/30 hover:text-white transition-colors cursor-pointer fill-current">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
              {/* Github SVG */}
              <a href="https://github.com/ramdev2025" target="_blank" rel="noopener noreferrer">
                <svg viewBox="0 0 24 24" className="w-5 h-5 text-white/30 hover:text-white transition-colors cursor-pointer fill-current">
                  <path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.341-3.369-1.341-.454-1.152-1.11-1.459-1.11-1.459-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12c0-5.523-4.477-10-10-10z" />
                </svg>
              </a>
              {/* Linkedin SVG */}
              <a href="https://www.linkedin.com/in/ramdevcalope" target="_blank" rel="noopener noreferrer">
              <svg viewBox="0 0 24 24" className="w-5 h-5 text-white/30 hover:text-white transition-colors cursor-pointer fill-current">
                <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
              </svg>
              </a>
            </div>
          </div>

          {[
            { title: "Company", links: [{name: "About", href: "#"}, {name: "Careers", href: "#"}, {name: "Terms", href: "/security#terms"}, {name: "Privacy", href: "/security#privacy"}, {name: "Security", href: "/security"}] },
            { title: "Product", links: [{name: "Pricing", href: "#"}, {name: "Docs", href: "#"}, {name: "Changelog", href: "#"}, {name: "Roadmap", href: "#"}, {name: "Status", href: "#"}] },
            { title: "Resources", links: [{name: "Blog", href: "#"}, {name: "Tutorials", href: "#"}, {name: "Guides", href: "#"}, {name: "Templates", href: "#"}, {name: "API", href: "#"}] },
            { title: "Jobs", links: [{name: "Engineering", href: "#"}, {name: "Design", href: "#"}, {name: "Product", href: "#"}, {name: "Support", href: "#"}, {name: "Marketing", href: "#"}] },
            { title: "Community", links: [{name: "Forum", href: "#"}, {name: "Discord", href: "#"}, {name: "Twitter", href: "#"}, {name: "Showcase", href: "#"}, {name: "Events", href: "#"}] },
          ].map((col) => (
            <div key={col.title}>
              <h5 className="font-bold text-sm mb-6 uppercase tracking-wider text-white/30">{col.title}</h5>
              <ul className="space-y-4">
                {col.links.map((link) => (
                  <li key={typeof link === 'string' ? link : link.name}>
                    <Link href={typeof link === 'string' ? "#" : link.href} className="text-[15px] text-white/50 hover:text-white transition-colors">
                      {typeof link === 'string' ? link : link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6 text-[13px] text-white">
          <p>© 2026 Kindred AI Studio Inc. All rights reserved.</p>
          <div className="flex gap-8">
            <Link href="#" className="hover:text-white transition-colors">Terms of Service</Link>
            <Link href="#" className="hover:text-white transition-colors">Privacy Policy</Link>
            <Link href="#" className="hover:text-white transition-colors">Cookie Settings</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

