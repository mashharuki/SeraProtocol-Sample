import { BrowserRouter, Routes, Route } from "react-router";
import { Layout } from "./components/layout/Layout";
import { DashboardPage } from "./pages/DashboardPage";
import { TradingPage } from "./pages/TradingPage";
import { MyOrdersPage } from "./pages/MyOrdersPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="trade" element={<TradingPage />} />
          <Route path="orders" element={<MyOrdersPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
