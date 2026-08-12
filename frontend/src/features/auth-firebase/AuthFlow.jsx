import { useState } from 'react'
import Login from './Login'
import Register from './Register'
import ForgotPassword from './ForgotPassword'

/**
 * AuthFlow.jsx — optional convenience wrapper that switches between the
 * three screens without needing react-router. Drop <AuthFlow /> anywhere
 * you'd render an auth page.
 *
 * If you already use react-router (this project has react-router-dom
 * installed), you'll likely prefer wiring Login / Register / ForgotPassword
 * to their own routes instead and passing navigate() into onSuccess /
 * onGoToRegister / onGoToLogin / onForgotPassword / onBackToLogin. Example:
 *
 *   <Route path="/login" element={
 *     <Login
 *       onSuccess={(user) => navigate('/')}
 *       onGoToRegister={() => navigate('/register')}
 *       onForgotPassword={() => navigate('/forgot-password')}
 *     />
 *   } />
 */
function AuthFlow({ onSuccess }) {
  const [screen, setScreen] = useState('login') // 'login' | 'register' | 'forgot'

  if (screen === 'register') {
    return (
      <Register
        onSuccess={onSuccess}
        onGoToLogin={() => setScreen('login')}
      />
    )
  }

  if (screen === 'forgot') {
    return <ForgotPassword onBackToLogin={() => setScreen('login')} />
  }

  return (
    <Login
      onSuccess={onSuccess}
      onGoToRegister={() => setScreen('register')}
      onForgotPassword={() => setScreen('forgot')}
    />
  )
}

export default AuthFlow
