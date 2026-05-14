import { BrowserRouter, Route, Routes } from "react-router-dom";

import { EditPage } from "./pages/EditPage";
import { PreviewPage } from "./pages/PreviewPage";
import { RootPage } from "./pages/RootPage";

export const App = () => (
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<RootPage />} />
      <Route path="/edit/:documentId" element={<EditPage />} />
      <Route path="/preview/:documentId" element={<PreviewPage />} />
      <Route path="*" element={<RootPage />} />
    </Routes>
  </BrowserRouter>
);
