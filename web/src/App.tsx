import { Authenticator, ThemeProvider, createTheme } from '@aws-amplify/ui-react'
import './App.css'

const theme = createTheme({
  name: 'opportunity-scout',
  tokens: {
    colors: {
      background: {
        primary: { value: '#0B0F14' },
        secondary: { value: '#141B24' },
      },
      border: {
        primary: { value: '#2A3542' },
      },
      font: {
        primary: { value: '#E8EDF2' },
        secondary: { value: '#8B98A8' },
      },
      brand: {
        primary: {
          10: { value: '#00383d' },
          80: { value: '#00b9c6' },
          90: { value: '#00D9E8' },
          100: { value: '#58f2fc' },
        },
      },
    },
    components: {
      button: {
        borderRadius: { value: '6px' },
        primary: {
          backgroundColor: { value: '#00D9E8' },
          color: { value: '#0B0F14' },
        },
      },
      fieldcontrol: {
        borderRadius: { value: '6px' },
        borderColor: { value: '#2A3542' },
      },
    },
  },
})

function App() {
  return (
    <ThemeProvider theme={theme}>
      <main className="auth-shell">
        <Authenticator
          components={{
            Header() {
              return (
                <header className="auth-brand">
                  <span className="auth-mark" aria-hidden="true" />
                  <span>OPPORTUNITY SCOUT</span>
                </header>
              )
            },
            SignIn: {
              Header() {
                return <h1 className="auth-title">Sign in to your scout</h1>
              },
            },
            SignUp: {
              Header() {
                return <h1 className="auth-title">Create your scout</h1>
              },
            },
          }}
          formFields={{
            signIn: {
              username: {
                label: 'Email',
                placeholder: 'you@example.com',
              },
            },
            signUp: {
              email: {
                label: 'Email',
                order: 1,
                placeholder: 'you@example.com',
              },
              password: {
                order: 2,
              },
              confirm_password: {
                order: 3,
              },
            },
          }}
        >
          {({ signOut, user }) => (
            <section className="authenticated-panel">
              <p className="eyebrow">SCOUT STATUS / AUTHENTICATED</p>
              <h1>Calibrate your scout</h1>
              <p>
                Signed in as <span className="data">{user?.signInDetails?.loginId}</span>.
                Profile calibration is the next foundation step.
              </p>
              <button type="button" className="secondary-button" onClick={signOut}>
                Sign out
              </button>
            </section>
          )}
        </Authenticator>
      </main>
    </ThemeProvider>
  )
}

export default App
