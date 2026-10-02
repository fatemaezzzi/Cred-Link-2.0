import { agent } from './agent'

async function main() {
  try {
    const issuer = await agent.didManagerCreate()
    const student = await agent.didManagerCreate()

    console.log('Issuer DID:', issuer.did)
    console.log('Student DID:', student.did)

    const credential = await agent.createVerifiableCredential({
      credential: {
        issuer: { id: issuer.did },
        credentialSubject: {
          id: student.did,
          degree: 'Bachelor of Technology',
          institution: 'DJSCE Demo University',
          graduationYear: 2026,
        },
      },
      proofFormat: 'jwt',
    })

    console.log('Issued credential:', JSON.stringify(credential, null, 2))
    const result = await agent.verifyCredential({ credential })
console.log('Verification result:', result.verified)
  } catch (err) {
    console.error('ERROR:', err)
  }
}

main()