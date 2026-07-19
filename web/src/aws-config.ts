import { Amplify } from 'aws-amplify'

type PublicAwsConfig = {
  region: string
  userPoolId: string
  userPoolClientId: string
}

function readConfig(): PublicAwsConfig {
  const config = {
    region: import.meta.env.VITE_AWS_REGION,
    userPoolId: import.meta.env.VITE_USER_POOL_ID,
    userPoolClientId: import.meta.env.VITE_USER_POOL_CLIENT_ID,
  }

  const missing = Object.entries(config)
    .filter(([, value]) => !value)
    .map(([key]) => key)

  if (missing.length > 0) {
    throw new Error(`Missing public AWS configuration: ${missing.join(', ')}`)
  }

  return config as PublicAwsConfig
}

export function configureAmplify() {
  const config = readConfig()

  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: config.userPoolId,
        userPoolClientId: config.userPoolClientId,
        signUpVerificationMethod: 'code',
        loginWith: {
          email: true,
        },
      },
    },
  })
}
