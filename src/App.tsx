import { useState } from 'react'
import { supabase } from './lib/db/client'

function App() {
  const [msg, setMsg] = useState('')

  async function addUser() {
    const { data, error } = await supabase.from('users').insert([
      { email: 'test@payloca.com', name: 'Test User' }
    ]).select()
    
    if (error) setMsg('❌ Erreur: ' + error.message)
    else setMsg('✅ Ajouté! ' + data[0].email)
  }

  return (
    <div style={{textAlign: 'center', padding: '50px'}}>
      <h1>PAYLOCA 🚀</h1>
      <button onClick={addUser} style={{padding: '15px 30px', background: '#0070f3', color: 'white', border: 'none', borderRadius: '8px'}}>
        Ajouter utilisateur test
      </button>
      <p style={{marginTop: '20px'}}>{msg}</p>
    </div>
  )
}
export default App

