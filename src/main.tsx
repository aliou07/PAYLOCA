import React from 'react'
import ReactDOM from 'react-dom/client'

function Application() {
  return (
    <div style={{padding: '40px', textAlign: 'center'}}>
      <h1>PAYLOCA</h1>
      <p>Votre site est en ligne !</p>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Application />
  </React.StrictMode>,
)
