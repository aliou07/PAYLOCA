import React from 'react'
import ReactDOM from 'react-dom/client'

function App() {
  return (
    <div style={{padding: '40px', textAlign: 'center'}}>
      <h1>PAYLOCA 🚀</h1>
      <p>Le site est en ligne !</p>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
