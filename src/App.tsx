  import { useEffect, useState } from 'react'
import { supabase } from '../lib/db/client'

function App() {
  const [status, setStatus] = useState('Connexion à la DB...')

  useEffect(() => {
    async function testDb() {
      const { error } = await supabase.from('test').select('*')
      if (error) {
        setStatus('✅ DB connectée ! La table "test" n\'existe pas encore')
      } else {
        setStatus('✅ DB connectée et table trouvée')
      }
    }
    testDb()
  }, [])

  return (
    <div style={{textAlign: 'center', padding: '50px'}}>
      <h1>PAYLOCA 🚀</h1>
      <p>{status}</p>
    </div>
  )
}
export default App
