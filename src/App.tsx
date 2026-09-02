import { useState, useEffect } from 'react'
import { supabase } from './lib/db/client'
import './App.css' // On va créer le CSS

function App() {
  const [page, setPage] = useState('login')
  const [user, setUser] = useState<any>(null)
  const [numero, setNumero] = useState('77') // 77xxxxxxx
  const [code, setCode] = useState('')
  const [nom, setNom] = useState('')
  const [prenom, setPrenom] = useState('')
  const [posts, setPosts] = useState<any[]>([])
  const [typeCompte, setTypeCompte] = useState('jeune')
  const [otpEnvoye, setOtpEnvoye] = useState(false)

  useEffect(() => {
    const session = localStorage.getItem('payloca_user')
    if(session) { setUser(JSON.parse(session)); setPage('feed'); loadPosts() }
  }, [])

  async function loadPosts() {
    const { data } = await supabase.from('posts').select('*, profiles(*)').eq('categorie', typeCompte).order('created_at', {ascending: false})
    if(data) setPosts(data)
  }

  async function envoyerOTP() {
    const fullNumero = '+227' + numero
    // ICI ON ENVERRA VRAIMENT LE SMS VIA TWILIO PLUS TARD
    const codeGenere = Math.floor(100000 + Math.random() * 900000) // Code fake pour test
    alert(`Ton code OTP: ${codeGenere}`) // En attendant on affiche le code
    setCode(codeGenere.toString())
    setOtpEnvoye(true)
  }

  async function signup() {
    const fullNumero = '+227' + numero
    const fakeEmail = fullNumero + '@payloca.com'
    const { data, error } = await supabase.auth.signUp({ 
      email: fakeEmail, 
      password: code,
      options: { data: { nom, prenom, numero: fullNumero, type_compte: typeCompte } }
    })
    if(!error) { 
      await supabase.from('profiles').insert([{id: data.user.id, nom, prenom, numero: fullNumero, type_compte: typeCompte}])
      alert("Compte créé! Connecte-toi")
      setPage('login')
    } else alert(error.message)
  }

  async function login() {
    const fullNumero = '+227' + numero
    const fakeEmail = fullNumero + '@payloca.com'
    const { data } = await supabase.auth.signInWithPassword({ email: fakeEmail, password: code })
    if(data.user) { 
      setUser(data.user); 
      localStorage.setItem('payloca_user', JSON.stringify(data.user))
      setPage('feed'); 
      loadPosts() 
    } else alert("Mauvais numéro ou code")
  }

  // PAGE FEED STYLÉ
  if(page === 'feed') {
    return (
      <div className="app-container">
        <header className="header">
          <h1>PAYLOCA</h1>
          <div className="menu">
            <button onClick={() => setPage('post')}>+</button>
            <button onClick={() => setPage('chat')}>💬</button>
            <button onClick={() => setPage('market')}>🏠</button>
            <button onClick={() => setPage('vip')}>👑</button>
          </div>
        </header>
        <div className="filter">
          <button className={typeCompte==='jeune'?'active':''} onClick={() => {setTypeCompte('jeune'); loadPosts()}}>Jeunes</button>
          <button className={typeCompte==='adulte'?'active':''} onClick={() => {setTypeCompte('adulte'); loadPosts()}}>Adultes</button>
        </div>
        {posts.map(p => (
          <div key={p.id} className="post-card">
            <b>@{p.profiles?.prenom}</b>
            <p>{p.caption}</p>
            <div className="video-box">[VIDEO]</div>
          </div>
        ))}
      </div>
    )
  }

  // PAGE LOGIN/SIGNUP STYLÉ
  return (
    <div className="auth-container">
      <h1 className="logo">PAYLOCA 🚀</h1>
      <div className="auth-card">
      {page === 'signup' ? (
        <>
          <h2>Créer un compte</h2>
          <input placeholder="Nom" onChange={e => setNom(e.target.value)}/>
          <input placeholder="Prénom" onChange={e => setPrenom(e.target.value)}/>
          <div className="phone-input">
            <span>+227</span>
            <input placeholder="77 12 34 56" maxLength={8} onChange={e => setNumero(e.target.value)}/>
          </div>
          {!otpEnvoye ? (
            <button className="btn-primary" onClick={envoyerOTP}>Envoyer code</button>
          ) : (
            <>
              <input placeholder="Code reçu par SMS" onChange={e => setCode(e.target.value)}/>
              <select onChange={e => setTypeCompte(e.target.value)}>
                <option value="jeune">Compte Jeune</option>
                <option value="adulte">Compte Adulte</option>
              </select>
              <button className="btn-primary" onClick={signup}>Valider et Créer</button>
            </>
          )}
          <p onClick={() => setPage('login')}>Déjà un compte?</p>
        </>
      ) : (
        <>
          <h2>Connexion</h2>
          <div className="phone-input">
            <span>+227</span>
            <input placeholder="77 12 34 56" maxLength={8} onChange={e => setNumero(e.target.value)}/>
          </div>
          <input type="password" placeholder="Code secret" onChange={e => setCode(e.target.value)}/>
          <button className="btn-primary" onClick={login}>Se connecter</button>
          <p onClick={() => setPage('signup')}>Pas de compte?</p>
        </>
      )}
      </div>
    </div>
  )
}
export default App
