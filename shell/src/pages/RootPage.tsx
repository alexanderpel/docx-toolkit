import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { DemoPage } from "./DemoPage";

// `/` route. If `?demo=1` is present, render the demo. Otherwise show a
// help screen that explains how the shell is meant to be used.
export const RootPage = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const params = new URLSearchParams(location.search);
  const demo = params.get("demo");

  useEffect(() => {
    if (demo === "1") return;
    document.title = "docx-iframe-shell";
  }, [demo]);

  if (demo === "1") return <DemoPage />;

  return (
    <div className="docx-shell-home">
      <h1>docx-iframe-shell</h1>
      <p>
        This is an AGPL-licensed, iframe-embeddable docx editor. It is not a component of any
        proprietary application — it speaks <code>postMessage</code> to whoever embeds it.
      </p>
      <p>
        Try the standalone demo:{" "}
        <button type="button" onClick={() => navigate("/?demo=1")}>
          /?demo=1
        </button>
      </p>
      <p>
        Or embed it via iframe and post an <code>init</code> message — see{" "}
        <code>src/bridge/types.ts</code> for the protocol.
      </p>
      <footer>
        <a
          href="https://github.com/Harbour-Enterprises/SuperDoc"
          target="_blank"
          rel="noreferrer noopener"
        >
          Built on SuperDoc (AGPL-3.0)
        </a>
        {" · "}
        <a href="./LICENSE" target="_blank" rel="noreferrer noopener">
          AGPL-3.0-or-later
        </a>
        {" · "}
        <a
          href="https://github.com/alexanderpel/docx-toolkit"
          target="_blank"
          rel="noreferrer noopener"
        >
          Source
        </a>
      </footer>
    </div>
  );
};
