import './App.css'

function App() {
  return (
    <main className="game-page">
      <section className="game-panel">
        <h1>Tibia Wave Browser</h1>

        <div className="battlefield">
          <div className="player">🛡️ Player</div>
          <div className="monster">🐀 Rat</div>
        </div>

        <button>Start Wave</button>
      </section>
    </main>
  )
}

export default App