const phaseItems = [
  "API provider setup",
  "Model discovery",
  "Text-to-image generation",
  "Image-to-image generation"
];

export function App() {
  return (
    <main className="app-shell">
      <header className="top-bar">
        <div>
          <p className="eyebrow">Phase 0 scaffold</p>
          <h1>image2 Tool</h1>
        </div>
        <span className="status-pill">Local workspace</span>
      </header>

      <section className="workspace" aria-labelledby="workspace-title">
        <div className="intro">
          <h2 id="workspace-title">Generation workbench</h2>
          <p>
            The application shell is ready. Provider configuration, model
            selection, and image generation controls will land in the next
            phases.
          </p>
        </div>

        <div className="phase-grid" aria-label="Upcoming milestones">
          {phaseItems.map((item) => (
            <article className="phase-card" key={item}>
              <span />
              <p>{item}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
