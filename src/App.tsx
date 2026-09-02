import { useState, useEffect } from 'react'
import { supabase } from './lib/db/client'

function App() {
  const [page, setPage] = useState('login')
  const [user, setUser] = useState<any>(null)
  const [numero, setNumero] = useState('')
  const [code, setCode] = useState('')
  const [nom, setNom] = useState('')
  const [prenom, setPrenom] = useState('')
  const [posts, setPosts] = useState<any[]>([])
  const [typeCompte, setTypeCompte] = useState('jeune')

  useEffect(() => {
    const session = localStorage.getItem('payloca_user')
    if(session) { setUser(JSON.parse(session)); setPage('feed'); loadPosts() }
  }, [])

  async function loadPosts() {
    const { data } = await supabase.from('posts').select('*, profiles(*)').eq('categorie', typeCompte).order('created_at', {ascending: false})
    if(data) setPosts(data)
  }

  async function signup() {
    // 1. Créer user avec numéro comme email fake
    const fakeEmail = numero + '@payloca.com'
    const { data, error } = await supabase.auth.signUp({ 
      email: fakeEmail, 
      password: code, // le code = mot de passe
      options: { data: { nom, prenom, numero } }
    })
    if(!error) { 
      await supabase.from('profiles').insert([{id: data.user.id, nom, prenom, numero, type_compte: typeCompte}])
      alert("Compte créé! Connecte-toi avec ton numéro")
      setPage('login')
    } else alert(error.message)
  }

  async function login() {
    const fakeEmail = numero + '@payloca.com'
    const { data } = await supabase.auth.signInWithPassword({ email: fakeEmail, password: code })
    if(data.user) { 
      setUser(data.user); 
      localStorage.setItem('payloca_user', JSON.stringify(data.user))
      setPage('feed'); 
      loadPosts() 
    } else alert("Mauvais numéro ou code")
  }

  function payerVIP(mois: number) {
    const montant = mois === 1 ? 500 : 2000
    // Redirige vers Mynita
    window.location.href = `https://mynita.com/pay?montant=${montant}&ref=PAYLOCA_${user.id}`
    // Après paiement Mynita doit nous renvoyer ici avec ?status=success
  }

  // VÉRIFIER SI RETOUR DE MYNITA
  useEffect(() => {
    const url = new URL(window.location.href)
    if(url.searchParams.get('status') === 'success') {
      supabase.from('vip_payments').insert([{user_id: user.id, months: 1, amount: 500, status: 'paye'}])
      alert("VIP activé!")
    }
  }, [])

  // PAGE FEED TIKTOK AVEC FILTRE JEUNE/ADULTE
  if(page === 'feed') {
    return (
      <div style={{maxWidth: '500px', margin: 'auto', padding: '10px'}}>
        <div style={{display: 'flex', justifyContent: 'space-between'}}>
          <h1>PAYLOCA 🚀</h1>
          <select onChange={e => {setTypeCompte(e.target.value); loadPosts()}}>
            <option value="jeune">Jeunes</option>
            <option value="adulte">Adultes</option>
          </select>
        </div>
        <div style={{display: 'flex', gap: '5px'}}>
          <button onClick={() => setPage('post')}>+ Poster</button>
          <button onClick={() => setPage('chat')}>Chat</button>
          <button onClick={() => setPage('market')}>Market</button>
          <button onClick={() => setPage('vip')}>VIP 👑</button>
        </div>
        
        {posts.map(p => (
          <div key={p.id} style={{border: '1px solid #ccc', margin: '15px 0', borderRadius: '10px', padding: '10px'}}>
            <b>@{p.profiles?.prenom}</b>
            <p>{p.caption}</p>
            <div style={{background: '#000', height: '400px', borderRadius: '10px'}}>[VIDEO]</div>
            <p>❤️ {p.likes}</p>
          </div>
        ))}
      </div>
    )
  }

  // PAGE VIP AVEC MYNITA
  if(page === 'vip') {
    return (
      <div style={{padding: '20px', textAlign: 'center'}}>
        <h2>PASSE EN VIP 👑</h2>
        <div style={{border: '2px solid gold', padding: '20px'}}>
          <h3 onClick={() => payerVIP(1)}>1 Mois : 500 FCFA</h3>
          <h3 onClick={() => payerVIP(4)}>4 Mois : 2000 FCFA</h3>
          <p>Paiement via Mynita</p>
        </div>
        <button onClick={() => setPage('feed')}>Retour</button>
      </div>
    )
  }

  // PAGE LOGIN/SIGNUP AVEC NUMERO
  return (
    <div style={{textAlign: 'center', padding: '30px', maxWidth: '400px', margin: 'auto'}}>
      <h1>PAYLOCA 🚀</h1>
      {page === 'signup' ? (
        <>
          <h3>Inscription</h3>
          <input placeholder="Nom" onChange={e => setNom(e.target.value)} style={{width: '100%', padding: '10px', margin: '5px 0'}}/>
          <input placeholder="Prénom" onChange={e => setPrenom(e.target.value)} style={{width: '100%', padding: '10px', margin: '5px 0'}}/>
          <input placeholder="Numéro: 77xxxxxxx" onChange={e => setNumero(e.target.value)} style={{width: '100%', padding: '10px', margin: '5px 0'}}/>
          <input type="password" placeholder="Code secret" onChange={e => setCode(e.target.value)} style={{width: '100%', padding: '10px', margin: '5px 0'}}/>
          <select onChange={e => setTypeCompte(e.target.value)} style={{width: '100%', padding: '10px', margin: '5px 0'}}>
            <option value="jeune">Compte Jeune</option>
            <option value="adulte">Compte Adulte</option>
          </select>
          <button onClick={signup} style={{width: '100%', padding: '12px', background: 'green', color: 'white'}}>Créer compte</button>
          <p onClick={() => setPage('login')}>Déjà un compte?</p>
        </>
      ) : (
        <>
          <h3>Connexion</h3>
          <input placeholder="Numéro: 77xxxxxxx" onChange={e => setNumero(e.target.value)} style={{width: '100%', padding: '10px', margin: '5px 0'}}/>
          <input type="password" placeholder="Code secret" onChange={e => setCode(e.target.value)} style={{width: '100%', padding: '10px', margin: '5px 0'}}/>
          <button onClick={login} style={{width: '100%', padding: '12px', background: '#0070f3', color: 'white'}}>Se connecter</button>
          <p onClick={() => setPage('signup')}>Pas de compte?</p>
        </>
      )}
    </div>
  )
}
export default App
