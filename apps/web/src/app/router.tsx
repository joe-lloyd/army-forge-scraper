import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import ComparisonPage from "@/pages/ComparisonPage";
import HomePage from "@/pages/HomePage";
import ArmyDetailPage from "@/pages/ArmyDetailPage";
import SystemCategoryPage from "@/pages/SystemCategoryPage";
import BalValExplanationPage from "@/pages/BalValExplanationPage";
import { Footer } from "@/components/layout/Footer";

export function AppRouter() {
  return (
    <Router>
      <div className="flex flex-col min-h-screen">
        <main className="flex-grow">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/compare" element={<ComparisonPage />} />
            <Route path="/math-hammer" element={<BalValExplanationPage />} />
            <Route path="/army/:systemId" element={<SystemCategoryPage />} />
            <Route path="/army/:systemId/:armyId" element={<ArmyDetailPage />} />
          </Routes>
        </main>
        <Footer />
      </div>
    </Router>
  );
}
