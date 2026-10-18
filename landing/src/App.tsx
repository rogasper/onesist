import { Agents } from "./components/Agents";
import { BuiltFor } from "./components/BuiltFor";
import { Changelog } from "./components/Changelog";
import { ComingSoon } from "./components/ComingSoon";
import { Download } from "./components/Download";
import { Footer } from "./components/Footer";
import { Hero } from "./components/Hero";
import { HowItWorks } from "./components/HowItWorks";
import { Nav } from "./components/Nav";
import { Screens } from "./components/Screens";
import { Workspace } from "./components/Workspace";

export default function App() {
  return (
    <div className="min-h-screen overflow-x-clip bg-[#fcfcfa] text-zinc-900 antialiased selection:bg-[#6d7cff]/10">
      <Nav />
      <Hero />
      <BuiltFor />
      <HowItWorks />
      <Agents />
      <Workspace />
      <Screens />
      <ComingSoon />
      <Download />
      <Changelog />
      <Footer />
    </div>
  );
}
