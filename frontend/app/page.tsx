import { LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingHero } from "@/components/landing/landing-hero";
import { FeaturesSection } from "@/components/landing/features-section";
import { InfrastructureShowcase } from "@/components/landing/infrastructure-showcase";
import { AbrShowcaseSection } from "@/components/landing/abr-showcase-section";
import { LandingFooter } from "@/components/landing/landing-footer";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#090d16] text-slate-900 dark:text-slate-100 transition-colors duration-300 flex flex-col font-sans selection:bg-sky-500 selection:text-white">
      {/* Sticky Navigation Header */}
      <LandingNavbar />

      {/* Main Content Sections */}
      <main className="flex-1">
        <LandingHero />
        <FeaturesSection />
        <InfrastructureShowcase />
        <AbrShowcaseSection />
      </main>

      {/* Prominent CTA Banner & Footer */}
      <LandingFooter />
    </div>
  );
}
