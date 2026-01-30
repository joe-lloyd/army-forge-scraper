import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

import ComparisonPage from "./pages/ComparisonPage";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<ComparisonPage />} />
      </Routes>
    </Router>
  );
}

export default App;
