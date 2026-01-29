import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

import Home from "./views/Home";
import ArmyDetail from "./views/ArmyDetail";
import ComparisonPage from "./pages/ComparisonPage";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/army/:systemId/:armyId" element={<ArmyDetail />} />
        <Route path="/compare" element={<ComparisonPage />} />
      </Routes>
    </Router>
  );
}

export default App;
