import { useState } from 'react'
import { supabase } from './lib/db/client'

function App() {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [msg, setMsg] = useState('')

  async function ajouterUser(e: any) {
    e.preventDefault()
    const { error } = await supabase.from('users').insert([{ email, name }])
    if (error) setMsg('❌ ' + error.message)
    else {
      setMsg('✅ Utilisateur ajouté!')
      setEmail('')
      setName('')
    }
  }

  return (
    <div style={{textAlign: 'center', padding: '30px', maxWidth: '400px', margin: 'auto'}}>
      <h1>PAYLOCA 🚀</h1>
      <form onSubmit={ajouterUser} style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
        <input 
          type="text" 
          placeholder="Nom" 
          value={name} 
          onChange={e => setName(e.target.value)}
          style={{padding: '10px', borderRadius: '5px', border: '1px solid #ccc'}}
        />
        <input 
          type="email" 
          placeholder="Email" 
          value={email} 
          onChange={e => setEmail(e.target.value)}
          style={{padding: '10px', borderRadius: '5px', border: '1px solid #ccc'}}
        />
        <button type="submit" style={{padding: '12px', background: '#0070f3', color: 'white', border: 'none', borderRadius: '5px'}}>
          Ajouter Utilisateur
        </button>
      </form>
      <p style={{marginTop: '20px'}}>{msg}</p>
    </div>
  )
}
export default App

