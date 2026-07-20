import type { LambdaFunctionURLEvent, LambdaFunctionURLResult } from 'aws-lambda'
import { CognitoJwtVerifier } from 'aws-jwt-verify'
import { z } from 'zod'
import { runtimeConfig } from './config.js'

let verifier: ReturnType<typeof CognitoJwtVerifier.create> | undefined

const getVerifier = () => {
  verifier ??= CognitoJwtVerifier.create({
    userPoolId: runtimeConfig.userPoolId(),
    tokenUse: 'access',
    clientId: runtimeConfig.userPoolClientId(),
  })
  return verifier
}

export const getBearerToken = (event: LambdaFunctionURLEvent): string => {
  const authorization = event.headers.authorization
  const match = /^Bearer\s+(.+)$/i.exec(authorization ?? '')
  if (!match?.[1]) {
    throw new HttpError(401, 'A valid access token is required.')
  }
  return match[1]
}

export const requireUserId = async (event: LambdaFunctionURLEvent): Promise<string> => {
  const payload = await getVerifier().verify(getBearerToken(event))
  if (!payload.sub) {
    throw new HttpError(401, 'The access token has no subject claim.')
  }
  return payload.sub
}

export const parseJsonBody = <T>(
  event: LambdaFunctionURLEvent,
  schema: z.ZodType<T>,
): T => {
  if (!event.body) throw new HttpError(400, 'A JSON request body is required.')
  const decoded = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body
  if (Buffer.byteLength(decoded, 'utf8') > 100_000) {
    throw new HttpError(413, 'The request body exceeds the 100 KB limit.')
  }
  try {
    return schema.parse(JSON.parse(decoded))
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new HttpError(400, 'The request body is invalid.')
    }
    if (error instanceof SyntaxError) {
      throw new HttpError(400, 'The request body must be valid JSON.')
    }
    throw error
  }
}

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message)
  }
}

export const jsonResponse = (
  statusCode: number,
  body: unknown,
): LambdaFunctionURLResult => ({
  statusCode,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  },
  body: JSON.stringify(body),
})

export const handleHttpError = (error: unknown): LambdaFunctionURLResult => {
  if (error instanceof HttpError) {
    return jsonResponse(error.statusCode, { error: error.message })
  }
  console.error(
    JSON.stringify({
      event: 'request_failed',
      error: error instanceof Error ? error.message : String(error),
    }),
  )
  return jsonResponse(500, { error: 'The request could not be completed.' })
}
