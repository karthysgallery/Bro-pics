'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { BEST_SELLING_FRAMES, DEFAULT_POPULAR_SEARCHES } from '../../../components/search/SearchTypeahead';
import { formatPaise } from '../../../lib/format-price';

type Tab = 'overview' | 'auth' | 'search' | 'flows' | 'components';
type AuthPreviewMode = 'signin-desktop' | 'signin-mobile' | 'signup-desktop' | 'signup-mobile' | 'forgot-password';
type SearchStateMode = 'closed' | 'focused-new' | 'focused-returning' | 'typing' | 'no-results' | 'mobile';

export default function DesignSystemPage() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  // Auth simulator state
  const [authMode, setAuthMode] = useState<AuthPreviewMode>('signin-desktop');
  const [authState, setAuthState] = useState<'default' | 'focus' | 'invalid-email' | 'wrong-password' | 'loading' | 'success'>('default');
  const [simForgotStep, setSimForgotStep] = useState<1 | 2 | 3 | 4>(1);

  // Search simulator state
  const [searchMode, setSearchMode] = useState<SearchStateMode>('focused-new');
  const [simulatedQuery, setSimulatedQuery] = useState('wedding');

  return (
    <div className="min-h-screen bg-field text-ink py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
      {/* Top Banner */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-line/80 pb-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-gold animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-wider text-ink/50">
                Figma UI/UX Design System Specification
              </span>
            </div>
            <h1 className="font-display text-3xl sm:text-4xl font-bold text-ink mt-1">
              Karthys<span className="text-gold">Gallery</span> Design System
            </h1>
            <p className="text-sm text-ink/65 mt-1 max-w-2xl leading-relaxed">
              A premium, minimal, warm and responsive e-commerce design system tailored for custom memory products and personalized photo frames.
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <Link
              href="/signin"
              className="px-4 py-2 rounded-xl bg-ink text-paper text-xs font-semibold hover:bg-ink/90 transition-colors shadow-xs"
            >
              Live Sign In Page &rarr;
            </Link>
            <Link
              href="/signup"
              className="px-4 py-2 rounded-xl bg-gold hover:bg-gold-deep text-ink text-xs font-semibold transition-colors shadow-xs"
            >
              Live Sign Up Page &rarr;
            </Link>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 overflow-x-auto pt-4 scrollbar-none">
          {[
            { id: 'overview', label: '1. Architecture & Tokens' },
            { id: 'auth', label: '2. Authentication System' },
            { id: 'search', label: '3. Search Experience' },
            { id: 'flows', label: '4. Interaction Flows' },
            { id: 'components', label: '5. Component Library' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as Tab)}
              className={`px-4 py-2 rounded-full text-xs font-semibold transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-ink text-paper shadow-xs'
                  : 'bg-paper text-ink/70 hover:text-ink border border-line/70'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── TAB 1: ARCHITECTURE & TOKENS ── */}
      {activeTab === 'overview' && (
        <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-200">
          {/* Brand Personality & Direction */}
          <div className="bg-paper rounded-3xl border border-line p-6 sm:p-8 shadow-xs">
            <h2 className="font-display text-xl font-bold text-ink mb-2">Brand Personality & Design Rules</h2>
            <p className="text-xs sm:text-sm text-ink/70 mb-6 leading-relaxed">
              KarthysGallery is a modern Indian D2C personalized framing brand. The design reflects warmth, emotion, quiet luxury, and deep craftsmanship.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-4 rounded-2xl bg-field border border-line/70">
                <span className="text-xs font-bold uppercase tracking-wider text-gold">Emotional & Warm</span>
                <p className="text-2xs sm:text-xs text-ink/70 mt-1 leading-relaxed">
                  Celebrates real human memories with tactile materials, real wood, and archival mats.
                </p>
              </div>
              <div className="p-4 rounded-2xl bg-field border border-line/70">
                <span className="text-xs font-bold uppercase tracking-wider text-ink">Minimal & Clean</span>
                <p className="text-2xs sm:text-xs text-ink/70 mt-1 leading-relaxed">
                  Generous whitespace, quiet borders, and no gratuitous gradients or rounded bubbles.
                </p>
              </div>
              <div className="p-4 rounded-2xl bg-field border border-line/70">
                <span className="text-xs font-bold uppercase tracking-wider text-ink">Zero Emojis</span>
                <p className="text-2xs sm:text-xs text-ink/70 mt-1 leading-relaxed">
                  Strictly professional SVG line icons (Lucide-style) with consistent stroke widths.
                </p>
              </div>
              <div className="p-4 rounded-2xl bg-field border border-line/70">
                <span className="text-xs font-bold uppercase tracking-wider text-ink">Mobile-First</span>
                <p className="text-2xs sm:text-xs text-ink/70 mt-1 leading-relaxed">
                  Touch targets $\ge$ 44px, full-width search drawer, and touch-scrollable carousels.
                </p>
              </div>
            </div>
          </div>

          {/* Color Tokens Palette */}
          <div className="bg-paper rounded-3xl border border-line p-6 sm:p-8 shadow-xs">
            <h2 className="font-display text-xl font-bold text-ink mb-4">Design Tokens: Curated Palette</h2>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5">
              <div className="rounded-2xl border border-line overflow-hidden bg-field">
                <div className="h-16 bg-field border-b border-line/70" />
                <div className="p-3 text-2xs">
                  <p className="font-bold text-ink">Canvas / Ivory</p>
                  <p className="text-ink/50 font-mono">#FAF8F5</p>
                  <p className="text-ink/40 mt-1">Warm off-white base</p>
                </div>
              </div>
              <div className="rounded-2xl border border-line overflow-hidden bg-field">
                <div className="h-16 bg-paper border-b border-line/70" />
                <div className="p-3 text-2xs">
                  <p className="font-bold text-ink">Paper / Surface</p>
                  <p className="text-ink/50 font-mono">#FFFFFF</p>
                  <p className="text-ink/40 mt-1">Cards and modal containers</p>
                </div>
              </div>
              <div className="rounded-2xl border border-line overflow-hidden bg-paper">
                <div className="h-16 bg-[#1A1715]" />
                <div className="p-3 text-2xs">
                  <p className="font-bold text-ink">Charcoal / Ink</p>
                  <p className="text-ink/50 font-mono">#1A1715</p>
                  <p className="text-ink/40 mt-1">Headings & primary buttons</p>
                </div>
              </div>
              <div className="rounded-2xl border border-line overflow-hidden bg-paper">
                <div className="h-16 bg-[#D97706]" />
                <div className="p-3 text-2xs">
                  <p className="font-bold text-ink">Warm Gold / Accent</p>
                  <p className="text-ink/50 font-mono">#D97706</p>
                  <p className="text-ink/40 mt-1">Primary CTAs & highlights</p>
                </div>
              </div>
              <div className="rounded-2xl border border-line overflow-hidden bg-paper">
                <div className="h-16 bg-[#E8E3DC]" />
                <div className="p-3 text-2xs">
                  <p className="font-bold text-ink">Soft Beige / Line</p>
                  <p className="text-ink/50 font-mono">#E8E3DC</p>
                  <p className="text-ink/40 mt-1">Restrained dividers & outlines</p>
                </div>
              </div>
            </div>
          </div>

          {/* Typography Scale */}
          <div className="bg-paper rounded-3xl border border-line p-6 sm:p-8 shadow-xs">
            <h2 className="font-display text-xl font-bold text-ink mb-4">Typography Hierarchy</h2>
            <div className="divide-y divide-line/60">
              <div className="py-3 flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
                <span className="font-display text-3xl font-bold text-ink">Display Bold (32px / 2rem)</span>
                <span className="text-xs font-mono text-ink/50">H1 · PDP Title / Auth Welcome</span>
              </div>
              <div className="py-3 flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
                <span className="font-display text-2xl font-bold text-ink">Display Sub (24px / 1.5rem)</span>
                <span className="text-xs font-mono text-ink/50">H2 · Section Headers</span>
              </div>
              <div className="py-3 flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
                <span className="text-base font-semibold text-ink">Title Medium (16px / 1rem)</span>
                <span className="text-xs font-mono text-ink/50">H3 · Cards & Slot Titles</span>
              </div>
              <div className="py-3 flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
                <span className="text-sm text-ink/80 leading-relaxed">Body Regular (14px / 0.875rem)</span>
                <span className="text-xs font-mono text-ink/50">Form Inputs & Descriptions</span>
              </div>
              <div className="py-3 flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
                <span className="text-xs font-semibold text-ink/60 uppercase tracking-wider">Overline / Caption (11px)</span>
                <span className="text-xs font-mono text-ink/50">Badges, Microcopy & Steps</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: AUTHENTICATION SYSTEM ── */}
      {activeTab === 'auth' && (
        <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-200">
          {/* Controls toolbar */}
          <div className="bg-paper rounded-2xl border border-line p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-bold uppercase tracking-wider text-ink/50 mr-2">Screen:</span>
              {[
                { id: 'signin-desktop', label: 'Sign In (Desktop)' },
                { id: 'signin-mobile', label: 'Sign In (Mobile 375px)' },
                { id: 'signup-desktop', label: 'Sign Up (Desktop)' },
                { id: 'signup-mobile', label: 'Sign Up (Mobile 375px)' },
                { id: 'forgot-password', label: 'Forgot Password Flow' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setAuthMode(m.id as AuthPreviewMode)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    authMode === m.id
                      ? 'bg-gold text-ink shadow-2xs font-bold'
                      : 'bg-tint/60 text-ink/70 hover:text-ink'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* State simulator */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-ink/50 mr-1">State:</span>
              <select
                value={authState}
                onChange={(e) => setAuthState(e.target.value as typeof authState)}
                className="text-xs font-medium bg-field border border-line rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-ink cursor-pointer"
              >
                <option value="default">Default</option>
                <option value="focus">Focus State</option>
                <option value="invalid-email">Invalid Email</option>
                <option value="wrong-password">Wrong Password</option>
                <option value="loading">Loading Spinner</option>
                <option value="success">Success Confirmation</option>
              </select>
            </div>
          </div>

          {/* Interactive Screen Preview Container */}
          <div className="flex justify-center">
            {/* Desktop Sign In / Sign Up */}
            {(authMode === 'signin-desktop' || authMode === 'signup-desktop') && (
              <div className="w-full bg-paper rounded-3xl border border-line shadow-lg overflow-hidden grid lg:grid-cols-12 min-h-[580px]">
                {/* Left Scrim Column */}
                <div className="relative lg:col-span-6 xl:col-span-7 p-10 flex flex-col justify-between overflow-hidden bg-ink">
                  <Image
                    src={authMode === 'signin-desktop' ? '/banners/auth-signin.jpg' : '/banners/auth-signup.jpg'}
                    alt=""
                    fill
                    className="object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-black/10" />
                  <div className="relative z-10 font-display text-xl font-bold text-white">
                    Karthys<span className="text-gold">Gallery</span>
                  </div>
                  <div className="relative z-10 max-w-md text-white">
                    <span className="inline-block px-2.5 py-0.5 rounded-full bg-white/20 text-xs font-semibold mb-2">
                      Handcrafted with Love
                    </span>
                    <h3 className="font-display text-3xl font-bold leading-tight">
                      {authMode === 'signin-desktop'
                        ? 'Turn your memories into something you can keep forever.'
                        : 'Your memories deserve more than a place on your phone.'}
                    </h3>
                    <p className="text-xs sm:text-sm text-white/80 mt-2">
                      {authMode === 'signin-desktop'
                        ? 'Every frame is handcrafted with museum-grade materials, made to preserve your most cherished moments.'
                        : 'Create an account to save your designs, track orders, and start turning your favourite photos into beautiful keepsakes.'}
                    </p>
                  </div>
                </div>

                {/* Right Form Column */}
                <div className="lg:col-span-6 xl:col-span-5 p-8 sm:p-10 flex flex-col justify-center bg-paper">
                  <div className="max-w-sm mx-auto w-full">
                    <h2 className="font-display text-2xl font-bold text-ink">
                      {authMode === 'signin-desktop' ? 'Welcome back' : 'Create your account'}
                    </h2>
                    <p className="text-xs text-ink/65 mt-1 mb-5">
                      {authMode === 'signin-desktop'
                        ? 'Sign in to continue creating beautiful memories.'
                        : 'Enter your details to create your account.'}
                    </p>

                    {/* State simulator banners */}
                    {authState === 'invalid-email' && (
                      <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-600" />
                        <span>Please enter a valid email address</span>
                      </div>
                    )}
                    {authState === 'wrong-password' && (
                      <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-600" />
                        <span>Incorrect password. Please try again.</span>
                      </div>
                    )}
                    {authState === 'success' && (
                      <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                        <span>Signed in successfully! Redirecting...</span>
                      </div>
                    )}

                    <div className="space-y-4">
                      {authMode === 'signup-desktop' && (
                        <div>
                          <label className="block text-[13px] font-medium text-ink/80 mb-1.5">Full Name</label>
                          <input type="text" defaultValue="Aarav Sharma" className="w-full h-12 px-4 rounded-lg border border-line bg-white text-sm text-ink focus:outline-none focus:ring-2 focus:ring-gold/20 focus:border-gold" />
                        </div>
                      )}
                      <div>
                        <label className="block text-[13px] font-medium text-ink/80 mb-1.5">Email Address</label>
                        <input
                          type="email"
                          defaultValue={authState === 'invalid-email' ? 'invalid-email-address' : 'aarav@example.com'}
                          className={`w-full h-12 px-4 rounded-lg border text-sm text-ink transition-all focus:outline-none ${
                            authState === 'focus' ? 'border-ink bg-white ring-2 ring-ink/10' : authState === 'invalid-email' ? 'border-red-400 bg-red-50/20' : 'border-line bg-white focus:ring-2 focus:ring-gold/20 focus:border-gold'
                          }`}
                        />
                      </div>
                      {authMode === 'signup-desktop' && (
                        <div>
                          <label className="block text-[13px] font-medium text-ink/80 mb-1.5">Mobile Number</label>
                          <div className="flex">
                            <span className="inline-flex items-center px-3.5 rounded-l-lg border border-r-0 border-line bg-tint/50 text-sm font-semibold text-ink/80">
                              +91
                            </span>
                            <input
                              type="tel"
                              defaultValue="9876543210"
                              className="flex-1 h-12 px-4 rounded-r-lg border border-line bg-white text-sm text-ink focus:outline-none focus:ring-2 focus:ring-gold/20 focus:border-gold"
                            />
                          </div>
                        </div>
                      )}
                      <div>
                        <div className="flex justify-between items-center mb-1.5">
                          <label className="block text-[13px] font-medium text-ink/80">Password</label>
                          {authMode === 'signin-desktop' && (
                            <Link href="/forgot-password" className="text-xs text-accent hover:underline font-semibold">
                              Forgot password?
                            </Link>
                          )}
                        </div>
                        <input
                          type="password"
                          defaultValue="SecretPassword123"
                          className="w-full h-12 px-4 rounded-lg border border-line bg-white text-sm text-ink focus:outline-none focus:ring-2 focus:ring-gold/20 focus:border-gold"
                        />
                      </div>

                      {authMode === 'signup-desktop' && (
                        <div className="space-y-1.5 pt-1">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-ink/60 font-medium">Password strength:</span>
                            <span className="font-semibold text-emerald-600">Strong</span>
                          </div>
                          <div className="grid grid-cols-3 gap-1.5">
                            <div className="h-1.5 rounded-full bg-emerald-500" />
                            <div className="h-1.5 rounded-full bg-emerald-500" />
                            <div className="h-1.5 rounded-full bg-emerald-500" />
                          </div>
                        </div>
                      )}

                      <button
                        type="button"
                        className="w-full min-h-[44px] h-12 rounded-lg bg-gold hover:bg-gold-deep text-ink font-semibold text-sm transition-all duration-150 shadow-xs hover:shadow active:scale-[0.99] flex items-center justify-center gap-2 mt-2 cursor-pointer"
                      >
                        {authState === 'loading' ? (
                          <span className="w-5 h-5 border-2 border-ink border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <span>{authMode === 'signin-desktop' ? 'Sign In' : 'Create Account'}</span>
                        )}
                      </button>

                      <div className="relative my-3 text-center">
                        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-line" /></div>
                        <span className="relative bg-paper px-3 text-[11px] uppercase font-semibold text-ink/40">OR</span>
                      </div>

                      <button
                        type="button"
                        className="w-full min-h-[44px] h-12 rounded-lg border border-line hover:border-ink/30 bg-white hover:bg-tint/30 text-ink font-medium text-sm transition-all duration-150 flex items-center justify-center gap-3 cursor-pointer"
                      >
                        <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                          <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3.03h3.88c2.27-2.09 3.665-5.17 3.665-9.12z" />
                          <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.03c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.13C3.26 21.36 7.33 24 12 24z" />
                          <path fill="#FBBC05" d="M5.28 14.29c-.25-.72-.38-1.49-.38-2.29s.13-1.57.38-2.29V6.58H1.25C.45 8.18 0 9.97 0 12s.45 3.82 1.25 5.42l4.03-3.13z" />
                          <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.13c.95-2.83 3.6-4.96 6.72-4.96z" />
                        </svg>
                        <span>Continue with Google</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Mobile Viewport Simulation (390px width frame) */}
            {(authMode === 'signin-mobile' || authMode === 'signup-mobile') && (
              <div className="w-[390px] bg-paper rounded-[40px] border-4 border-ink shadow-2xl p-6 flex flex-col justify-between min-h-[680px]">
                <div>
                  {/* Mobile top bar */}
                  <div className="flex items-center justify-between pb-4 border-b border-line/60">
                    <span className="text-xs font-semibold text-ink/70 flex items-center gap-1">
                      &larr; Back to gallery
                    </span>
                    <span className="font-display text-sm font-bold text-ink">
                      Karthys<span className="text-gold">Gallery</span>
                    </span>
                  </div>

                  {/* Mobile header */}
                  <div className="text-center my-6">
                    <h2 className="font-display text-2xl font-bold text-ink">
                      {authMode === 'signin-mobile' ? 'Welcome back' : 'Create account'}
                    </h2>
                    <p className="text-xs text-ink/65 mt-1.5">
                      {authMode === 'signin-mobile' ? 'Sign in to manage your orders & saved designs.' : 'Save your designs, track orders & keep memories.'}
                    </p>
                  </div>

                  <div className="space-y-3.5">
                    {authMode === 'signup-mobile' && (
                      <div>
                        <label className="block text-[13px] font-medium text-ink/80 mb-1">Full Name</label>
                        <input type="text" placeholder="Your name" className="w-full h-12 px-4 rounded-lg border border-line bg-white text-sm" />
                      </div>
                    )}
                    <div>
                      <label className="block text-[13px] font-medium text-ink/80 mb-1">Email</label>
                      <input type="email" placeholder="name@example.com" className="w-full h-12 px-4 rounded-lg border border-line bg-white text-sm" />
                    </div>
                    {authMode === 'signup-mobile' && (
                      <div>
                        <label className="block text-[13px] font-medium text-ink/80 mb-1">Mobile Number</label>
                        <div className="flex">
                          <span className="inline-flex items-center px-3.5 rounded-l-lg border border-r-0 border-line bg-tint/50 text-sm font-semibold text-ink/80">
                            +91
                          </span>
                          <input type="tel" placeholder="98765 43210" className="flex-1 h-12 px-4 rounded-r-lg border border-line bg-white text-sm" />
                        </div>
                      </div>
                    )}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="block text-[13px] font-medium text-ink/80">Password</label>
                        {authMode === 'signin-mobile' && (
                          <span className="text-xs text-accent font-semibold">Forgot?</span>
                        )}
                      </div>
                      <input type="password" placeholder="••••••••" className="w-full h-12 px-4 rounded-lg border border-line bg-white text-sm" />
                    </div>
                    <button type="button" className="w-full h-12 min-h-[44px] rounded-lg bg-gold font-bold text-sm text-ink shadow-xs mt-2">
                      {authMode === 'signin-mobile' ? 'Sign In' : 'Create Account'}
                    </button>
                    <button type="button" className="w-full h-12 min-h-[44px] rounded-lg border border-line font-medium text-sm text-ink flex items-center justify-center gap-2.5 bg-white">
                      <span>Continue with Google</span>
                    </button>
                  </div>
                </div>
                <div className="pt-4 border-t border-line/60 text-center">
                  <p className="text-2xs text-ink/50">
                    Touch targets compliant &ge; 44px &bull; Single-column responsive layout
                  </p>
                </div>
              </div>
            )}

            {/* Forgot Password Interactive Flow */}
            {authMode === 'forgot-password' && (
              <div className="w-full max-w-lg bg-paper rounded-3xl border border-line p-6 sm:p-8 shadow-sm">
                <div className="flex items-center justify-between gap-2 mb-6">
                  <div>
                    <h3 className="font-display text-lg font-bold text-ink">4-Step Forgot Password Wizard</h3>
                    <p className="text-xs text-ink/60">Simulate and test each step of the password recovery workflow.</p>
                  </div>
                  <Link
                    href="/forgot-password"
                    className="px-3 py-1.5 rounded-lg bg-ink text-paper text-2xs font-semibold hover:bg-neutral-800 transition-colors shrink-0"
                  >
                    Open Live Flow &rarr;
                  </Link>
                </div>

                {/* Step Selector Tabs */}
                <div className="grid grid-cols-4 gap-1.5 p-1 bg-tint/60 rounded-xl mb-6">
                  {[
                    { step: 1, label: '1. Email' },
                    { step: 2, label: '2. OTP' },
                    { step: 3, label: '3. Password' },
                    { step: 4, label: '4. Success' },
                  ].map((s) => (
                    <button
                      key={s.step}
                      type="button"
                      onClick={() => setSimForgotStep(s.step as 1 | 2 | 3 | 4)}
                      className={`py-2 rounded-lg text-xs font-semibold transition-all ${
                        simForgotStep === s.step
                          ? 'bg-paper text-ink shadow-xs'
                          : 'text-ink/60 hover:text-ink'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>

                {/* Step 1 Preview */}
                {simForgotStep === 1 && (
                  <div className="space-y-4 p-5 rounded-2xl bg-field border border-line/70">
                    <div>
                      <h4 className="font-display text-base font-bold text-ink">Reset your password</h4>
                      <p className="text-xs text-ink/60 mt-0.5">
                        Enter your registered email address and we&apos;ll send you a 6-digit code.
                      </p>
                    </div>
                    <div>
                      <label className="block text-[13px] font-medium text-ink/80 mb-1.5">Email address</label>
                      <input type="email" defaultValue="aarav@example.com" className="w-full h-12 px-4 rounded-lg border border-line bg-white text-sm" />
                    </div>
                    <button
                      type="button"
                      onClick={() => setSimForgotStep(2)}
                      className="w-full h-12 rounded-lg bg-gold hover:bg-gold-deep text-ink font-semibold text-sm transition-colors flex items-center justify-center gap-2"
                    >
                      Send Verification Code &rarr;
                    </button>
                  </div>
                )}

                {/* Step 2 Preview */}
                {simForgotStep === 2 && (
                  <div className="space-y-4 p-5 rounded-2xl bg-field border border-line/70">
                    <div>
                      <h4 className="font-display text-base font-bold text-ink">Enter verification code</h4>
                      <p className="text-xs text-ink/60 mt-0.5">
                        We sent a 6-digit code to <span className="font-semibold text-ink">aarav@example.com</span>.
                      </p>
                    </div>
                    <div className="flex justify-center gap-2 sm:gap-2.5 py-2">
                      {['4', '8', '2', '9', '1', '6'].map((digit, idx) => (
                        <div
                          key={idx}
                          className="w-10 sm:w-12 h-12 rounded-lg border-2 border-gold/70 bg-white font-mono text-lg font-bold text-ink flex items-center justify-center shadow-xs"
                        >
                          {digit}
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between text-xs text-ink/60 px-1">
                      <span>Expires in 00:28</span>
                      <span className="text-ink/40">Resend in 28s</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSimForgotStep(3)}
                      className="w-full h-12 rounded-lg bg-gold hover:bg-gold-deep text-ink font-semibold text-sm transition-colors"
                    >
                      Verify Code &rarr;
                    </button>
                  </div>
                )}

                {/* Step 3 Preview */}
                {simForgotStep === 3 && (
                  <div className="space-y-4 p-5 rounded-2xl bg-field border border-line/70">
                    <div>
                      <h4 className="font-display text-base font-bold text-ink">Create new password</h4>
                      <p className="text-xs text-ink/60 mt-0.5">Choose a strong password with letters and numbers.</p>
                    </div>
                    <div>
                      <label className="block text-[13px] font-medium text-ink/80 mb-1.5">New password</label>
                      <input type="password" defaultValue="GalleryMaster2026!" className="w-full h-12 px-4 rounded-lg border border-line bg-white text-sm" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-ink/60">Strength:</span>
                        <span className="font-semibold text-emerald-600">Strong</span>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        <div className="h-1.5 rounded-full bg-emerald-500" />
                        <div className="h-1.5 rounded-full bg-emerald-500" />
                        <div className="h-1.5 rounded-full bg-emerald-500" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[13px] font-medium text-ink/80 mb-1.5">Confirm new password</label>
                      <input type="password" defaultValue="GalleryMaster2026!" className="w-full h-12 px-4 rounded-lg border border-emerald-300 bg-white text-sm" />
                    </div>
                    <button
                      type="button"
                      onClick={() => setSimForgotStep(4)}
                      className="w-full h-12 rounded-lg bg-gold hover:bg-gold-deep text-ink font-semibold text-sm transition-colors"
                    >
                      Update Password &rarr;
                    </button>
                  </div>
                )}

                {/* Step 4 Preview */}
                {simForgotStep === 4 && (
                  <div className="space-y-4 p-6 rounded-2xl bg-field border border-line/70 text-center">
                    <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-700 mx-auto flex items-center justify-center">
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        <path d="M9 12l2 2 4-4" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="font-display text-lg font-bold text-ink">Password reset successful!</h4>
                      <p className="text-xs text-ink/65 mt-1 max-w-xs mx-auto">
                        Your account password has been updated. You can now sign in with your new credentials.
                      </p>
                    </div>
                    <Link
                      href="/signin"
                      className="inline-flex items-center justify-center w-full h-12 rounded-lg bg-ink hover:bg-neutral-800 text-white font-semibold text-sm transition-colors"
                    >
                      Continue to Sign In &rarr;
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 3: SEARCH EXPERIENCE ── */}
      {activeTab === 'search' && (
        <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-200">
          {/* State selector toolbar */}
          <div className="bg-paper rounded-2xl border border-line p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-bold uppercase tracking-wider text-ink/50 mr-2">Search State:</span>
              {[
                { id: 'focused-new', label: '1. New User (Popular + Best Sellers)' },
                { id: 'focused-returning', label: '2. Returning User (Recent + Popular + Best Sellers)' },
                { id: 'typing', label: '3. Typing & Live Suggestions' },
                { id: 'no-results', label: '4. No Results State' },
                { id: 'mobile', label: '5. Mobile Overlay (375px)' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSearchMode(m.id as SearchStateMode)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    searchMode === m.id
                      ? 'bg-gold text-ink font-bold shadow-2xs'
                      : 'bg-tint/60 text-ink/70 hover:text-ink'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {searchMode === 'typing' && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-ink/60">Simulate query:</span>
                <input
                  type="text"
                  value={simulatedQuery}
                  onChange={(e) => setSimulatedQuery(e.target.value)}
                  className="px-2.5 py-1 text-xs border border-line rounded-lg bg-field"
                />
              </div>
            )}
          </div>

          {/* Interactive Floating Search Panel Display */}
          <div className="max-w-2xl mx-auto">
            {searchMode !== 'mobile' ? (
              <div className="bg-field border border-line rounded-2xl shadow-xl p-4 divide-y divide-line/60">
                {/* Search Bar Representation */}
                <div className="pb-3 flex items-center gap-2.5 px-3 py-2 rounded-full bg-paper border border-ink shadow-sm">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-ink/50">
                    <circle cx="11" cy="11" r="7" />
                    <path d="M20 20l-3.5-3.5" />
                  </svg>
                  <span className="text-xs text-ink font-medium flex-1">
                    {searchMode === 'typing' ? simulatedQuery : 'Search for frames, gifts and more...'}
                  </span>
                  <span className="w-6 h-6 rounded-full bg-gold text-ink flex items-center justify-center text-xs font-bold">
                    &rarr;
                  </span>
                </div>

                {/* State 1: New User */}
                {searchMode === 'focused-new' && (
                  <div className="pt-4 space-y-4">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/50 mb-2">
                        Popular searches (New User — No Recent Searches)
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {DEFAULT_POPULAR_SEARCHES.map((term) => (
                          <span key={term} className="px-3 py-1.5 rounded-full bg-paper border border-line text-xs font-medium text-ink shadow-2xs">
                            {term}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/50">
                          Best Selling Frames
                        </p>
                        <span className="text-2xs text-ink/50">Horizontal Carousel (3-4 desktop)</span>
                      </div>
                      <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-none">
                        {BEST_SELLING_FRAMES.slice(0, 3).map((item) => (
                          <div key={item.id} className="shrink-0 w-44 bg-paper rounded-xl border border-line p-2">
                            <div className="relative aspect-square w-full rounded-lg bg-tint mb-1.5 overflow-hidden">
                              <Image src={item.image ?? '/placeholders/products/classic-wooden-frame-1.jpg'} alt="" fill sizes="160px" className="object-cover" />
                              <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-ink text-paper text-[8px] font-bold uppercase">
                                Best Seller
                              </span>
                            </div>
                            <p className="text-xs font-bold text-ink truncate">{item.title}</p>
                            <p className="text-2xs font-bold text-accent mt-0.5">{formatPaise(item.pricePaise ?? 4999)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* State 2: Returning User */}
                {searchMode === 'focused-returning' && (
                  <div className="pt-4 space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/50">
                          Recent searches
                        </p>
                        <span className="text-2xs text-ink/50 underline">Clear all</span>
                      </div>
                      <div className="space-y-1">
                        {['Personalized wedding frame', 'Birthday photo collage', 'Couple photo frame'].map((term) => (
                          <div key={term} className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-paper border border-line/40 text-xs text-ink">
                            <span className="font-medium">{term}</span>
                            <span className="text-ink/40">×</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/50 mb-1.5">
                        Popular searches
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {DEFAULT_POPULAR_SEARCHES.slice(0, 4).map((term) => (
                          <span key={term} className="px-2.5 py-1 rounded-full bg-paper border border-line text-2xs font-medium text-ink">
                            {term}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* State 3: Typing Suggestions */}
                {searchMode === 'typing' && (
                  <div className="pt-4 space-y-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/50">
                      Search Suggestions
                    </p>
                    <div className="space-y-1.5">
                      {[
                        'Wedding Photo Frames',
                        'Wedding Collage Frames',
                        'Personalized Wedding Frames',
                        'Wedding Couple Frames',
                      ].map((item) => (
                        <div key={item} className="p-2 rounded-lg bg-paper border border-line/50 text-xs font-medium text-ink flex items-center justify-between">
                          <span>{item}</span>
                          <span className="text-ink/30">&rarr;</span>
                        </div>
                      ))}
                    </div>

                    <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/50 pt-2">
                      Matching Products (Click navigates directly to PDP)
                    </p>
                    <div className="space-y-2">
                      {BEST_SELLING_FRAMES.slice(0, 2).map((prod) => (
                        <div key={prod.id} className="flex items-center gap-3 p-2 rounded-xl bg-paper border border-line/60">
                          <span className="relative w-10 h-10 rounded-lg bg-tint shrink-0 overflow-hidden">
                            <Image src={prod.image ?? '/placeholders/products/classic-wooden-frame-1.jpg'} alt="" fill sizes="40px" className="object-cover" />
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-ink truncate">{prod.title}</p>
                            <p className="text-2xs text-ink/50">/product/{prod.slug}</p>
                          </div>
                          <span className="text-xs font-bold text-accent">{formatPaise(prod.pricePaise ?? 4999)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* State 4: No Results */}
                {searchMode === 'no-results' && (
                  <div className="pt-6 pb-4 text-center">
                    <div className="w-10 h-10 rounded-full bg-tint text-ink/40 flex items-center justify-center mx-auto mb-2">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="7" />
                        <line x1="8" y1="11" x2="14" y2="11" />
                      </svg>
                    </div>
                    <p className="font-display text-sm font-bold text-ink">No frames found</p>
                    <p className="text-xs text-ink/60 mt-0.5">Try searching for another style, occasion or product.</p>
                    <div className="mt-4 pt-3 border-t border-line/60 text-left">
                      <p className="text-2xs font-semibold uppercase text-ink/50 mb-2">Explore Popular Frames</p>
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {BEST_SELLING_FRAMES.slice(0, 2).map((item) => (
                          <div key={item.id} className="w-36 shrink-0 bg-paper p-2 rounded-lg border border-line text-xs font-bold truncate">
                            {item.title}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Mobile Viewport Search Simulation */
              <div className="w-[375px] mx-auto bg-paper rounded-[32px] border-4 border-ink shadow-2xl p-4 flex flex-col min-h-[580px]">
                <div className="flex items-center gap-2 pb-3 border-b border-line">
                  <span className="text-xs font-bold text-ink">&larr;</span>
                  <input type="search" placeholder="Search frames, gifts..." className="w-full h-9 px-3 rounded-full border border-line bg-field text-xs" />
                </div>
                <div className="py-4 space-y-4">
                  <p className="text-2xs font-bold uppercase tracking-wider text-ink/50">Popular Searches</p>
                  <div className="flex flex-wrap gap-1.5">
                    {DEFAULT_POPULAR_SEARCHES.slice(0, 4).map((p) => (
                      <span key={p} className="px-2.5 py-1 rounded-full bg-field border border-line text-2xs font-medium">
                        {p}
                      </span>
                    ))}
                  </div>

                  <div>
                    <p className="text-2xs font-bold uppercase tracking-wider text-ink/50 mb-2">
                      Best Selling Frames (1.5 - 2 cards peek)
                    </p>
                    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                      {BEST_SELLING_FRAMES.slice(0, 2).map((item) => (
                        <div key={item.id} className="w-36 shrink-0 bg-field p-2 rounded-xl border border-line">
                          <div className="relative aspect-square w-full rounded bg-tint mb-1 overflow-hidden">
                            <Image src={item.image ?? '/placeholders/products/classic-wooden-frame-1.jpg'} alt="" fill sizes="140px" className="object-cover" />
                          </div>
                          <p className="text-2xs font-bold truncate">{item.title}</p>
                          <p className="text-2xs text-accent font-bold">{formatPaise(item.pricePaise ?? 4999)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <p className="mt-auto text-center text-[10px] text-ink/40">
                  Mobile search behaves as full-width responsive overlay
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 4: INTERACTION FLOWS ── */}
      {activeTab === 'flows' && (
        <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-200">
          <div className="bg-paper rounded-3xl border border-line p-6 sm:p-8 shadow-xs">
            <h2 className="font-display text-xl font-bold text-ink mb-2">Complete Search to PDP Interaction Flow</h2>
            <p className="text-xs sm:text-sm text-ink/70 mb-6 leading-relaxed">
              Every step from initial header click through personalized frame configuration maintains continuous visual state with zero disconnections.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 relative">
              <div className="p-4 rounded-2xl bg-field border border-line flex flex-col justify-between">
                <div>
                  <span className="w-6 h-6 rounded-full bg-ink text-paper text-xs font-bold flex items-center justify-center mb-2">1</span>
                  <h4 className="font-bold text-xs uppercase tracking-wide text-ink">User Clicks Search</h4>
                  <p className="text-2xs text-ink/65 mt-1 leading-relaxed">
                    Search field expands smoothly. Floating panel drops down without navigating away.
                  </p>
                </div>
                <div className="mt-3 text-2xs font-mono text-ink/50 border-t border-line/60 pt-2">
                  isFocused: true
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-field border border-line flex flex-col justify-between">
                <div>
                  <span className="w-6 h-6 rounded-full bg-ink text-paper text-xs font-bold flex items-center justify-center mb-2">2</span>
                  <h4 className="font-bold text-xs uppercase tracking-wide text-ink">User Discovers or Types</h4>
                  <p className="text-2xs text-ink/65 mt-1 leading-relaxed">
                    New user browses popular pills & best-seller carousel; returning user sees recent search history.
                  </p>
                </div>
                <div className="mt-3 text-2xs font-mono text-ink/50 border-t border-line/60 pt-2">
                  query: debounced (200ms)
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-field border border-line flex flex-col justify-between">
                <div>
                  <span className="w-6 h-6 rounded-full bg-ink text-paper text-xs font-bold flex items-center justify-center mb-2">3</span>
                  <h4 className="font-bold text-xs uppercase tracking-wide text-ink">Click Product Card</h4>
                  <p className="text-2xs text-ink/65 mt-1 leading-relaxed">
                    Dropdown dismisses automatically. Customer navigates directly to <code className="text-ink font-semibold">/product/[slug]</code>.
                  </p>
                </div>
                <div className="mt-3 text-2xs font-mono text-ink/50 border-t border-line/60 pt-2">
                  router.push(pdp)
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-field border border-line flex flex-col justify-between">
                <div>
                  <span className="w-6 h-6 rounded-full bg-gold text-ink text-xs font-bold flex items-center justify-center mb-2">4</span>
                  <h4 className="font-bold text-xs uppercase tracking-wide text-ink">Live Personalization</h4>
                  <p className="text-2xs text-ink/65 mt-1 leading-relaxed">
                    Customer uploads photo, sees live preview inside the actual frame slot, adjusts crop, and adds to cart.
                  </p>
                </div>
                <div className="mt-3 text-2xs font-mono text-ink/50 border-t border-line/60 pt-2">
                  live composite preview
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 5: COMPONENT LIBRARY ── */}
      {activeTab === 'components' && (
        <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-200">
          <div className="bg-paper rounded-3xl border border-line p-6 sm:p-8 shadow-xs">
            <h2 className="font-display text-xl font-bold text-ink mb-6">Reusable Atomic Components</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Buttons */}
              <div className="p-5 rounded-2xl bg-field border border-line space-y-3">
                <span className="text-xs font-bold uppercase tracking-wider text-ink/50">Buttons & Touch Targets</span>
                <div className="flex flex-wrap gap-2.5 items-center pt-2">
                  <button type="button" className="px-4 py-2.5 rounded-xl bg-gold hover:bg-gold-deep text-ink text-xs font-semibold shadow-xs">
                    Primary CTA (Gold)
                  </button>
                  <button type="button" className="px-4 py-2.5 rounded-xl bg-ink text-paper text-xs font-semibold hover:bg-ink/90">
                    Secondary CTA (Charcoal)
                  </button>
                  <button type="button" className="px-4 py-2.5 rounded-xl border border-line bg-paper text-xs font-semibold text-ink hover:border-ink/40">
                    Outline Button
                  </button>
                </div>
              </div>

              {/* Badges & Indicators */}
              <div className="p-5 rounded-2xl bg-field border border-line space-y-3">
                <span className="text-xs font-bold uppercase tracking-wider text-ink/50">Badges & Quality Signals</span>
                <div className="flex flex-wrap gap-2 items-center pt-2">
                  <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-semibold">
                    300+ DPI · Ultra Sharp
                  </span>
                  <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold">
                    150–299 DPI · Good Quality
                  </span>
                  <span className="px-2.5 py-1 rounded bg-ink text-paper text-2xs font-bold uppercase tracking-wider">
                    Best Seller
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
