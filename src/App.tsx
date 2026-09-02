  import { useState } from 'react'
import { supabase } from './lib/db/client'

function App() {
  const [msg, setMsg] = useState('Clique pour ajouter un utilisateur test')

  async function ajouterUser() {
    const { data, error } = await supabase.from('users').insert([
      { email: 'test@payloca.com', name: 'Aliou Test' }
    ]).select()

    if (error) setMsg('❌ Erreur: ' + error.message)
    else setMsg('✅ Utilisateur ajouté! ID: ' + data[0].id)
  }

  return (
    <div style={{textAlign: 'center', padding: '50px', fontFamily: 'Arial'}}>
      <h1>PAYLOCA 🚀</h1>
      <button 
        onClick={ajouterUser} 
        style={{padding: '15px 30px', background: '#0070f3', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '16px'}}
      >
        Ajouter Utilisateur Test
      </button>
      <p style={{marginTop: '20px', fontSize: '18px'}}>{msg}</p>
    </div>
  )
}
export default App

