import { useState, useEffect } from 'react'
import { supabase } from './lib/db/client'

function App() {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [msg, setMsg] = useState('')
  const [users, setUsers] = useState<any[]>([])

  // Charger les users au démarrage
  useEffect(() => { fetchUsers() }, [])

  async function fetchUsers() {
    const { data } = await supabase.from('users').select('*').order('created_at', {ascending: false})
    if(data) setUsers(data)
  }

  async function ajouterUser(e: any) {
    e.preventDefault()
    const { error } = await supabase.from('users').insert([{ email, name }])
    if (error) setMsg('❌ ' + error.message)
    else {
      setMsg('✅ Utilisateur ajouté!')
      setEmail('')
      setName('')
      fetchUsers() // Recharge la liste
    }
  }

  return (
    <div style={{padding: '30px', maxWidth: '500px', margin: 'auto'}}>
      <h1 style={{textAlign: 'center'}}>PAYLOCA 🚀</h1>
      
      <form onSubmit={ajouterUser} style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
        <input placeholder="Nom" value={name} onChange={e => setName(e.target.value)} style={{padding: '10px'}}/>
        <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} style={{padding: '10px'}}/>
        <button type="submit" style={{padding: '12px', background: '#0070f3', color: 'white', border: 'none'}}>Ajouter</button>
      </form>
      <p>{msg}</p>

      <h2 style={{marginTop: '40px'}}>Liste des Users: {users.length}</h2>
      {users.map(u => (
        <div key={u.id} style={{border: '1px solid #ddd', padding: '10px', margin: '5px 0', borderRadius: '5px'}}>
          <b>{u.name}</b> <br/> {u.email}
        </div>
      ))}
    </div>
  )
}
export default App

